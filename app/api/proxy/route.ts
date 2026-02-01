import { NextResponse } from 'next/server';

// Simple proxy for images (and other resources) used by the reader.
// Safety/limits:
// - only allow http(s) schemes
// - impose a max content-length to avoid huge downloads
// - do not allow local network addresses (basic check)

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function isLocalHost(hostname: string) {
    return /^(localhost|127\.|::1|0:0:0:0|192\.|10\.|172\.)/.test(hostname);
}

export async function GET(req: Request) {
    try {
        const urlParam = new URL(req.url).searchParams.get('url');
        if (!urlParam) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

        let url: URL;
        try {
            url = new URL(urlParam);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
        }

        if (!['http:', 'https:'].includes(url.protocol)) {
            return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
        }

        // Basic local network protection
        if (isLocalHost(url.hostname)) {
            return NextResponse.json({ error: 'Refusing to proxy local addresses' }, { status: 403 });
        }

        // Fetch remote resource server-side so we avoid CORS/referrer issues in the client
        // Add a common User-Agent and accept header to avoid some hosts blocking requests
        const res = await fetch(url.toString(), {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Linkstash Proxy/1.0 (+https://linkstash.hsp-ec.xyz)',
                'Accept': '*/*'
            }
        });

        if (!res.ok) {
            console.warn('Upstream fetch failed', url.toString(), res.status, res.statusText);
            return NextResponse.json({ error: 'Upstream fetch failed' }, { status: res.status });
        }

        const contentType = res.headers.get('content-type') || 'application/octet-stream';
        const contentLengthHeader = res.headers.get('content-length');
        if (contentLengthHeader) {
            const len = parseInt(contentLengthHeader, 10);
            if (!Number.isNaN(len) && len > MAX_BYTES) {
                return NextResponse.json({ error: 'Resource too large' }, { status: 413 });
            }
        }

        // Stream the response body back to the client to avoid buffering large files
        // Return the upstream status as-is
        return new NextResponse(res.body, {
            status: res.status,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 's-maxage=3600, stale-while-revalidate=3600'
            }
        });
    } catch (err) {
        console.error('Proxy error', err);
        return NextResponse.json({ error: 'Proxy internal error' }, { status: 500 });
    }
}
