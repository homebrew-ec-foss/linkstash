/**
 * LinksList component - displays links grouped by date
 */

'use client';

import React, { JSX } from 'react';
import { BookOpen } from 'lucide-react';
import posthog from 'posthog-js';
import { useLazyLoad } from '../hooks/useLazyLoad';
import type { Link, DateGroup } from '../../lib/types';

interface LinksListProps {
    groups: DateGroup[];
    isLoading: boolean;
    isRefreshed: boolean;
    hasMore?: boolean;
    onOpenReader: (link: Link) => void;
    onLoadMore?: () => void;
}

export function LinksList({
    groups,
    isLoading,
    isRefreshed,
    hasMore = false,
    onOpenReader,
    onLoadMore = () => { },
}: LinksListProps): JSX.Element {
    const sentinelRef = useLazyLoad({
        isLoading,
        canLoadMore: hasMore,
        onLoadMore,
        threshold: 300,
    });

    if (isLoading && groups.length === 0) {
        return (
            <ol className="link-list">
                <li className="p-4 text-center text-gray-500">Loading links…</li>
            </ol>
        );
    }

    if (groups.length === 0) {
        return (
            <ol className="link-list">
                <li className="p-4 text-center text-gray-500">No links found.</li>
            </ol>
        );
    }

    return (
        <>
            {groups.map((group) => (
                <div key={group.key} className="date-group">
                    <div className="date-heading">{group.label}</div>
                    <ol className="link-list">
                        {group.items.map((link, idx) => (
                            <LinkItem
                                key={link.id || link.url || idx}
                                link={link}
                                index={idx}
                                isRefreshed={isRefreshed}
                                onOpenReader={() => onOpenReader(link)}
                            />
                        ))}
                    </ol>
                </div>
            ))}

            {/* Lazy load sentinel */}
            {hasMore && (
                <div ref={sentinelRef} className="lazy-load-sentinel">
                    {isLoading && <div className="text-center text-gray-500 p-2">Loading…</div>}
                </div>
            )}
        </>
    );
}

interface LinkItemProps {
    link: Link;
    index: number;
    isRefreshed: boolean;
    onOpenReader: () => void;
}

function LinkItem({
    link,
    index,
    isRefreshed,
    onOpenReader,
}: LinkItemProps): JSX.Element {
    const url = link.url || (link.meta?.url as string) || '';
    const title = link.title || (link.meta?.title as string) || url || 'Untitled';
    let domain = link.domain || (link.meta?.domain as string) || '';

    if (!domain && url) {
        try {
            domain = new URL(url).hostname;
        } catch (e) {
            domain = '';
        }
    }

    const hasReaderId = Boolean(link.id);
    const rank = link.displayIndex ?? index + 1;

    const handleLinkClick = () => {
        posthog.capture('link_clicked', {
            link_title: title,
            link_url: url,
            link_domain: domain,
            link_rank: rank,
            vote_count: link.count || 0,
        });
    };

    const handleReaderClick = () => {
        posthog.capture('reader_opened_from_link', {
            link_id: link.id,
            link_title: title,
            link_url: url,
        });
        onOpenReader();
    };

    const roomComment = link.meta?.roomComment ?? (link as any).roomComment ?? '';
    const voteCount = link.count ?? 0;

    return (
        <li
            className={`link-item ${isRefreshed ? 'flash' : ''}`}
            role="listitem"
        >
            <div className="rank">{rank}.</div>
            <div className="link-main">
                <a
                    href={url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-title"
                    onClick={handleLinkClick}
                >
                    {title}
                </a>
                <div className="link-domain">
                    {domain}
                    {roomComment && ` — ${roomComment}`}
                </div>
            </div>

            <div className="votes">{voteCount ? `${voteCount} votes` : ''}</div>

            <button
                type="button"
                className="link-reader-button"
                title={
                    hasReaderId
                        ? 'Open in reader view'
                        : 'Reader view unavailable'
                }
                aria-label={
                    hasReaderId
                        ? 'Open in reader view'
                        : 'Reader view unavailable'
                }
                disabled={!hasReaderId}
                onClick={handleReaderClick}
            >
                <BookOpen size={13} aria-hidden="true" />
            </button>
        </li>
    );
}
