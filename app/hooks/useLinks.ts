/**
 * Custom hook for fetching and managing links with caching
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { sortLinksByMode } from '../../lib/sorting';
import { getFromLocalStorage, setToLocalStorage, getLinksCacheKey } from '../utils/storage';
import { logger } from '../../lib/logger';
import type { Link, RankMode } from '../../lib/types';

export interface UseLinksReturn {
    links: Link[] | null;
    isLoading: boolean;
    isRefreshed: boolean;
    refresh: () => void;
}

/**
 * Custom hook for fetching links with caching and sorting
 */
export function useLinks(mode: RankMode): UseLinksReturn {
    const [links, setLinks] = useState<Link[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshed, setIsRefreshed] = useState(false);

    const fetchLinks = useCallback(async () => {
        let cancelled = false;

        try {
            // Try to load from cache first
            const cacheKey = getLinksCacheKey(mode);
            const cached = getFromLocalStorage<Link[]>(cacheKey);
            if (cached) {
                setLinks(sortLinksByMode(cached, mode));
            }

            // Always fetch fresh data in background
            const response = await fetch(`/api/links?mode=${mode}`);
            if (!response.ok) {
                logger.warn(`Failed to fetch links: ${response.status}`);
                setIsLoading(false);
                return;
            }

            const data: Link[] = await response.json();
            if (cancelled) return;

            const sorted = sortLinksByMode(data, mode).map((item: Link, index: number) => ({
                ...item,
                displayIndex: index + 1,
            }));

            // Check if data changed
            const previousIds = links ? links.map((l: Link) => l.id || l.url).join(',') : '';
            const newIds = sorted.map((l: Link) => l.id || l.url).join(',');

            if (previousIds !== newIds) {
                setLinks(sorted);
                setToLocalStorage(cacheKey, sorted);
                setIsRefreshed(true);
                setTimeout(() => setIsRefreshed(false), 1800);
            } else if (!links) {
                // Ensure links are set even if no changes
                setLinks(sorted);
            }
        } catch (error) {
            logger.error('Error fetching links', error);
            if (!cancelled) {
                setIsLoading(false);
            }
        } finally {
            if (!cancelled) {
                setIsLoading(false);
            }
        }

        return () => {
            cancelled = true;
        };
    }, [mode, links]);

    useEffect(() => {
        fetchLinks();
    }, [mode, fetchLinks]);

    const refresh = useCallback(() => {
        setIsLoading(true);
        fetchLinks();
    }, [fetchLinks]);

    return { links, isLoading, isRefreshed, refresh };
}
