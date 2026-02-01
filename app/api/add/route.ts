import { NextRequest, NextResponse } from 'next/server';
import { client, initDb, LinkRecord } from '../../../scripts/db';

interface ExistingLinkEntry extends LinkRecord {
}

interface AddRequestBody {
    link: {
        url: string;
        submittedBy?: string;
        submitted_by?: string;
    } | string;
    room?: {
        id?: string;
        comment?: string;
        room_id?: string;
        room_comment?: string;
    };
}

export async function POST(request: NextRequest) {
    // Initialize database if needed
    await initDb();

    // Normalize URL for consistent deduping
    const normalizeUrl = (u: string): string => {
        try {
            const nu = new URL(u);
            // strip trailing slashes from pathname
            const path = nu.pathname.replace(/\/+$/, '');
            // keep origin + path + search
            return nu.origin + (path || '/') + nu.search;
        } catch (e) {
            return u.replace(/\/+$/, '');
        }
    };

    // helper to extract tags from frontmatter
    const extractTags = (frontmatter: any): string[] => {
        if (!frontmatter) return [];
        const t = frontmatter.tags || frontmatter.tag || frontmatter.tags_list;
        if (!t) return [];
        if (Array.isArray(t)) return t.map(String).map(s => s.trim().toLowerCase()).filter(Boolean);
        return String(t).split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    };


    // Check auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== process.env.AUTH_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse JSON body and validate shape
    let body: AddRequestBody;
    try {
        body = await request.json();
    } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { link, room } = body as AddRequestBody;
    if (!link) {
        return NextResponse.json({ error: 'Missing link' }, { status: 400 });
    }

    // Determine URL and submitter
    let urlStr: string | null = null;
    if (typeof link === 'string') {
        urlStr = link;
    } else if (link && typeof link.url === 'string') {
        urlStr = link.url;
    }

    if (!urlStr) {
        return NextResponse.json({ error: 'Missing link URL' }, { status: 400 });
    }

    try {
        // validate URL
        // this will throw if invalid
        new URL(urlStr);
    } catch (e) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const submitter = (typeof link === 'object' && link ? (link.submittedBy || (link as any).submitted_by) : null) || null;
    const roomId = room ? (room.id || (room as any).room_id) : undefined;
    const roomComment = room ? (room.comment || (room as any).room_comment) : undefined;

    try {
        // Ensure LAVA_URL is configured
        if (!process.env.LAVA_URL) {
            console.error('LAVA_URL is not set in environment; cannot forward to lava parser');
            return NextResponse.json({ error: 'LAVA_URL not configured' }, { status: 502 });
        }

        // Forward to lava parser API
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.AUTH_KEY) {
            headers['Authorization'] = 'Bearer ' + process.env.AUTH_KEY;
        }

        // Upstream lava expects simple URL strings in the `links` array.
        const forwardedLinks = [urlStr];

        const apiRes = await fetch(process.env.LAVA_URL + '/api', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                links: forwardedLinks,
                returnFormat: 'json',
                parser: 'jsdom',
                saveToDisk: false
            })
        });

        // Guard against non-OK responses from the upstream lava API
        if (!apiRes.ok) {
            const txt = await apiRes.text();
            console.error('lava API returned error', apiRes.status, txt);
            if (apiRes.status === 400) {
                // Provide a clearer message when upstream rejects the link shape
                return NextResponse.json({ error: 'Upstream rejected link: ensure you are sending a URL string (not an object)', details: txt }, { status: 400 });
            }
            return NextResponse.json({ error: 'Upstream error', status: apiRes.status, details: txt }, { status: 502 });
        }

        const data = await apiRes.json();
        if (!Array.isArray(data)) {
            console.error('Unexpected response shape from lava API:', data);
            return NextResponse.json({ error: 'Invalid response from upstream' }, { status: 502 });
        }

        // Build a map of existing normalized URLs
        const existingMap: Record<string, ExistingLinkEntry> = {};
        const existingLinks = await client.execute({
            sql: 'SELECT id, url, domain, content, submitted_by, ts, count, meta FROM links',
            args: []
        });

        for (const row of existingLinks.rows) {
            if (!row.url) continue;
            const n = normalizeUrl(row.url as string);
            if (!n) continue;
            existingMap[n] = {
                id: row.id as string,
                url: row.url as string,
                domain: row.domain as string,
                content: row.content as string,
                submittedBy: row.submitted_by as string,
                ts: row.ts as number,
                count: row.count as number,
                meta: row.meta ? JSON.parse(row.meta as string) : {}
            };
        }

        for (const item of data) {
            if (!item || typeof item.url !== 'string') {
                console.warn('Skipping upstream item with invalid or missing url', item);
                continue;
            }
            const nurl = normalizeUrl(item.url);
            if (!nurl) {
                console.warn('Skipping upstream item with un-normalizable url', item.url);
                continue;
            }
            const now = Date.now();
            if (existingMap[nurl]) {
                // increment count (upvote) and update timestamp
                const entry = existingMap[nurl];
                const newCount = (entry.count || 1) + 1;

                // Merge existing meta with upstream frontmatter when empty
                let meta = entry.meta || {};
                if (item.frontmatter && Object.keys(meta).length === 0) {
                    meta = item.frontmatter;
                }

                // Include submitter and room info in meta
                if (submitter) {
                    meta.submittedBy = submitter;
                } else if (!meta.submittedBy && entry.submittedBy) {
                    meta.submittedBy = entry.submittedBy;
                }
                if (roomId) meta.roomId = roomId;
                if (roomComment) meta.roomComment = roomComment;

                // Record tags in meta (no separate tag table)
                const tags = extractTags(item.frontmatter);
                if (tags.length > 0) {
                    meta.tags = tags;
                }

                // Update content inline if provided
                let contentToSet = entry.content;
                if (item.body) {
                    contentToSet = item.body;
                }

                await client.execute({
                    sql: 'UPDATE links SET count = ?, ts = ?, meta = ?, content = ?, submitted_by = ? WHERE id = ?',
                    args: [newCount, now, JSON.stringify(meta), contentToSet || null, submitter, entry.id]
                });

                // Ensure meta includes canonical URL
                try {
                    if (!meta.url) meta.url = item.url;
                } catch (e) {
                    // ignore
                }

                // Upsert lightweight index entry for fast lookups
                try {
                    const domain = (function () { try { return new URL(item.url).hostname } catch (e) { return '' } })();
                    await client.execute({
                        sql: 'INSERT OR REPLACE INTO link_index (link_id, normalized_url, domain, meta, ts) VALUES (?, ?, ?, ?, ?)',
                        args: [entry.id, nurl, domain, JSON.stringify(meta), now]
                    });
                } catch (e) {
                    console.warn('Failed to upsert link_index for', entry.id, e);
                }
            } else {
                const id = crypto.randomUUID();
                const meta = item.frontmatter || {};

                // Ensure submitter & room info recorded in meta
                if (submitter) {
                    meta.submittedBy = submitter;
                }
                if (roomId) meta.roomId = roomId;
                if (roomComment) meta.roomComment = roomComment;

                // record tags in meta (replacing separate tag table)
                const tags = extractTags(item.frontmatter);
                if (tags.length > 0) {
                    meta.tags = tags;
                }

                const contentVal = item.body || null;

                await client.execute({
                    sql: 'INSERT INTO links (id, url, domain, content, submitted_by, ts, count, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    args: [id, item.url, new URL(item.url).hostname, contentVal, submitter, now, 1, JSON.stringify(meta)]
                });

                // Ensure meta includes canonical URL
                try { if (!meta.url) meta.url = item.url; } catch (e) { }

                // Upsert into link_index for fast metadata lookups (no `url` column)
                try {
                    const domain = (function () { try { return new URL(item.url).hostname } catch (e) { return '' } })();
                    await client.execute({
                        sql: 'INSERT OR REPLACE INTO link_index (link_id, normalized_url, domain, meta, ts) VALUES (?, ?, ?, ?, ?)',
                        args: [id, nurl, domain, JSON.stringify(meta), now]
                    });
                } catch (e) {
                    console.warn('Failed to insert into link_index for', id, e);
                }


            }
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error in add endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}