/**
 * Custom hook for paginated links loading with infinite scroll
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { sortLinksByMode } from '../../lib/sorting';
import { getFromLocalStorage, setToLocalStorage, getLinksCacheKey } from '../utils/storage';
import { logger } from '../../lib/logger';
import type { Link, RankMode } from '../../lib/types';

const LINKS_PER_PAGE = 50;

export interface usePaginatedLinksReturn {
    links: Link[] | null;
    isLoading: boolean;
    isRefreshed: boolean;
    hasMore: boolean;
    loadMore: () => void;
}

/**
 * Custom hook for paginated links loading with caching
 */
export function usePaginatedLinks(mode: RankMode): usePaginatedLinksReturn {
    const [links, setLinks] = useState<Link[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshed, setIsRefreshed] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const [allLinksCount, setAllLinksCount] = useState(0);

    const fetchLinks = useCallback(
        async (pageOffset: number = 0) => {
            let cancelled = false;

            try {
                // Load initial cache if offset is 0
                if (pageOffset === 0) {
                    const cacheKey = getLinksCacheKey(mode);
                    const cached = getFromLocalStorage<Link[]>(cacheKey);
                    if (cached) {
                        setLinks(sortLinksByMode(cached, mode));
                    }
                }

                // Fetch paginated data
                const response = await fetch(
                    `/api/links?mode=${mode}&offset=${pageOffset}&limit=${LINKS_PER_PAGE}`
                );
                if (!response.ok) {
                    logger.warn(`Failed to fetch links: ${response.status}`);
                    if (pageOffset === 0) {
                        setIsLoading(false);
                    }
                    return;
                }

                const data = await response.json();
                if (cancelled) return;

                const sorted = sortLinksByMode(data.items || [], mode).map(
                    (item: Link, index: number) => ({
                        ...item,
                        displayIndex: pageOffset + index + 1,
                    })
                );

                if (pageOffset === 0) {
                    // First page - always update to latest
                    setLinks(sorted);
                    setToLocalStorage(getLinksCacheKey(mode), sorted);
                    setIsRefreshed(true);
                    setTimeout(() => setIsRefreshed(false), 1800);
                } else {
                    // Subsequent pages - append
                    setLinks((prev) =>
                        prev ? [...prev, ...sorted] : sorted
                    );
                }

                // Update pagination state
                const totalCount = data.total || 0;
                setAllLinksCount(totalCount);
                setHasMore(pageOffset + LINKS_PER_PAGE < totalCount);
                setOffset(pageOffset + LINKS_PER_PAGE);
            } catch (error) {
                logger.error('Error fetching links', error);
                if (pageOffset === 0) {
                    setIsLoading(false);
                }
            } finally {
                if (pageOffset === 0 && !cancelled) {
                    setIsLoading(false);
                }
            }

            return () => {
                cancelled = true;
            };
        },
        [mode]
    );

    // Initial load - only trigger on mode change
    useEffect(() => {
        setLinks(null);
        setOffset(0);
        setAllLinksCount(0);
        setHasMore(true);
        setIsLoading(true);
        fetchLinks(0);
    }, [mode, fetchLinks]);

    const loadMore = useCallback(() => {
        if (!isLoading && hasMore) {
            fetchLinks(offset);
        }
    }, [isLoading, hasMore, offset, fetchLinks]);

    return { links, isLoading, isRefreshed, hasMore, loadMore };
}
