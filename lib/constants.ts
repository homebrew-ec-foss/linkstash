/**
 * Application-wide constants
 */

// Reader constants
export const READER_CONTENT_LOAD_TIMEOUT_MS = 8000;
export const READER_REFRESH_ANIMATION_DURATION_MS = 1800;
export const READER_EXCERPT_MAX_LENGTH = 300;

// Cache constants
export const LINKS_CACHE_PREFIX = 'links_cache';

// Logger levels
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}
