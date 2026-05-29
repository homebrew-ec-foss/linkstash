/**
 * Custom hook for infinite scroll/pagination
 * Loads more items as user scrolls to bottom
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface UseLazyLoadParams {
    isLoading: boolean;
    canLoadMore: boolean;
    onLoadMore: () => void;
    threshold?: number; // pixels from bottom to trigger load
}

/**
 * Hook for infinite scroll detection using Intersection Observer
 */
export function useLazyLoad({
    isLoading,
    canLoadMore,
    onLoadMore,
    threshold = 500,
}: UseLazyLoadParams): React.RefObject<HTMLDivElement | null> {
    const sentinelRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        // Create intersection observer to detect when sentinel is near viewport
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    // Load more when sentinel enters viewport and not already loading
                    if (entry.isIntersecting && !isLoading && canLoadMore) {
                        onLoadMore();
                    }
                });
            },
            {
                rootMargin: `${threshold}px`,
            }
        );

        observerRef.current.observe(sentinel);

        return () => {
            observerRef.current?.disconnect();
        };
    }, [isLoading, canLoadMore, onLoadMore, threshold]);

    return sentinelRef;
}
