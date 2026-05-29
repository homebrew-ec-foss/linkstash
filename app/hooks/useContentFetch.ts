/**
 * Custom hook for fetching content with timeout
 */

'use client';

import { useCallback } from 'react';
import { READER_CONTENT_LOAD_TIMEOUT_MS } from '../../lib/constants';
import { logger } from '../../lib/logger';

export interface UseContentFetchReturn {
    fetchContent: (
        id: string
    ) => Promise<{ content: string | null; error: string | null }>;
}

/**
 * Hook for fetching content with timeout handling
 */
export function useContentFetch(): UseContentFetchReturn {
    const fetchContent = useCallback(
        async (id: string): Promise<{ content: string | null; error: string | null }> => {
            try {
                const controller = new AbortController();
                const timeoutId = window.setTimeout(() => {
                    controller.abort();
                }, READER_CONTENT_LOAD_TIMEOUT_MS);

                try {
                    const response = await fetch(`/api/content/${id}`, {
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        return {
                            content: null,
                            error: `Failed to load content (${response.status})`,
                        };
                    }

                    const content = await response.text();
                    return { content, error: null };
                } catch (error) {
                    clearTimeout(timeoutId);
                    if ((error as any)?.name === 'AbortError') {
                        return {
                            content: null,
                            error: 'Content load timeout',
                        };
                    }
                    throw error;
                }
            } catch (error) {
                logger.error('Error fetching content', error);
                return {
                    content: null,
                    error: 'Failed to fetch content',
                };
            }
        },
        []
    );

    return { fetchContent };
}
