import { NextRequest, NextResponse } from 'next/server';
import { client, initDb } from '../../../scripts/db';

function sanitizeLink(obj: any): any {
    const out = { ...obj };
    // remove sensitive fields that should never be exposed via public APIs
    delete out.submittedBy;
    delete out.roomId;
    // keep room comments; they're useful context and are intended to be public-facing
    delete out.submitted_by;
    delete out.room_id;
    if (out.meta && typeof out.meta === 'object') {
        delete out.meta.submittedBy;
        delete out.meta.roomId;
        // preserve meta.roomComment
        delete out.meta.submitted_by;
        delete out.meta.room_id;
    }
    return out;
}

export async function GET(request: NextRequest) {
    try {
        await initDb();

        const dayParam = request.nextUrl.searchParams.get('day');
        let targetDay: string;

        if (dayParam) {
            // Validate the day format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
                return NextResponse.json({ error: 'Invalid day format. Use YYYY-MM-DD' }, { status: 400 });
            }
            targetDay = dayParam;
        } else {
            // Get the latest date with links
            const maxTsResult = await client.execute({
                sql: 'SELECT MAX(ts) as max_ts FROM link_index',
                args: []
            });
            if (maxTsResult.rows.length === 0 || !maxTsResult.rows[0].max_ts) {
                return NextResponse.json({ summary: [] });
            }
            const maxTs = maxTsResult.rows[0].max_ts as number;
            const date = new Date(maxTs);
            targetDay = date.toISOString().split('T')[0];
        }

        // Calculate start and end timestamps for the day (UTC)
        const startDate = new Date(targetDay + 'T00:00:00Z');
        const startTs = startDate.getTime();
        const endTs = startTs + 86400000; // Next day start (24 hours in milliseconds)

        // Query links for that day
        const result = await client.execute({
            sql: `SELECT li.link_id AS id, li.domain, l.submitted_by, li.ts AS ts, l.count, COALESCE(l.meta, li.meta) as meta
                  FROM link_index li
                  LEFT JOIN links l ON l.id = li.link_id
                  WHERE li.ts >= ? AND li.ts < ?
                  ORDER BY li.ts DESC`,
            args: [startTs, endTs]
        });

        const links = result.rows.map(row => {
            const metaObj = row.meta ? JSON.parse(row.meta as string) : {};
            const full = Object.assign({
                id: row.id as string,
                ts: row.ts as number,
                count: row.count as number
            }, metaObj);
            return sanitizeLink(full);
        });

        return NextResponse.json({
            day: targetDay,
            summary: links
        });
    } catch (error) {
        console.error('Error in summary endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}