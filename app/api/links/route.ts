import { NextRequest, NextResponse } from 'next/server';
import { getLinks, getLinkByUrl } from '../../../scripts/db';

export async function GET(request: NextRequest) {
    try {
        const queryUrl = request.nextUrl.searchParams.get('url');
        if (queryUrl) {
            const rec = await getLinkByUrl(queryUrl);
            if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });
            return NextResponse.json(rec);
        }

        const list = await getLinks();
        return NextResponse.json(list);
    } catch (error) {
        console.error('Error in links endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}