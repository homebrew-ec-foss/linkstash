/**
 * Text processing and formatting utilities
 */

import { READER_EXCERPT_MAX_LENGTH } from './constants';

/**
 * Extract excerpt from markdown content with a maximum length
 * Strips markdown formatting while preserving text content
 */
export function getExcerpt(markdown: string | null, maxLength: number = READER_EXCERPT_MAX_LENGTH): string {
    if (!markdown) return '';

    let text = markdown;

    // Remove markdown images
    text = text.replace(/!\[.*?\]\(.*?\)/g, ' ');

    // Remove markdown links but keep link text
    text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');

    // Remove markdown formatting characters
    text = text.replace(/[#*_>`~\-]{1,}/g, ' ');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    if (text.length <= maxLength) {
        return text;
    }

    return text.slice(0, maxLength).trim() + '…';
}

/**
 * Extract date groups from a list of items with timestamps
 * Groups by ISO date string and provides human-readable labels
 */
export function groupItemsByDate<T extends { ts?: number }>(
    items: T[]
): Array<{ key: string; label: string; items: T[] }> {
    const groups: Record<string, T[]> = {};

    items.forEach((item) => {
        const key = item.ts ? new Date(item.ts).toISOString().slice(0, 10) : 'unknown';
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(item);
    });

    // Sort keys newest first
    const sortedKeys = Object.keys(groups).sort((a, b) => (b > a ? 1 : -1));

    return sortedKeys.map((key) => ({
        key,
        label: formatDateLabel(key === 'unknown' ? undefined : new Date(key).getTime()),
        items: groups[key],
    }));
}

/**
 * Format a timestamp into a human-readable date label
 * Returns "Today", "Yesterday", or formatted date string
 */
export function formatDateLabel(timestamp: number | undefined): string {
    if (!timestamp) return 'Unknown';

    const date = new Date(timestamp);
    const now = new Date();

    if (isSameDay(date, now)) {
        return 'Today';
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(date, yesterday)) {
        return 'Yesterday';
    }

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Check if two dates are the same calendar day
 */
function isSameDay(date1: Date, date2: Date): boolean {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    );
}

/**
 * Normalize text for comparison by removing special characters and lowercasing
 */
export function normalizeForComparison(text: string): string {
    return (text || '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Extract first H1 heading from markdown that is not inside a code fence
 */
export function extractFirstHeading(markdown: string | undefined): { h1: string; content: string } {
    if (!markdown) {
        return { h1: '', content: '' };
    }

    const lines = markdown.split(/\r?\n/);
    let inFence = false;
    let fenceToken = '';
    let foundHeading = '';
    const outputLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fenceMatch = line.match(/^(`{3,}|~{3,})/);

        if (fenceMatch) {
            if (!inFence) {
                inFence = true;
                fenceToken = fenceMatch[1];
            } else if (line.startsWith(fenceToken)) {
                inFence = false;
                fenceToken = '';
            }
            outputLines.push(line);
            continue;
        }

        if (!inFence && !foundHeading) {
            const headingMatch = line.match(/^#\s+(.+)$/);
            if (headingMatch) {
                foundHeading = headingMatch[1].trim();
                continue;
            }
        }

        outputLines.push(line);
    }

    return {
        h1: foundHeading,
        content: outputLines.join('\n').trimStart(),
    };
}
