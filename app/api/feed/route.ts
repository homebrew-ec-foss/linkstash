import { NextRequest, NextResponse } from 'next/server';
import { client, initDb } from '../../../scripts/db';
import { logger } from '../../../lib/logger';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRssDate(ts: number): string {
  return new Date(ts).toUTCString();
}

function buildRssXml(items: string, origin: string): string {
  return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<?xml-stylesheet href="${origin}/feed.xsl" type="text/xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>HSP Linkstash</title>
    <link>${origin}</link>
    <description>linkstash is a small experiment for collecting and sharing interesting links and articles you find during the week</description>
    <language>en</language>
    <webMaster>mail@hsp-ec.xyz</webMaster>
    <lastBuildDate>${formatRssDate(Date.now())}</lastBuildDate>
    <atom:link href="${origin}/api/feed" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;
}

function buildItemXml(link: {
  id: string;
  url: string;
  domain: string;
  ts: number;
  count: number;
  title: string;
  submittedBy?: string;
  roomComment?: string;
  tags?: string[];
  summary?: string;
  content?: string;
}): string {
  const descParts: string[] = [];

  if (link.roomComment) {
    descParts.push(`<strong>Room:</strong> ${escapeXml(link.roomComment)}`);
  }

  descParts.push(`<strong>Domain:</strong> ${escapeXml(link.domain)}`);
  descParts.push(`<strong>Votes:</strong> ${link.count}`);

  if (link.content) {
    descParts.push(escapeXml(link.content));
  } else if (link.summary) {
    descParts.push(escapeXml(link.summary));
  }

  const description = descParts.join('<br/>\n');

  const categories = (link.tags || [])
    .map(t => `      <category>${escapeXml(t)}</category>`)
    .join('\n');

  const roomCategory = link.roomComment
    ? `\n      <category>${escapeXml(link.roomComment)}</category>`
    : '';

  const author = link.submittedBy
    ? `\n      <author>${escapeXml(link.submittedBy)}</author>`
    : '';

  return `    <item>
      <title>${escapeXml(link.title)}</title>
      <link>${escapeXml(link.url)}</link>
      <pubDate>${formatRssDate(link.ts)}</pubDate>${author}
      <guid>${escapeXml(link.id)}</guid>
      <description>${description}</description>${categories}${roomCategory}
    </item>`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await initDb();

    const mode = request.nextUrl.searchParams.get('mode') || 'latest';
    const limit = Math.min(
      Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)),
      200
    );

    let orderClause = 'ORDER BY li.ts DESC';
    if (mode === 'top') {
      orderClause = 'ORDER BY l.count DESC, li.ts DESC';
    }

    const result = await client.execute({
      sql: `SELECT l.id, l.url, l.content, li.domain, l.submitted_by, li.ts, l.count, COALESCE(l.meta, li.meta) as meta
            FROM link_index li
            LEFT JOIN links l ON l.id = li.link_id
            ${orderClause}
            LIMIT ?`,
      args: [limit],
    });

    const items = result.rows.map(row => {
      const rowMeta = row.meta ? JSON.parse(row.meta as string) : {};

      let meta: Record<string, any> = {};
      if (typeof rowMeta === 'object' && rowMeta !== null) {
        meta = rowMeta;
      }

      const submittedBy = (meta.submittedBy as string) || (row.submitted_by as string) || undefined;
      const roomComment = meta.roomComment as string | undefined;
      const tags = Array.isArray(meta.tags) ? meta.tags as string[] : undefined;
      const metaTitle = (meta.title as string) || (meta.name as string) || '';
      const summary = meta.summary as string | undefined;
      const url = (meta.url as string) || (row.url as string) || '';
      const domain = (meta.domain as string) || (row.domain as string) || '';

      const title = metaTitle || domain || url || 'Untitled';

      return buildItemXml({
        id: row.id as string,
        url,
        domain,
        ts: row.ts as number,
        count: row.count as number,
        title,
        submittedBy,
        roomComment,
        tags,
        summary,
        content: (row.content as string) || undefined,
      });
    });

    const origin = request.nextUrl.origin;
    const xml = buildRssXml(items.join('\n'), origin);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600, s-maxage=600',
      },
    });
  } catch (error) {
    logger.error('Error generating RSS feed', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
