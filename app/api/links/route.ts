import { NextRequest, NextResponse } from 'next/server';
import { client, initDb, LinkRecord } from '../../../scripts/db';

export async function GET(request: NextRequest) {
    try {
        // Initialize database if needed
        await initDb();

        // Normalize helper (similar to add route)
        const normalizeUrl = (u: any): string => {
            if (!u || typeof u !== 'string') return '';
            try {
                const nu = new URL(u);
                const path = nu.pathname.replace(/\/+$/, '');
                return nu.origin + (path || '/') + nu.search;
            } catch (e) {
                return (u as string).replace(/\/+$/, '');
            }
        };

        // If a `url` query parameter is provided, return the metadata for that URL using the fast index
        const queryUrl = request.nextUrl.searchParams.get('url');
        if (queryUrl) {
            const qnorm = normalizeUrl(queryUrl);

            const result = await client.execute({
                sql: `SELECT l.id, l.url, l.domain, l.submitted_by, l.ts, l.count, COALESCE(l.meta, li.meta) as meta
                      FROM link_index li
                      JOIN links l ON l.id = li.link_id
                      WHERE li.normalized_url = ?
                      LIMIT 1`,
                args: [qnorm]
            });

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Not found' }, { status: 404 });
            }

            const row = result.rows[0];
            const metaObj = row.meta ? JSON.parse(row.meta as string) : {};
            // Return meta directly (avoid duplicating url/domain in both places)
            const rec = Object.assign({ id: row.id as string, ts: row.ts as number, count: row.count as number }, metaObj);

            return NextResponse.json(rec);
        }

        // Otherwise, return the full list ordered by timestamp using the fast link_index (NO content included)
        const result = await client.execute({
            sql: `SELECT li.link_id AS id, li.domain, l.submitted_by, li.ts AS ts, l.count, COALESCE(l.meta, li.meta) as meta
                  FROM link_index li
                  LEFT JOIN links l ON l.id = li.link_id
                  ORDER BY li.ts DESC`,
            args: []
        });

        const list = result.rows.map(row => {
            const metaObj = row.meta ? JSON.parse(row.meta as string) : {};
            return Object.assign({ id: row.id as string, ts: row.ts as number, count: row.count as number }, metaObj);
        });

        return NextResponse.json(list);
    } catch (error) {
        console.error('Error in links endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}