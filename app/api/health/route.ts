import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        if (!process.env.LAVA_URL) {
            return NextResponse.json({
                ok: false,
                error: 'LAVA_URL not configured',
                timestamp: new Date().toISOString()
            }, { status: 502 });
        }
        const res = await fetch(process.env.LAVA_URL + '/ping', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        const ping = await res.json();
        // return remote ping payload under "remote"
        return NextResponse.json({ ok: true, remote: ping });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: (error as Error).message,
            timestamp: new Date().toISOString()
        }, { status: 502 });
    }
}