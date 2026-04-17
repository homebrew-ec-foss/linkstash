import { NextRequest, NextResponse } from 'next/server';
import { client, initDb } from '../../../../scripts/db';
import { buildSemanticSource, embedText, embeddingToJson, hashSource } from '../../../../lib/semantic';

type LinkRow = {
    id: string;
    url: string;
    domain: string;
    content: string;
    ts: number;
    count: number;
    meta: string | null;
    source_hash?: string | null;
};

function parseMeta(metaRaw: string | null | undefined): Record<string, any> {
    if (!metaRaw) return {};
    try {
        const parsed = JSON.parse(metaRaw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function normalizeCandidate(row: any) {
    const meta = parseMeta(row.meta as string | null);
    const url = (meta.url || row.url || '') as string;
    let domain = (meta.domain || row.domain || '') as string;
    if (!domain && url) {
        try { domain = new URL(url).hostname; } catch (e) { domain = ''; }
    }
    return {
        id: String(row.id || ''),
        url,
        domain,
        title: (meta.title || meta.name || url || 'Untitled') as string,
        roomComment: (meta.roomComment || '').toString(),
        count: Number(row.count || 0),
        ts: Number(row.ts || 0),
    };
}

async function buildRowWithSource(id: string): Promise<{ row: LinkRow; sourceText: string; sourceHash: string } | null> {
    const result = await client.execute({
        sql: `SELECT l.id, l.url, l.domain, l.content, l.ts, l.count, COALESCE(l.meta, li.meta) AS meta, le.source_hash
          FROM links l
          LEFT JOIN link_index li ON li.link_id = l.id
          LEFT JOIN link_embeddings le ON le.link_id = l.id
          WHERE l.id = ?
          LIMIT 1`,
        args: [id],
    });

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as any as LinkRow;
    const meta = parseMeta(row.meta);
    const sourceText = buildSemanticSource({
        title: meta.title || meta.name,
        url: meta.url || row.url,
        domain: meta.domain || row.domain,
        content: row.content || '',
        roomComment: meta.roomComment,
        tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    });
    const sourceHash = hashSource(sourceText);

    return { row, sourceText, sourceHash };
}

async function upsertEmbedding(linkId: string, sourceText: string, sourceHash: string, ts: number) {
    const vecJson = embeddingToJson(embedText(sourceText));
    await client.execute({
        sql: `INSERT INTO link_embeddings (link_id, embedding, source_hash, ts)
          VALUES (?, vector32(?), ?, ?)
          ON CONFLICT(link_id) DO UPDATE SET
            embedding = excluded.embedding,
            source_hash = excluded.source_hash,
            ts = excluded.ts`,
        args: [linkId, vecJson, sourceHash, ts],
    });
}

async function ensureEmbeddingForLink(id: string) {
    const prepared = await buildRowWithSource(id);
    if (!prepared) return null;

    if (prepared.row.source_hash !== prepared.sourceHash) {
        await upsertEmbedding(prepared.row.id, prepared.sourceText, prepared.sourceHash, Date.now());
    }

    return prepared;
}

async function ensureRecentEmbeddings(limit = 40) {
    const missing = await client.execute({
        sql: `SELECT l.id
          FROM links l
          LEFT JOIN link_embeddings le ON le.link_id = l.id
          WHERE le.link_id IS NULL
          ORDER BY l.ts DESC
          LIMIT ?`,
        args: [limit],
    });

    for (const row of missing.rows) {
        const id = String(row.id || '');
        if (!id) continue;
        const prepared = await buildRowWithSource(id);
        if (!prepared) continue;
        await upsertEmbedding(prepared.row.id, prepared.sourceText, prepared.sourceHash, Date.now());
    }
}

function toSuggestion(row: any) {
    const candidate = normalizeCandidate(row);
    const distance = Number(row.distance || 0);
    const score = Math.max(0, Math.min(1, 1 - distance));

    return {
        ...candidate,
        score: Number(score.toFixed(4)),
    };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ key: string }> }
) {
    const { key } = await params;
    if (!key) {
        return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    try {
        await initDb();

        const current = await ensureEmbeddingForLink(key);
        if (!current) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        await ensureRecentEmbeddings(50);

        let relatedRows: any[] = [];
        try {
            const related = await client.execute({
                sql: `SELECT l.id, l.url, l.domain, l.ts, l.count, COALESCE(l.meta, li.meta) AS meta,
                     vector_distance_cos(le.embedding, q.embedding) AS distance
              FROM link_embeddings le
              JOIN links l ON l.id = le.link_id
              LEFT JOIN link_index li ON li.link_id = l.id
              JOIN (SELECT embedding FROM link_embeddings WHERE link_id = ?) q
              WHERE le.link_id <> ?
              ORDER BY distance ASC
              LIMIT 24`,
                args: [key, key],
            });
            relatedRows = related.rows as any[];
        } catch (e) {
            // Safe fallback if vector functions are unavailable.
            const fallback = await client.execute({
                sql: `SELECT l.id, l.url, l.domain, l.ts, l.count, COALESCE(l.meta, li.meta) AS meta,
                     1.0 AS distance
              FROM links l
              LEFT JOIN link_index li ON li.link_id = l.id
              WHERE l.id <> ?
              ORDER BY l.count DESC, l.ts DESC
              LIMIT 24`,
                args: [key],
            });
            relatedRows = fallback.rows as any[];
        }

        const related = relatedRows.map(toSuggestion);

        const groupCounts = new Map<string, number>();
        for (const item of related) {
            const room = item.roomComment && String(item.roomComment).trim()
                ? String(item.roomComment).trim()
                : 'Unknown room';
            const domain = item.domain || 'Unknown domain';
            const roomKey = `Room: ${room}`;
            const domainKey = `Domain: ${domain}`;
            groupCounts.set(roomKey, (groupCounts.get(roomKey) || 0) + 1);
            groupCounts.set(domainKey, (groupCounts.get(domainKey) || 0) + 1);
        }

        const groups = Array.from(groupCounts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        return NextResponse.json({
            sourceId: key,
            related,
            groups,
        });
    } catch (error) {
        console.error('Error in related endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
