/**
 * ReaderModal component - displays content in a modal reader view
 */

'use client';

import React, { JSX, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {
    getExcerpt,
    normalizeForComparison,
    extractFirstHeading,
} from '../../lib/text-utils';
import { useReaderInteractions } from '../hooks/useReaderInteractions';
import { useContentFetch } from '../hooks/useContentFetch';
import type { ReaderState, ReaderQueueItem } from '../../lib/types';

interface ReaderModalProps {
    state: ReaderState;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
    onToggleMinimal: () => void;
    onContentLoad: (content: string) => void;
    onContentError: (error: string) => void;
    onLoadingChange: (loading: boolean) => void;
}

interface SuggestedItem {
    id: string;
    url: string;
    domain: string;
    title: string;
    roomComment: string;
    count: number;
    score: number;
}

interface SuggestedGroup {
    name: string;
    count: number;
}

export function ReaderModal({
    state,
    onNext,
    onPrev,
    onClose,
    onToggleMinimal,
    onContentLoad,
    onContentError,
    onLoadingChange,
}: ReaderModalProps): JSX.Element | null {
    const { fetchContent } = useContentFetch();
    const currentItem = state.queue[state.currentIndex];
    const [fontSize, setFontSize] = React.useState(16);
    const [fontFamily, setFontFamily] = React.useState('system-ui');
    const [relatedItems, setRelatedItems] = React.useState<SuggestedItem[]>([]);
    const [relatedGroups, setRelatedGroups] = React.useState<SuggestedGroup[]>([]);
    const [relatedLoading, setRelatedLoading] = React.useState(false);

    useReaderInteractions({
        isOpen: state.isOpen,
        onNext,
        onPrev,
        onClose,
        onToggleMinimal,
    });

    // Load content when queue or index changes
    useEffect(() => {
        if (!state.isOpen || !currentItem?.id) {
            return;
        }

        onLoadingChange(true);
        (async () => {
            const { content, error } = await fetchContent(currentItem.id!);
            if (error) {
                onContentError(error);
            } else if (content) {
                onContentLoad(content);
            }
        })();
    }, [state.isOpen, state.currentIndex, currentItem?.id, fetchContent, onContentLoad, onContentError, onLoadingChange]);

    // Load related items when content changes
    useEffect(() => {
        if (!currentItem?.id) {
            setRelatedItems([]);
            setRelatedGroups([]);
            return;
        }

        setRelatedLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/related/${encodeURIComponent(currentItem.id!)}`);
                if (res.ok) {
                    const data = await res.json();
                    setRelatedItems(Array.isArray(data.related) ? data.related : []);
                    setRelatedGroups(Array.isArray(data.groups) ? data.groups : []);
                } else {
                    setRelatedItems([]);
                    setRelatedGroups([]);
                }
            } catch (e) {
                setRelatedItems([]);
                setRelatedGroups([]);
            } finally {
                setRelatedLoading(false);
            }
        })();
    }, [currentItem?.id]);

    if (!state.isOpen) {
        return null;
    }

    return (
        <div
            className="reader-overlay"
            role="dialog"
            aria-modal="true"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
        >
            <div className={`reader-panel ${state.isMinimal ? 'reader-minimal' : ''}`}>
                <aside className="reader-sidebar">
                    <div className="sidebar-title">{currentItem?.title || 'Reader'}</div>
                    <div className="sidebar-excerpt">
                        {getExcerpt(state.content || '', 800) || 'No preview available.'}
                    </div>
                </aside>

                <div className="reader-body">
                    <ReaderVerticalControls
                        canGoPrev={state.currentIndex > 0}
                        canGoNext={state.currentIndex < state.queue.length - 1}
                        currentUrl={currentItem?.url}
                        onPrev={onPrev}
                        onNext={onNext}
                        onRemove={() => {
                            // TODO: implement remove from queue
                        }}
                    />

                    <ReaderHeader
                        currentItem={currentItem}
                        content={state.content}
                        onClose={onClose}
                        fontSize={fontSize}
                        onFontSizeChange={setFontSize}
                        fontFamily={fontFamily}
                        onFontFamilyChange={setFontFamily}
                    />

                    <ReaderContent
                        isLoading={state.isLoading}
                        error={state.error}
                        content={state.content}
                        currentItem={currentItem}
                        extractedH1={
                            extractFirstHeading(state.content || undefined).h1
                        }
                        contentWithoutH1={
                            extractFirstHeading(state.content || undefined).content
                        }
                        fontSize={fontSize}
                        fontFamily={fontFamily}
                    />
                </div>

                <aside className="reader-suggestions-side" aria-label="Suggested articles and groups">
                    <div className="suggestion-section-title">Suggested Articles</div>
                    {relatedLoading ? (
                        <div className="suggestion-empty">Finding related links...</div>
                    ) : relatedItems.length === 0 ? (
                        <div className="suggestion-empty">No related links yet.</div>
                    ) : (
                        <ol className="suggestion-list">
                            {relatedItems.slice(0, 10).map((item) => (
                                <li key={item.id}>
                                    <a href={`/reader/${encodeURIComponent(item.id)}`} className="suggestion-link">
                                        <span className="suggestion-title">{item.title}</span>
                                        <span className="suggestion-meta">{item.domain || 'unknown domain'} • {Math.round(item.score * 100)}%</span>
                                    </a>
                                </li>
                            ))}
                        </ol>
                    )}

                    <div className="suggestion-section-title">Suggested Groups</div>
                    {relatedGroups.length === 0 ? (
                        <div className="suggestion-empty">No groups available.</div>
                    ) : (
                        <ul className="suggestion-group-list">
                            {relatedGroups.slice(0, 8).map((group) => (
                                <li key={group.name}>
                                    <span>{group.name}</span>
                                    <strong>{group.count}</strong>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>
            </div>
        </div>
    );
}

interface ReaderVerticalControlsProps {
    canGoPrev: boolean;
    canGoNext: boolean;
    currentUrl?: string;
    onPrev: () => void;
    onNext: () => void;
    onRemove: () => void;
}

function ReaderVerticalControls({
    canGoPrev,
    canGoNext,
    currentUrl,
    onPrev,
    onNext,
    onRemove,
}: ReaderVerticalControlsProps): JSX.Element {
    return (
        <div className="reader-ctrls-vertical" role="toolbar" aria-label="Reader navigation">
            <button
                className="reader-btn-small"
                type="button"
                onClick={onPrev}
                disabled={!canGoPrev}
                title="Previous (← or swipe right)"
                aria-label="Previous article"
            >
                ‹
            </button>
            <button
                className="reader-btn-small"
                type="button"
                onClick={onNext}
                disabled={!canGoNext}
                title="Next (→ or swipe left)"
                aria-label="Next article"
            >
                ›
            </button>
            <a
                className="reader-btn-small"
                href={currentUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in new tab"
                title="Open in new tab"
            >
                ⤢
            </a>
            <button
                className="reader-btn-small"
                type="button"
                onClick={onRemove}
                aria-label="Remove from queue"
                title="Remove from queue"
            >
                ×
            </button>
        </div>
    );
}

interface ReaderHeaderProps {
    currentItem?: ReaderQueueItem;
    content: string | null;
    onClose: () => void;
    fontSize: number;
    onFontSizeChange: (size: number) => void;
    fontFamily: string;
    onFontFamilyChange: (family: string) => void;
}

function ReaderHeader({
    currentItem,
    content,
    onClose,
    fontSize,
    onFontSizeChange,
    fontFamily,
    onFontFamilyChange,
}: ReaderHeaderProps): JSX.Element {
    const url = currentItem?.url || '';
    let headerText = '';
    let headerHref = '';

    if (url) {
        try {
            headerText = new URL(url).hostname;
        } catch (e) {
            headerText = url;
        }
        headerHref = url;
    } else if (currentItem?.title) {
        headerText = currentItem.title;
    } else {
        headerText = 'Reader';
    }

    return (
        <div className="reader-header">
            <div className="reader-title">
                {headerHref ? (
                    <a
                        href={headerHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="reader-header-link"
                        title={headerHref}
                    >
                        {headerText}
                    </a>
                ) : (
                    <span className="reader-header-text">{headerText}</span>
                )}
            </div>
            <div className="reader-controls">
                <div className="font-picker">
                    <label htmlFor="font-family-select">Font:</label>
                    <select
                        id="font-family-select"
                        value={fontFamily}
                        onChange={(e) => onFontFamilyChange(e.target.value)}
                        className="font-select"
                    >
                        <option value="system-ui">System</option>
                        <option value="Baskerville, 'Times New Roman', serif">Baskerville</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="EB Garamond, serif">EB Garamond</option>
                        <option value="Garamond, serif">Garamond</option>
                        <option value="'Palatino Linotype', 'Book Antiqua', Palatino, serif">Palatino</option>
                        <option value="Cambria, serif">Cambria</option>
                        <option value="'Times New Roman', serif">Times</option>
                        <option value="Courier, monospace">Monospace</option>
                    </select>
                </div>

                <div className="font-size-picker">
                    <label htmlFor="font-size-input">Size:</label>
                    <input
                        id="font-size-input"
                        type="range"
                        min="12"
                        max="24"
                        value={fontSize}
                        onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10))}
                        className="font-size-slider"
                    />
                    <span className="font-size-display">{fontSize}px</span>
                </div>

                <a
                    href={url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="reader-open-link"
                >
                    Open
                </a>
                <button type="button" onClick={onClose} aria-label="Close reader">
                    Close
                </button>
            </div>
        </div>
    );
}

interface ReaderContentProps {
    isLoading: boolean;
    error: string | null;
    content: string | null;
    currentItem?: ReaderQueueItem;
    extractedH1: string;
    contentWithoutH1: string;
    fontSize: number;
    fontFamily: string;
}

function ReaderContent({
    isLoading,
    error,
    content,
    currentItem,
    extractedH1,
    contentWithoutH1,
    fontSize,
    fontFamily,
}: ReaderContentProps): JSX.Element {
    if (isLoading) {
        return <div className="p-6 text-center text-gray-500">Loading…</div>;
    }

    if (error) {
        return (
            <div className="p-6 text-center text-gray-500">{error}</div>
        );
    }

    if (!content) {
        return (
            <div className="p-6 text-center text-gray-500">No content.</div>
        );
    }

    const title = currentItem?.title || '';
    const heading = extractedH1 || title || 'Article';

    return (
        <div className="reader-content">
            <article
                className="markdown-body"
                style={{
                    fontSize: `${fontSize}px`,
                    fontFamily: fontFamily,
                }}
            >
                <h1 className="markdown-title">{heading}</h1>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                        img: ({ src, alt, title: imgTitle }) => (
                            <ReaderImage
                                src={typeof src === 'string' ? src : undefined}
                                alt={alt}
                                title={imgTitle}
                            />
                        ),
                    }}
                >
                    {contentWithoutH1}
                </ReactMarkdown>
            </article>
        </div>
    );
}

interface ReaderImageProps {
    src?: string;
    alt?: string;
    title?: string;
}

function ReaderImage({
    src,
    alt,
    title,
}: ReaderImageProps): JSX.Element {
    const getYouTubeId = (url?: string): string | null => {
        if (!url) return null;
        try {
            const u = new URL(url);
            if (u.hostname === 'youtu.be') {
                return u.pathname.slice(1);
            }
            if (
                ['youtube.com', 'www.youtube.com'].some((host) =>
                    u.hostname.endsWith(host)
                )
            ) {
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

    const youtubeId = getYouTubeId(src);
    if (youtubeId) {
        return (
            <div className="embed-youtube">
                <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    title={alt || title || 'YouTube video'}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </div>
        );
    }

    return (
        <img
            src={String(src) || undefined}
            alt={alt}
            title={title}
            className="markdown-img"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                const img = e.currentTarget;
                if (img.dataset.proxied) return;
                img.dataset.proxied = '1';
                img.src = `/api/proxy?url=${encodeURIComponent(String(src || ''))}`;
            }}
        />
    );
}
