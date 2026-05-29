/**
 * Centralized sorting logic for links across the application
 * Used by both client and server
 */

import type { Link, RankMode } from './types';

const RISING_SCORE_MULTIPLIER = 1.25;
const RISING_SCORE_MIN_VOTES = 0;

/**
 * Calculate rising score based on votes and time
 * Uses a logarithmic decay function
 */
function calculateRisingScore(link: Link, currentTime: number): number {
    const votes = Math.max(RISING_SCORE_MIN_VOTES, Number(link.count || 0));
    const timestamp = Number(link.ts || 0);

    if (!timestamp || votes <= 0) {
        return 0;
    }

    const ageHours = Math.max(0, (currentTime - timestamp) / 3600000);
    return Math.log2(votes + 1) / Math.pow(ageHours + 2, RISING_SCORE_MULTIPLIER);
}

/**
 * Normalize a link with a score based on the ranking mode
 */
export function scoreLink(
    link: Link,
    mode: RankMode,
    currentTime: number = Date.now()
): Link {
    switch (mode) {
        case 'top':
            return { ...link, score: Number(link.count || 0) };
        case 'rising':
            return {
                ...link,
                score: Number(calculateRisingScore(link, currentTime).toFixed(6)),
            };
        case 'latest':
        default:
            return { ...link, score: Number(link.ts || 0) };
    }
}

/**
 * Sort links by the specified ranking mode
 * Creates a new sorted array without mutating the original
 */
export function sortLinksByMode(links: Link[], mode: RankMode): Link[] {
    const currentTime = Date.now();
    const scored = links.map((link) => scoreLink(link, mode, currentTime));

    return scored.sort((a, b) => {
        // Primary sort: by score
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;

        // Secondary sort: by vote count
        const countDiff = (b.count || 0) - (a.count || 0);
        if (countDiff !== 0) return countDiff;

        // Tertiary sort: by timestamp (newest first)
        return (b.ts || 0) - (a.ts || 0);
    });
}

/**
 * Validate and normalize rank mode string
 */
export function normalizeRankMode(raw: string | null): RankMode {
    if (raw === 'top' || raw === 'rising') return raw;
    return 'latest';
}
