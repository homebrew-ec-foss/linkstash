import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getClient, initDb } from '$lib/server/db';
import { logger } from '$lib/logger';

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
    <link>${escapeXml(origin)}</link>
    <description>linkstash is a small experiment for collecting and sharing interesting links and articles you find during the week</description>
    <language>en</language>
    <webMaster>mail@hsp-ec.xyz</webMaster>
    <lastBuildDate>${formatRssDate(Date.now())}</lastBuildDate>
    <atom:link href="${escapeXml(origin)}/api/feed" rel="self" type="application/rss+xml" />
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
	roomComment?: string;
	summary?: string;
}): string {
	// Description is just the content or summary
	const description = link.summary || '';

	// Author is the room name
	const author = link.roomComment
		? `\n      <author>${escapeXml(link.roomComment)}</author>`
		: '';

	return `    <item>
      <title>${escapeXml(link.title)}</title>
      <link>${escapeXml(link.url)}</link>
      <pubDate>${formatRssDate(link.ts)}</pubDate>${author}
      <guid>${escapeXml(link.id)}</guid>
      <description>${escapeXml(description)}</description>
    </item>`;
}

/**
 * GET /api/feed
 * RSS 2.0 feed of the latest links, newest first.
 * Supports `mode` (`latest`, `top`) and `limit` (max 200).
 */
export const GET: RequestHandler = async (event) => {
	try {
		await initDb();

		const search = event.url.searchParams;
		const mode = search.get('mode') || 'latest';
		const rawLimit = parseInt(search.get('limit') || '50', 10);
		const limit = Number.isFinite(rawLimit)
			? Math.min(Math.max(1, rawLimit), 200)
			: 50;

		const orderClause = mode === 'top' ? 'ORDER BY l.count DESC, li.ts DESC' : 'ORDER BY li.ts DESC';

		const result = await getClient().execute({
			sql: `SELECT l.id, l.url, l.content, li.domain, l.submitted_by, li.ts, l.count, COALESCE(l.meta, li.meta) AS meta
            FROM link_index li
            LEFT JOIN links l ON l.id = li.link_id
            ${orderClause}
            LIMIT ?`,
			args: [limit]
		});

		const items = result.rows.map((row: any) => {
			const rowMeta = row.meta ? JSON.parse(row.meta as string) : {};

			let meta: Record<string, any> = {};
			if (typeof rowMeta === 'object' && rowMeta !== null) {
				meta = rowMeta;
			}

			const roomComment = meta.roomComment as string | undefined;
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
				roomComment,
				summary
			});
		});

		const origin = event.url.origin;
		const xml = buildRssXml(items.join('\n'), origin);

		return new Response(xml, {
			status: 200,
			headers: {
				'Content-Type': 'application/xml; charset=utf-8',
				'Cache-Control': 'public, max-age=600, s-maxage=600'
			}
		});
	} catch (error) {
		logger.error('Error generating RSS feed', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
