const CACHE_NAME = 'linkstash-shell-v1';
const CONTENT_CACHE = 'linkstash-content-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Cache the shell and a few assets
            return cache.addAll([
                '/',
                '/favicon.png',
                '/manifest.json',
                '/linkstash-preview.png'
            ].filter(Boolean));
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Clean up old caches
            const keys = await caches.keys();
            await Promise.all(keys.map(k => {
                if (![CACHE_NAME, CONTENT_CACHE].includes(k)) return caches.delete(k);
                return Promise.resolve();
            }));
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Don't interfere with non-GET requests
    if (request.method !== 'GET') return;

    // Cache-first for content endpoints (/api/content/<id>) so previously visited content is available offline
    if (url.pathname.startsWith('/api/content/')) {
        event.respondWith(caches.open(CONTENT_CACHE).then(async (cache) => {
            const cached = await cache.match(request);
            if (cached) return cached;
            try {
                const res = await fetch(request);
                if (res && res.ok) cache.put(request, res.clone());
                return res;
            } catch (e) {
                return cached || new Response('', { status: 503, statusText: 'Service Unavailable' });
            }
        }));
        return;
    }

    // For navigation: network-first but fall back to cached shell
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = await fetch(request);
                // update shell cache
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, res.clone()).catch(() => { });
                return res;
            } catch (e) {
                const cached = await caches.match(OFFLINE_URL);
                return cached || new Response('Offline', { status: 503 });
            }
        })());
        return;
    }

    // For other requests, try cache then network
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});