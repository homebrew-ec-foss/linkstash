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
        const fromParam = request.nextUrl.searchParams.get('from');
        const toParam = request.nextUrl.searchParams.get('to');
        const roomParam = request.nextUrl.searchParams.get('room')?.trim();
        let fromDay: string;
        let toDay: string;

        const isValidDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

        if (fromParam && !isValidDay(fromParam)) {
            return NextResponse.json({ error: 'Invalid from format. Use YYYY-MM-DD' }, { status: 400 });
        }
        if (toParam && !isValidDay(toParam)) {
            return NextResponse.json({ error: 'Invalid to format. Use YYYY-MM-DD' }, { status: 400 });
        }

        if (fromParam || toParam) {
            fromDay = fromParam || toParam!;
            toDay = toParam || fromParam!;
        } else if (dayParam) {
            // Backward compatibility: allow single day query.
            if (!isValidDay(dayParam)) {
                return NextResponse.json({ error: 'Invalid day format. Use YYYY-MM-DD' }, { status: 400 });
            }
            fromDay = dayParam;
            toDay = dayParam;
        } else {
            // Default to the latest 7-day window that has links.
            const maxTsResult = await client.execute({
                sql: 'SELECT MAX(ts) as max_ts FROM link_index',
                args: []
            });
            if (maxTsResult.rows.length === 0 || !maxTsResult.rows[0].max_ts) {
                return NextResponse.json({
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
            return NextResponse.json({ error: '`from` cannot be later than `to`' }, { status: 400 });
        }

        // Calculate start and end timestamps for the date range (UTC, inclusive of toDay).
        const startDate = new Date(fromDay + 'T00:00:00Z');
        const startTs = startDate.getTime();
        const endDate = new Date(toDay + 'T00:00:00Z');
        const endTs = endDate.getTime() + 86400000; // next day start

        // Query links for that range
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

        const roomTotals = new Map<string, number>();
        for (const item of links) {
            const room = typeof item.roomComment === 'string' && item.roomComment.trim()
                ? item.roomComment.trim()
                : 'Unknown';
            roomTotals.set(room, (roomTotals.get(room) || 0) + 1);
        }

        const availableRooms = Array.from(roomTotals.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name, total]) => ({ name, total }));

        const filteredSummary = roomParam
            ? links.filter(item => {
                const room = typeof item.roomComment === 'string' && item.roomComment.trim()
                    ? item.roomComment.trim()
                    : 'Unknown';
                return room.toLowerCase() === roomParam.toLowerCase();
            })
            : links;

        return NextResponse.json({
            from: fromDay,
            to: toDay,
            room: roomParam || null,
            rooms: availableRooms,
            total: filteredSummary.length,
            summary: filteredSummary
        });
    } catch (error) {
        console.error('Error in summary endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}