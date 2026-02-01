"use client";

import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';

export default function ReaderPage() {
    const [queue, setQueue] = useState<string[]>([]);
    const [index, setIndex] = useState(0);
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [metas, setMetas] = useState<Record<string, any>>({});
    const router = useRouter();

    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const touchStartTime = useRef<number | null>(null);

    // Parse hash and build queue: if single id is provided, fetch /api/links to build full list and set index
    useEffect(() => {
        const readHash = async () => {
            const h = (window.location.hash || '').replace(/^#/, '');
            const ids = h.split(',').map((s) => s.trim()).filter(Boolean);

            if (ids.length === 0) {
                setQueue([]);
                setIndex(0);
                return;
            }

            if (ids.length === 1) {
                const single = ids[0];
                try {
                    const res = await fetch('/api/links');
                    if (!res.ok) { setQueue([single]); setIndex(0); return; }
                    const links = await res.json();
                    const allIds = (links || []).filter((l: any) => l.id).map((l: any) => l.id);
                    const pos = allIds.indexOf(single);
                    if (pos >= 0) {
                        setQueue(allIds);
                        setIndex(pos);
                    } else {
                        // not in index: show single first then the rest
                        const merged = [single, ...allIds.filter((i: string) => i !== single)];
                        setQueue(merged);
                        setIndex(0);
                    }
                } catch (e) {
                    setQueue([single]);
                    setIndex(0);
                }
            } else {
                // multiple ids provided explicitly — follow that
                setQueue(ids);
                setIndex(0);
            }
        };

        readHash();
        window.addEventListener('hashchange', readHash);
        return () => window.removeEventListener('hashchange', readHash);
    }, []);

    // Load meta data for queue items from /api/links (so we can show hostname/title)
    useEffect(() => {
        if (!queue.length) return;

        // Track reader page opened event
        posthog.capture('reader_page_opened', {
            queue_length: queue.length,
            initial_item_id: queue[0],
        });

        (async () => {
            try {
                const res = await fetch('/api/links');
                if (!res.ok) return;
                const links = await res.json();
                const m: Record<string, any> = {};
                (links || []).forEach((l: any) => { if (l.id) m[l.id] = l; });
                setMetas(m);
            } catch (e) {
                // ignore
            }
        })();
    }, [queue]);

    // Load content for current index
    useEffect(() => {
        if (!queue || queue.length === 0) return;
        const id = queue[index];
        if (!id) return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            setContent(null);

            try {
                const controller = new AbortController();
                let timedOut = false;
                const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); setError('Timeout loading content'); setLoading(false); }, 8000);

                const res = await fetch(`/api/content/${id}`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (timedOut) return;
                if (!res.ok) { setError(`Content not found (${res.status})`); return; }
                const txt = await res.text();
                if (!cancelled) setContent(txt);
            } catch (e) {
                if (!((e as any)?.name === 'AbortError')) setError('Error loading content');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true };
    }, [queue, index]);

    // Navigation helpers (wrap around at ends)
    function gotoNext() {
        if (!queue || queue.length === 0) return;
        const newIndex = index < queue.length - 1 ? index + 1 : 0;
        posthog.capture('reader_page_navigated', {
            direction: 'next',
            from_index: index,
            to_index: newIndex,
            queue_length: queue.length,
            wrapped: index >= queue.length - 1,
        });
        setIndex(newIndex);
    }
    function gotoPrev() {
        if (!queue || queue.length === 0) return;
        const newIndex = index > 0 ? index - 1 : queue.length - 1;
        posthog.capture('reader_page_navigated', {
            direction: 'previous',
            from_index: index,
            to_index: newIndex,
            queue_length: queue.length,
            wrapped: index === 0,
        });
        setIndex(newIndex);
    }

    // Update URL so current item is the single id in the hash (easier bookmarking)
    useEffect(() => {
        if (!queue || queue.length === 0) return;
        const current = queue[index];
        if (current) history.replaceState(null, '', `/reader#${current}`);
    }, [index, queue]);

    // Keyboard support
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') { gotoPrev(); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { gotoNext(); e.preventDefault(); }
            else if (e.key === 'Escape') { router.back(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [index, queue]);

    // Touch handlers
    function handleTouchStart(e: React.TouchEvent) {
        const t = e.touches[0];
        touchStartX.current = t.clientX;
        touchStartY.current = t.clientY;
        touchStartTime.current = Date.now();
    }
    function handleTouchEnd(e: React.TouchEvent) {
        const t = e.changedTouches[0];
        const sx = touchStartX.current;
        const sy = touchStartY.current;
        const st = touchStartTime.current || 0;
        if (sx == null || sy == null) return;
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        const dt = Date.now() - st;

        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && dt < 1000) {
            if (dx > 0) gotoPrev(); else gotoNext();
        }

        touchStartX.current = null;
        touchStartY.current = null;
        touchStartTime.current = null;
    }

    function removeFromQueue(idx: number) {
        const id = queue[idx];
        const q = queue.filter((_, i) => i !== idx);
        if (q.length === 0) {
            // close reader
            router.back();
            return;
        }
        // Adjust index
        let newIndex = index;
        if (idx === index) {
            if (idx < queue.length - 1) newIndex = idx;
            else newIndex = Math.max(0, idx - 1);
        } else if (idx < index) {
            newIndex = Math.max(0, index - 1);
        }
        setQueue(q);
        setIndex(newIndex);
        // update URL to current single id
        history.replaceState(null, '', `/reader#${q[newIndex]}`);
    }

    const currentId = queue[index];
    const currentMeta = currentId ? metas[currentId] : null;

    // Ensure every rendered page has an H1: prefer meta title, then hostname (from URL), then id, then a generic fallback
    const defaultH1Text = (() => {
        if (currentMeta?.title) return currentMeta.title;
        if (currentMeta?.url) {
            try { return new URL(currentMeta.url).hostname; } catch (e) { /* ignore invalid URL */ }
        }
        if (currentId) return currentId;
        return 'Reader';
    })();

    // Extract the first markdown H1 that is NOT inside a fenced code block.
    // We skip fenced code (``` or ~~~) so headings inside code samples are ignored.
    function extractFirstH1WithoutCode(md?: string) {
        if (!md) return { h1: null as string | null, content: '' };
        const lines = md.split(/\r?\n/);
        let inFence = false;
        let fenceToken = '';
        let found: string | null = null;
        const out: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const fenceMatch = line.match(/^(`{3,}|~{3,})/);
            if (fenceMatch) {
                if (!inFence) { inFence = true; fenceToken = fenceMatch[1]; }
                else if (line.startsWith(fenceToken)) { inFence = false; fenceToken = ''; }
                out.push(line);
                continue;
            }

            if (!inFence && !found) {
                const h1 = line.match(/^#\s+(.+)$/);
                if (h1) { found = h1[1].trim(); continue; } // drop the H1 line
            }

            out.push(line);
        }

        return { h1: found, content: out.join('\n').trimStart() };
    }

    const { h1: extractedH1, content: contentWithoutH1 } = extractFirstH1WithoutCode(content || undefined);
    const pageH1 = extractedH1 || defaultH1Text;



    return (
        <div className="reader-overlay" role="region" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ minHeight: '100vh' }}>
            <div className="reader-panel reader-minimal" style={{ height: '100vh' }}>
                <aside className="reader-sidebar">
                    <div className="sidebar-title">{currentMeta?.title || 'Reader'}</div>
                    <div className="sidebar-excerpt">{currentMeta?.summary || ''}</div>
                </aside>

                <div className="reader-body">
                    <div className="reader-ctrls-vertical" role="toolbar" aria-label="Reader navigation">
                        <button className="reader-btn-small" type="button" onClick={gotoPrev}>‹</button>
                        <button className="reader-btn-small" type="button" onClick={gotoNext}>›</button>
                        {currentMeta?.url && (
                            <a className="reader-btn-small" href={currentMeta.url} target="_blank" rel="noopener noreferrer" aria-label="Open">⤢</a>
                        )}
                        <button className="reader-btn-small" type="button" onClick={() => removeFromQueue(index)} aria-label="Remove">×</button>
                    </div>

                    <div className="reader-header">
                        <div className="reader-title">{currentMeta?.url ? (<a href={currentMeta.url} target="_blank" rel="noopener noreferrer" className="reader-header-link">{new URL(currentMeta.url).hostname}</a>) : (currentMeta?.title || 'Reader')}</div>
                        <div className="reader-controls">
                            {currentMeta?.url && (<a href={currentMeta.url} target="_blank" rel="noopener noreferrer" className="reader-open-link">Open</a>)}
                            <button type="button" onClick={() => router.back()} aria-label="Close">Close</button>
                        </div>
                    </div>

                    <div className="reader-content">
                        {loading ? (
                            <div className="p-6 text-center text-gray-500">Loading…</div>
                        ) : error ? (
                            <div className="p-6 text-center text-gray-500">{error}</div>
                        ) : content ? (
                            <article className="markdown-body">
                                {/* Always render a single H1: prefer the extracted H1 from content, otherwise fallback to pageH1 */}
                                <h1 className="markdown-title">{pageH1}</h1>
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeSanitize]}
                                    components={{
                                        img: ({ node, src, alt, title }) => {
                                            // Helper to extract YouTube ID
                                            const getYouTubeId = (url: string | undefined) => {
                                                if (!url) return null;
                                                try {
                                                    const u = new URL(url);
                                                    if (u.hostname === 'youtu.be') {
                                                        return u.pathname.slice(1);
                                                    }
                                                    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com')) {
                                                        const v = u.searchParams.get('v');
                                                        if (v) return v;
                                                        const parts = u.pathname.split('/').filter(Boolean);
                                                        if (parts[0] === 'shorts' && parts[1]) return parts[1];
                                                    }
                                                    return null;
                                                } catch (e) {
                                                    return null;
                                                }
                                            };

                                            const id = getYouTubeId(src as string | undefined);
                                            if (id) {
                                                const embed = `https://www.youtube.com/embed/${id}`;
                                                return (
                                                    <div className="embed-youtube">
                                                        <iframe src={embed} title={alt || title || 'YouTube video'} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <img
                                                    src={src}
                                                    alt={alt}
                                                    title={title}
                                                    className="markdown-img"
                                                    onError={(e: any) => {
                                                        try {
                                                            const t = e.currentTarget as HTMLImageElement;
                                                            if (t.dataset && t.dataset.proxied) return;
                                                            t.dataset.proxied = '1';
                                                            t.src = `/api/proxy?url=${encodeURIComponent(String(src || ''))}`;
                                                        } catch (err) {
                                                            // ignore
                                                        }
                                                    }}
                                                />
                                            );
                                        }
                                    }}
                                >{contentWithoutH1}</ReactMarkdown>
                            </article>
                        ) : (
                            <div className="p-6 text-center text-gray-500">No content.</div>
                        )}
                    </div>
                </div>

                <aside className="reader-queue">
                    <ol>
                        {queue.map((it, i) => (
                            <li key={it} className={i === index ? 'active' : ''} onClick={() => setIndex(i)}>
                                <div className="queue-title">{(metas[it] && metas[it].title) ? metas[it].title : it}</div>
                                <button className="queue-remove" onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }} aria-label="Remove">×</button>
                            </li>
                        ))}
                    </ol>
                </aside>
            </div>
        </div>
    );
}
