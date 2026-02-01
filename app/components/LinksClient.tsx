"use client";

import { useEffect, useState, useRef } from 'react';
import { Github, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

type LinkItem = any;

function sortLinks(list: LinkItem[]) {
    return list.slice().sort((a: any, b: any) => (b.count || 0) - (a.count || 0) || (b.ts || 0) - (a.ts || 0));
}

function formatDateLabel(ts: number | undefined) {
    if (!ts) return 'Unknown';
    const d = new Date(ts);
    const now = new Date();

    const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    if (isSameDay(d, now)) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(d, yesterday)) return 'Yesterday';

    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function groupByDate(list: LinkItem[]) {
    const groups: Record<string, LinkItem[]> = {};
    list.forEach((item) => {
        const key = item.ts ? new Date(item.ts).toISOString().slice(0, 10) : 'unknown';
        groups[key] = groups[key] || [];
        groups[key].push(item);
    });

    // Convert to sorted array of groups (newest first)
    const keys = Object.keys(groups).sort((a, b) => (b > a ? 1 : -1));
    return keys.map((k) => ({ key: k, label: k === 'unknown' ? 'Unknown' : formatDateLabel(new Date(k).getTime()), items: groups[k] }));
}

export default function LinksClient() {
    const [links, setLinks] = useState<LinkItem[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshed, setRefreshed] = useState(false);

    // Reader state
    const [readerOpen, setReaderOpen] = useState(false);
    const [readerQueue, setReaderQueue] = useState<Array<{ id?: string; title: string; url?: string }>>([]);
    const [readerIndex, setReaderIndex] = useState(0);
    const [readerContent, setReaderContent] = useState<string | null>(null);
    const [readerLoading, setReaderLoading] = useState(false);
    const [readerError, setReaderError] = useState<string | null>(null);
    // Default to minimal reading view
    const [readerMinimal, setReaderMinimal] = useState(true);

    // Touch swipe tracking (for prev/next)
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const touchStartTime = useRef<number | null>(null);

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
                const sorted = sortLinks(data).map((item: any, i: number) => ({ ...item, displayIndex: i + 1 }));

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

    // Helper: load content for a queue index
    async function loadContentAt(index: number) {
        const item = readerQueue[index];
        if (!item) {
            setReaderError('No item in queue');
            setReaderContent(null);
            return;
        }

        setReaderLoading(true);
        setReaderError(null);
        setReaderContent(null);

        try {
            if (!item.id) {
                setReaderError('No stored content for this link');
                setReaderLoading(false);
                return;
            }

            // Add a fetch timeout so the UI doesn't stay in indefinite "Loading…"
            const controller = new AbortController();
            let timedOut = false;
            const timeoutMs = 8000;
            const timeoutId = window.setTimeout(() => {
                timedOut = true;
                controller.abort();
                setReaderError('Error loading content (timeout)');
                setReaderLoading(false);
            }, timeoutMs);

            const res = await fetch(`/api/content/${item.id}`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (timedOut) return;

            if (!res.ok) {
                setReaderError(`Content not found (${res.status})`);
                return;
            }

            const txt = await res.text();
            setReaderContent(txt);
        } catch (e) {
            // If we aborted due to timeout we've already shown an error; otherwise show a generic error
            if (!((e as any)?.name === 'AbortError')) {
                setReaderError('Error fetching content');
            }
        } finally {
            setReaderLoading(false);
        }
    }

    // Small helper: get a text excerpt from markdown content
    function getExcerpt(md: string | null, length = 300) {
        if (!md) return '';
        // Strip markdown headings, images, links and formatting lightly
        let txt = md.replace(/\!\[.*?\]\(.*?\)/g, ' ');
        txt = txt.replace(/\[(.*?)\]\(.*?\)/g, '$1');
        txt = txt.replace(/[#*_>`~\-]{1,}/g, ' ');
        txt = txt.replace(/\s+/g, ' ').trim();
        if (txt.length <= length) return txt;
        return txt.slice(0, length).trim() + '…';
    }
    // Effect: load content when index or queue changes while open
    useEffect(() => {
        if (readerOpen) {
            loadContentAt(readerIndex);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readerOpen, readerIndex, readerQueue]);

    // Prevent background scrolling when reader is open (covers trackpad, wheel, and iOS touchmove)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const originalOverflow = document.body.style.overflow;

        const preventTouch = (e: TouchEvent) => {
            // Prevent touch scrolling reaching the background, but allow touch interactions
            // inside the reader overlay (so the content can scroll on mobile).
            try {
                const overlay = document.querySelector('.reader-overlay');
                if (overlay && e.target && (overlay as Node).contains(e.target as Node)) {
                    // Let touches inside the reader proceed (do not preventDefault)
                    return;
                }
            } catch (err) {
                // fallthrough to preventDefault if anything unexpected happens
            }

            e.preventDefault();
        };

        if (readerOpen) {
            document.body.style.overflow = 'hidden';
            // iOS needs non-passive listener to prevent default
            document.addEventListener('touchmove', preventTouch, { passive: false });
        } else {
            document.body.style.overflow = originalOverflow || '';
        }

        return () => {
            document.body.style.overflow = originalOverflow || '';
            document.removeEventListener('touchmove', preventTouch as EventListener);
        };
    }, [readerOpen]);

    // Keyboard navigation (left/right/escape) while reader is open
    useEffect(() => {
        if (!readerOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') { gotoPrev(); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { gotoNext(); e.preventDefault(); }
            else if (e.key === 'Escape') { closeReader(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [readerOpen, readerIndex, readerQueue]);

    // Touch swipe handlers (start/end) to detect left/right swipes
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

        // Horizontal swipe threshold and not mostly vertical
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && dt < 1000) {
            if (dx > 0) gotoPrev(); else gotoNext();
        }

        touchStartX.current = null;
        touchStartY.current = null;
        touchStartTime.current = null;
    }

    function closeReader() {
        setReaderOpen(false);
        setReaderContent(null);
        setReaderError(null);
    }

    function gotoNext() {
        if (readerIndex < readerQueue.length - 1) setReaderIndex(readerIndex + 1);
    }

    function gotoPrev() {
        if (readerIndex > 0) setReaderIndex(readerIndex - 1);
    }

    function removeFromQueue(index: number) {
        setReaderQueue((q) => q.filter((_, i) => i !== index));
        if (index === readerIndex) {
            // If removing current, try to show next or close
            if (index < readerQueue.length - 1) {
                setReaderIndex(index);
            } else if (index > 0) {
                setReaderIndex(index - 1);
            } else {
                closeReader();
            }
        } else if (index < readerIndex) {
            setReaderIndex((i) => i - 1);
        }
    }

    // Render
    if (!links || links.length === 0) {
        return (
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>Links</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={`refresh-badge ${refreshed ? 'show' : ''}`}>{refreshed ? 'Updated' : loading ? 'Loading...' : 'Latest'}</div>
                        <button
                            type="button"
                            className="reader-header-button"
                            title="Open reading view"
                            onClick={() => {
                                const q = (links || []).filter((x) => x.id).map((x) => ({ id: x.id, title: x.title || x.name || (x.meta && x.meta.title) || x.url || 'Untitled', url: x.url || (x.meta && x.meta.url) || '' }));
                                setReaderQueue(q);
                                setReaderIndex(0);
                                setReaderMinimal(true);
                                setReaderOpen(true);
                            }}
                        >
                            <BookOpen size={16} aria-hidden="true" />
                        </button>
                        <a href="https://github.com/homebrew-ec-foss/linkstash" className="gh-button" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
                            <Github size={16} aria-hidden="true" />
                        </a>
                    </div>
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

    // Group links by date
    const groups = groupByDate(links);

    // Header display: prefer the page title, but avoid repeating the H1 if the content's H1 matches the title
    const currentReaderItem = readerQueue[readerIndex] || {};
    const title = currentReaderItem.title || '';
    const url = currentReaderItem.url || '';
    let contentH1 = '';
    if (readerContent) {
        const h1Match = readerContent.match(/(^|\n)#\s+(.+?)(\n|$)/);
        contentH1 = h1Match ? h1Match[2].trim() : '';
    }
    const normalize = (s: string) => (s || '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const titleSameAsH1 = title && contentH1 && normalize(title) === normalize(contentH1);

    let headerText = '';
    let headerHref = '';

    // Prefer showing the hostname when a URL is available (user wants link in top bar)
    if (url) {
        try { headerText = new URL(url).hostname; } catch (e) { headerText = url; }
        headerHref = url;
    } else if (title) {
        headerText = title;
        headerHref = '';
    } else {
        headerText = 'Reader';
        headerHref = '';
    }

    // Shorten title for the H1 fallback
    const shortTitle = title ? title.split(/\s*[-|:]\s*/)[0].trim() : '';

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10 }}>
                <div style={{ fontWeight: 600 }}>HSP Linkstash</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={`refresh-badge ${refreshed ? 'show' : ''}`}>{refreshed ? 'Updated' : loading ? 'Loading...' : 'Latest'}</div>
                    <button
                        type="button"
                        className="reader-header-button"
                        title="Open reading view"
                        onClick={() => {
                            const q = (links || []).filter((x) => x.id).map((x) => ({ id: x.id, title: x.title || x.name || (x.meta && x.meta.title) || x.url || 'Untitled', url: x.url || (x.meta && x.meta.url) || '' }));
                            setReaderQueue(q);
                            setReaderIndex(0);
                            setReaderMinimal(true);
                            setReaderOpen(true);
                        }}
                    >
                        <BookOpen size={16} aria-hidden="true" />
                    </button>
                    <a href="https://github.com/homebrew-ec-foss/linkstash" className="gh-button" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
                        <Github size={16} aria-hidden="true" />
                    </a>
                </div>
            </div>

            <div>
                {groups.map((g) => (
                    <div key={g.key} className="date-group">
                        <div className="date-heading">{g.label}</div>
                        <ol className="link-list">
                            {g.items.map((l: any, idx: number) => {
                                const url = l.url || (l.meta && l.meta.url) || '';
                                const title = l.title || l.name || (l.meta && l.meta.title) || url || 'Untitled';
                                let domain = l.domain || (l.meta && l.meta.domain) || '';
                                if (!domain && url) { try { domain = new URL(url).hostname } catch (e) { domain = '' } }

                                return (
                                    <li key={l.id || url || idx} className={`link-item ${refreshed ? 'flash' : ''}`}>
                                        <div className="rank">{l.displayIndex || idx + 1}.</div>
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
                ))}
            </div>

            {/* Reader modal */}
            {readerOpen && (
                <div className="reader-overlay" role="dialog" aria-modal="true" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                    <div className={`reader-panel ${readerMinimal ? 'reader-minimal' : ''}`}>
                        <aside className="reader-sidebar">
                            <div className="sidebar-title">{readerQueue[readerIndex]?.title || 'Reader'}</div>
                            <div className="sidebar-excerpt">{getExcerpt(readerContent || '', 800) || 'No preview available.'}</div>
                        </aside>

                        <div className="reader-body">
                            <div className="reader-ctrls-vertical" role="toolbar" aria-label="Reader navigation">
                                <button className="reader-btn-small" type="button" onClick={gotoPrev} disabled={readerIndex === 0}>‹</button>
                                <button className="reader-btn-small" type="button" onClick={gotoNext} disabled={readerIndex >= readerQueue.length - 1}>›</button>
                                <a className="reader-btn-small" href={readerQueue[readerIndex]?.url || '#'} target="_blank" rel="noopener noreferrer" aria-label="Open">⤢</a>
                                <button className="reader-btn-small" type="button" onClick={() => removeFromQueue(readerIndex)} aria-label="Remove">×</button>
                            </div>

                            <div className="reader-header">
                                <div className="reader-title">
                                    {headerHref ? (
                                        <a href={headerHref} target="_blank" rel="noopener noreferrer" className="reader-header-link" title={headerHref}>{headerText}</a>
                                    ) : (
                                        <span className="reader-header-text">{headerText}</span>
                                    )}
                                </div>
                                <div className="reader-controls">
                                    <a href={readerQueue[readerIndex]?.url || '#'} target="_blank" rel="noopener noreferrer" className="reader-open-link">Open</a>
                                    <button type="button" onClick={closeReader} aria-label="Close">Close</button>
                                </div>
                            </div>

                            <div className="reader-content">
                                {readerLoading ? (
                                    <div className="p-6 text-center text-gray-500">Loading…</div>
                                ) : readerError ? (
                                    <div className="p-6 text-center text-gray-500">{readerError}</div>
                                ) : readerContent ? (
                                    <article className="markdown-body">
                                        {(!readerContent.match(/(^|\n)#{1}\s+/)) && (shortTitle || readerQueue[readerIndex]?.title) ? (
                                            <h1 className="markdown-title">{shortTitle || readerQueue[readerIndex]?.title}</h1>
                                        ) : null}

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
                                                                // /watch?v=ID or /shorts/ID
                                                                const v = u.searchParams.get('v');
                                                                if (v) return v;
                                                                const parts = u.pathname.split('/').filter(Boolean);
                                                                // handle /shorts/<id>
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

                                                    // Fallback to normal img with a graceful proxy-on-error fallback.
                                                    return (
                                                        <img
                                                            src={src}
                                                            alt={alt}
                                                            title={title}
                                                            className="markdown-img"
                                                            onError={(e: any) => {
                                                                try {
                                                                    const t = e.currentTarget as HTMLImageElement;
                                                                    // only attempt proxy once
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
                                        >
                                            {readerContent}
                                        </ReactMarkdown>
                                    </article>
                                ) : (
                                    <div className="p-6 text-center text-gray-500">No content.</div>
                                )}
                            </div>
                        </div>

                        <aside className="reader-queue">
                            <ol>
                                {readerQueue.map((it, i) => (
                                    <li key={it.id || it.url || i} className={i === readerIndex ? 'active' : ''} onClick={() => setReaderIndex(i)}>
                                        <div className="queue-title">{it.title}</div>
                                        <button className="queue-remove" onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }} aria-label="Remove">×</button>
                                    </li>
                                ))}
                            </ol>
                        </aside>
                    </div>
                </div>
            )}
        </div>
    );
}
