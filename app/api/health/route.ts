import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const res = await fetch(process.env.LINKSTASH_BASE_URL! + '/ping', {
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