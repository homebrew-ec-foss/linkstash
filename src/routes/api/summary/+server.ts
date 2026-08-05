import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getClient, initDb, sanitizeLink } from '$lib/server/db';

/**
 * GET /api/summary
 * Summarize links in a date range, optionally filtered by room.
 * Query params: `day` (single day, legacy), `from`/`to` (YYYY-MM-DD), `room`.
 */
export const GET: RequestHandler = async (event) => {
	try {
		await initDb();

		const search = event.url.searchParams;
		const dayParam = search.get('day');
		const fromParam = search.get('from');
		const toParam = search.get('to');
		const roomParam = search.get('room')?.trim();
		let fromDay: string;
		let toDay: string;

		const isValidDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

		if (fromParam && !isValidDay(fromParam)) {
			return json({ error: 'Invalid from format. Use YYYY-MM-DD' }, { status: 400 });
		}
		if (toParam && !isValidDay(toParam)) {
			return json({ error: 'Invalid to format. Use YYYY-MM-DD' }, { status: 400 });
		}

		if (fromParam || toParam) {
			fromDay = fromParam || toParam!;
			toDay = toParam || fromParam!;
		} else if (dayParam) {
			// Backward compatibility: allow single day query.
			if (!isValidDay(dayParam)) {
				return json({ error: 'Invalid day format. Use YYYY-MM-DD' }, { status: 400 });
			}
			fromDay = dayParam;
			toDay = dayParam;
		} else {
			// Default to the latest 7-day window that has links.
			const maxTsResult = await getClient().execute({
				sql: 'SELECT MAX(ts) AS max_ts FROM link_index',
				args: []
			});
			if (maxTsResult.rows.length === 0 || !maxTsResult.rows[0].max_ts) {
				return json({
					from: null,
					to: null,
					room: roomParam || null,
					rooms: [],
					total: 0,
					summary: []
				});
			}
			const maxTs = maxTsResult.rows[0].max_ts as number;
			const date = new Date(maxTs);
			toDay = date.toISOString().split('T')[0];
			const startDate = new Date(`${toDay}T00:00:00Z`);
			startDate.setUTCDate(startDate.getUTCDate() - 6);
			fromDay = startDate.toISOString().split('T')[0];
		}

		if (fromDay > toDay) {
			return json({ error: '`from` cannot be later than `to`' }, { status: 400 });
		}

		// Calculate start and end timestamps for the date range (UTC, inclusive of toDay).
		const startTs = new Date(fromDay + 'T00:00:00Z').getTime();
		const endTs = new Date(toDay + 'T00:00:00Z').getTime() + 86400000; // next day start

		// Query links for that range
		const result = await getClient().execute({
			sql: `SELECT li.link_id AS id, li.domain, l.submitted_by, li.ts AS ts, l.count, COALESCE(l.meta, li.meta) AS meta
                  FROM link_index li
                  LEFT JOIN links l ON l.id = li.link_id
                  WHERE li.ts >= ? AND li.ts < ?
                  ORDER BY li.ts DESC`,
			args: [startTs, endTs]
		});

		const links = result.rows.map((row: any) => {
			const metaObj = row.meta ? JSON.parse(row.meta as string) : {};
			const full = Object.assign(
				{
					id: row.id as string,
					ts: row.ts as number,
					count: row.count as number
				},
				metaObj
			);
			return sanitizeLink(full);
		});

		const roomTotals = new Map<string, number>();
		for (const item of links) {
			const room =
				typeof item.roomComment === 'string' && item.roomComment.trim()
					? item.roomComment.trim()
					: 'Unknown';
			roomTotals.set(room, (roomTotals.get(room) || 0) + 1);
		}

		const availableRooms = Array.from(roomTotals.entries())
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([name, total]) => ({ name, total }));

		const filteredSummary = roomParam
			? links.filter((item: any) => {
					const room =
						typeof item.roomComment === 'string' && item.roomComment.trim()
							? item.roomComment.trim()
							: 'Unknown';
					return room.toLowerCase() === roomParam.toLowerCase();
				})
			: links;

		return json({
			from: fromDay,
			to: toDay,
			room: roomParam || null,
			rooms: availableRooms,
			total: filteredSummary.length,
			summary: filteredSummary
		});
	} catch (error) {
		console.error('Error in summary endpoint:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
