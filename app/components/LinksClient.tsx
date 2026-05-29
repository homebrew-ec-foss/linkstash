'use client';

import React, { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { groupItemsByDate } from '../../lib/text-utils';
import { usePaginatedLinks } from '../hooks/usePaginatedLinks';
import { Header } from './Header';
import { LinksList } from './LinksList';
import { SuggestionsPanel } from './SuggestionsPanel';
import { logger } from '../../lib/logger';
import type { RankMode, Link, RelatedLink, RelatedGroup } from '../../lib/types';

/**
 * Main client component for the links feed
 * Manages links, suggestions, and reader state
 */
export default function LinksClient(): JSX.Element {
    const [rankMode, setRankMode] = useState<RankMode>('latest');
    const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
    const [suggestedItems, setSuggestedItems] = useState<RelatedLink[]>([]);
    const [suggestedGroups, setSuggestedGroups] = useState<RelatedGroup[]>([]);
    const [suggestedLoading, setSuggestedLoading] = useState(false);
    const [suggestedSourceTitle, setSuggestedSourceTitle] = useState('');

    const { links, isLoading, isRefreshed, hasMore, loadMore } = usePaginatedLinks(rankMode);
    const router = useRouter();

    // Load related links/suggestions based on the top link
    useEffect(() => {
        const topLink = links?.[0];
        if (!topLink?.id) {
            setSuggestedItems([]);
            setSuggestedGroups([]);
            setSuggestedSourceTitle('');
            return;
        }

        setSuggestedSourceTitle(
            topLink.title || (topLink.meta?.title as string) || topLink.url || 'Top link'
        );

        let cancelled = false;

        (async () => {
            setSuggestedLoading(true);
            try {
                const response = await fetch(
                    `/api/related/${encodeURIComponent(String(topLink.id))}`
                );
                if (!response.ok) {
                    logger.warn(
                        `Failed to fetch related links: ${response.status}`
                    );
                    return;
                }

                const payload = await response.json();
                if (cancelled) return;

                setSuggestedItems(
                    Array.isArray(payload.related) ? payload.related : []
                );
                setSuggestedGroups(
                    Array.isArray(payload.groups) ? payload.groups : []
                );
            } catch (error) {
                if (!cancelled) {
                    logger.error('Error fetching related links', error);
                    setSuggestedItems([]);
                    setSuggestedGroups([]);
                }
            } finally {
                if (!cancelled) {
                    setSuggestedLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [links]);

    // Group links by date for display
    const dateGroups = links ? groupItemsByDate(links) : [];

    const handleOpenReader = (link: Link) => {
        if (!link.id) {
            logger.warn('Cannot open reader for link without ID');
            return;
        }

        // Navigate directly to the clicked link in reader view
        router.push(`/reader/${encodeURIComponent(link.id)}`);
    };

    return (
        <div className="card">
            <Header
                rankMode={rankMode}
                onRankModeChange={setRankMode}
                isLoading={isLoading}
                isRefreshed={isRefreshed}
                links={links || []}
                onOpenReader={() => {
                    const firstLink = links?.find((l) => Boolean(l.id));
                    if (firstLink) {
                        handleOpenReader(firstLink);
                    }
                }}
                suggestionsExpanded={suggestionsExpanded}
                onToggleSuggestions={() => setSuggestionsExpanded((v) => !v)}
            />

            <div>
                <SuggestionsPanel
                    isExpanded={suggestionsExpanded}
                    onToggle={() => setSuggestionsExpanded((v) => !v)}
                    isLoading={suggestedLoading}
                    sourceTitle={suggestedSourceTitle}
                    suggestedItems={suggestedItems}
                    suggestedGroups={suggestedGroups}
                />

                <LinksList
                    groups={dateGroups}
                    isLoading={isLoading}
                    isRefreshed={isRefreshed}
                    hasMore={hasMore}
                    onOpenReader={handleOpenReader}
                    onLoadMore={loadMore}
                />
            </div>
        </div>
    );
}
