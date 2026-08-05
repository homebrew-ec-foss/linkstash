import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// Simple proxy for images (and other resources) used by the reader.
// Safety/limits:
// - only allow http(s) schemes
// - impose a max content-length to avoid huge downloads
// - do not allow local network addresses (basic check)

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function isLocalHost(hostname: string): boolean {
	return /^(localhost|127\.|::1|0:0:0:0|192\.|10\.|172\.|169\.254\.|0\.0\.0\.0)/.test(hostname);
}

export const GET: RequestHandler = async (event) => {
	try {
		const urlParam = event.url.searchParams.get('url');
		if (!urlParam) return json({ error: 'Missing url' }, { status: 400 });

		let url: URL;
		try {
			url = new URL(urlParam);
		} catch (e) {
			return json({ error: 'Invalid url' }, { status: 400 });
		}

		if (!['http:', 'https:'].includes(url.protocol)) {
			return json({ error: 'Unsupported protocol' }, { status: 400 });
		}

		// Basic local network protection
		if (isLocalHost(url.hostname)) {
			return json({ error: 'Refusing to proxy local addresses' }, { status: 403 });
		}

		// Fetch remote resource server-side so we avoid CORS/referrer issues in the client
		const res = await fetch(url.toString(), {
			method: 'GET',
			redirect: 'follow',
			headers: {
				'User-Agent': 'Linkstash Proxy/1.0 (+https://linkstash.hsp-ec.xyz)',
				Accept: '*/*'
			}
		});

		if (!res.ok) {
			console.warn('Upstream fetch failed', url.toString(), res.status, res.statusText);
			return json({ error: 'Upstream fetch failed' }, { status: res.status });
		}

		const contentType = res.headers.get('content-type') || 'application/octet-stream';
		const contentLengthHeader = res.headers.get('content-length');
		if (contentLengthHeader) {
			const len = parseInt(contentLengthHeader, 10);
			if (!Number.isNaN(len) && len > MAX_BYTES) {
				return json({ error: 'Resource too large' }, { status: 413 });
			}
		}

		// Stream the response body back to the client to avoid buffering large files
		return new Response(res.body, {
			status: res.status,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 's-maxage=3600, stale-while-revalidate=3600'
			}
		});
	} catch (err) {
		console.error('Proxy error', err);
		return json({ error: 'Proxy internal error' }, { status: 500 });
	}
};
