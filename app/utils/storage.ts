/**
 * Utilities for safe localStorage operations with error handling
 */

import { logger } from '../../lib/logger';
import { LINKS_CACHE_PREFIX } from '../../lib/constants';

/**
 * Safely get item from localStorage
 */
export function getFromLocalStorage<T>(key: string): T | null {
    try {
        if (typeof window === 'undefined') {
            return null;
        }
        const item = localStorage.getItem(key);
        if (!item) return null;
        return JSON.parse(item) as T;
    } catch (error) {
        logger.warn(`Failed to retrieve from localStorage: ${key}`, error);
        return null;
    }
}

/**
 * Safely set item in localStorage
 */
export function setToLocalStorage<T>(key: string, value: T): boolean {
    try {
        if (typeof window === 'undefined') {
            return false;
        }
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        logger.warn(`Failed to save to localStorage: ${key}`, error);
        return false;
    }
}

/**
 * Safely remove item from localStorage
 */
export function removeFromLocalStorage(key: string): boolean {
    try {
        if (typeof window === 'undefined') {
            return false;
        }
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        logger.warn(`Failed to remove from localStorage: ${key}`, error);
        return false;
    }
}

/**
 * Get cache key for links by ranking mode
 */
export function getLinksCacheKey(mode: string): string {
    return `${LINKS_CACHE_PREFIX}_${mode}`;
}
