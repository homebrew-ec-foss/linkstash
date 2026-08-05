import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getClient, initDb, sanitizeLink, getLinkByUrl, rowToLink, getPaginatedLinks } from '$lib/server/db';
import { sortLinksByMode, normalizeRankMode } from '$lib/sorting';
import { logger } from '$lib/logger';
import type { Link, RankMode } from '$lib/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/links
 * Fetch links with optional sorting mode and pagination
 *
 * Query Parameters:
 *   - url: optional URL to fetch a specific link
 *   - mode: ranking mode ('latest', 'top', 'rising') - defaults to 'latest'
 *   - offset: pagination offset (default: 0)
 *   - limit: items per page (default: 50, max: 200, or unlimited if >= 10000 for search)
 */
export const GET: RequestHandler = async (event) => {
	try {
		const search = event.url.searchParams;
		const queryUrl = search.get('url');
		const mode: RankMode = normalizeRankMode(search.get('mode'));

		const rawOffset = parseInt(search.get('offset') || '0', 10);
		const rawLimit = parseInt(search.get('limit') || String(DEFAULT_LIMIT), 10);
		const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
		let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT;

		// Allow unlimited results if limit >= 10000 (for search queries)
		const isSearchQuery = limit >= 10000;
		if (!isSearchQuery) {
			limit = Math.min(limit, MAX_LIMIT);
		}

		// Fetch specific link by URL (normalized, matching dedup behavior)
		if (queryUrl) {
			const link = await getLinkByUrl(queryUrl);
			if (!link) {
				return json({ error: 'Link not found' }, { status: 404 });
			}
			return json(link);
		}

		await initDb();
		const client = getClient();

		const mapRow = (row: any): Link => {
			const l = rowToLink(row);
			return sanitizeLink(l) as Link;
		};

		// For rising mode, fetch all and sort in-memory (needs full dataset for scoring)
		if (mode === 'rising') {
			const fullResult = await client.execute({
				sql: `SELECT l.id, l.url, li.domain, l.submitted_by, li.ts, l.count, COALESCE(l.meta, li.meta) AS meta
              FROM link_index li
              LEFT JOIN links l ON l.id = li.link_id`,
				args: []
			});

			const links: Link[] = fullResult.rows.map(mapRow);
			const sorted = sortLinksByMode(links, mode);
			const total = sorted.length;
			const paged = sorted.slice(offset, offset + limit);

			const withIndex = paged.map((link, idx) => ({
				...link,
				displayIndex: offset + idx + 1
			}));

			return json({
				items: withIndex,
				total,
				offset,
				limit,
				hasMore: offset + limit < total
			});
		}

		// For search queries (limit >= 10000), fetch everything and paginate in memory
		if (isSearchQuery) {
			const fullResult = await client.execute({
				sql: `SELECT l.id, l.url, li.domain, l.submitted_by, li.ts, l.count, COALESCE(l.meta, li.meta) AS meta
              FROM link_index li
              LEFT JOIN links l ON l.id = li.link_id
              ORDER BY li.ts DESC`,
				args: []
			});

			const links: Link[] = fullResult.rows.map(mapRow).slice(offset, offset + limit);
			const withIndex = links.map((link, idx) => ({
				...link,
				displayIndex: offset + idx + 1
			}));

			const total = fullResult.rows.length;
			return json({
				items: withIndex,
				total,
				offset,
				limit,
				hasMore: offset + limit < total
			});
		}

		// For latest/top modes, use the shared paginated query (matches SSR output)
		const page = await getPaginatedLinks({ mode: mode as 'latest' | 'top', offset, limit });
		return json({
			items: page.items,
			total: page.total,
			offset: page.offset,
			limit: page.limit,
			hasMore: page.hasMore
		});
	} catch (error) {
		logger.error('Error fetching links', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
