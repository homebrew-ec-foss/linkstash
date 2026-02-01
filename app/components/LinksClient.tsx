"use client";

import { useEffect, useState } from 'react';

type LinkItem = any;

function sortLinks(list: LinkItem[]) {
    return list.slice().sort((a: any, b: any) => (b.count || 0) - (a.count || 0) || (b.ts || 0) - (a.ts || 0));
}

export default function LinksClient() {
    const [links, setLinks] = useState<LinkItem[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshed, setRefreshed] = useState(false);

    // Load cached links immediately
    useEffect(() => {
        const cached = typeof window !== 'undefined' ? localStorage.getItem('links_cache') : null;
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setLinks(sortLinks(parsed));
            } catch (e) {
                // ignore
            }
        }

        // Always fetch fresh in background
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/links');
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const sorted = sortLinks(data);

                const prev = links || (cached ? JSON.parse(cached) : null);
                const prevStr = prev ? JSON.stringify(prev.map((i: any) => i.id || i.url)) : '';
                const newStr = JSON.stringify(sorted.map((i: any) => i.id || i.url));

                // If different, update and show animation
                if (prevStr !== newStr) {
                    setLinks(sorted);
                    setRefreshed(true);
                    setTimeout(() => setRefreshed(false), 1800);
                    try { localStorage.setItem('links_cache', JSON.stringify(sorted)); } catch (e) { /* ignore storage errors */ }
                } else {
                    // still ensure links are set (in case there was no cache)
                    if (!links) setLinks(sorted);
                }
            } catch (e) {
                // ignore
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Render
    if (!links || links.length === 0) {
        return (
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>Links</div>
                    <div className={`refresh-badge ${refreshed ? 'show' : ''}`}>{refreshed ? 'Updated' : loading ? 'Loading...' : 'Latest'}</div>
                </div>
                <ol className="link-list">
                    {loading ? (
                        <li className="p-6 text-center text-gray-500">Loading links…</li>
                    ) : (
                        <li className="p-6 text-center text-gray-500">No links found.</li>
                    )}
                </ol>
            </div>
        );
    }

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10 }}>
                <div style={{ fontWeight: 600 }}>Links</div>
                <div className={`refresh-badge ${refreshed ? 'show' : ''}`}>{refreshed ? 'Updated' : loading ? 'Loading...' : 'Latest'}</div>
            </div>
            <ol className="link-list">
                {links.map((l: any, idx: number) => {
                    const url = l.url || (l.meta && l.meta.url) || '';
                    const title = l.title || l.name || (l.meta && l.meta.title) || url || 'Untitled';
                    let domain = l.domain || (l.meta && l.meta.domain) || '';
                    if (!domain && url) { try { domain = new URL(url).hostname } catch (e) { domain = '' } }

                    return (
                        <li key={l.id || url || idx} className={`link-item ${refreshed ? 'flash' : ''}`}>
                            <div className="rank">{idx + 1}.</div>
                            <div className="link-main">
                                <a href={url || '#'} target="_blank" rel="noopener noreferrer" className="link-title">{title}</a>
                                <div className="link-domain">{domain}{l.roomComment ? ` — ${l.roomComment}` : ''}</div>
                            </div>
                            <div className="votes">{l.count ? `${l.count} votes` : ''}</div>
                        </li>
                    )
                })}
            </ol>
        </div>
    );
}
