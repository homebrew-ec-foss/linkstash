import { NextRequest, NextResponse } from 'next/server';
import { getLinks, getLinkByUrl } from '../../../scripts/db';

type RankMode = 'latest' | 'top' | 'rising';

function normalizeMode(raw: string | null): RankMode {
    if (raw === 'top' || raw === 'rising') return raw;
    return 'latest';
}

function risingScore(item: any, now: number) {
    const votes = Math.max(0, Number(item?.count || 0));
    const ts = Number(item?.ts || 0);
    if (!ts || votes <= 0) return 0;
    const ageHours = Math.max(0, (now - ts) / 3600000);
    return Math.log2(votes + 1) / Math.pow(ageHours + 2, 1.25);
}

function sortByMode(list: any[], mode: RankMode) {
    const now = Date.now();

    return list
        .map((item) => {
            if (mode === 'top') {
                return { ...item, score: Number(item?.count || 0) };
            }
            if (mode === 'rising') {
                return { ...item, score: Number(risingScore(item, now).toFixed(6)) };
            }
            return { ...item, score: Number(item?.ts || 0) };
        })
        .sort((a, b) => {
            if (mode === 'top') {
                return (b.count || 0) - (a.count || 0) || (b.ts || 0) - (a.ts || 0);
            }
            if (mode === 'rising') {
                return (b.score || 0) - (a.score || 0) || (b.count || 0) - (a.count || 0) || (b.ts || 0) - (a.ts || 0);
            }
            return (b.ts || 0) - (a.ts || 0) || (b.count || 0) - (a.count || 0);
        });
}

export async function GET(request: NextRequest) {
    try {
        const queryUrl = request.nextUrl.searchParams.get('url');
        const mode = normalizeMode(request.nextUrl.searchParams.get('mode'));
        if (queryUrl) {
            const rec = await getLinkByUrl(queryUrl);
            if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });
            return NextResponse.json(rec);
        }

        const list = await getLinks();
        return NextResponse.json(sortByMode(list, mode));
    } catch (error) {
        console.error('Error in links endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}