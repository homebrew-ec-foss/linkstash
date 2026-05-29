/**
 * Core type definitions for the linkstash application
 */

export type RankMode = 'latest' | 'top' | 'rising';

export interface Link {
    id: string;
    url: string;
    domain: string;
    title?: string;
    content?: string;
    ts: number;
    count: number;
    score?: number;
    displayIndex?: number;
    meta?: Record<string, unknown>;
    submittedBy?: string;
}

export interface RelatedLink {
    id: string;
    url: string;
    domain: string;
    title: string;
    score: number;
}

export interface RelatedGroup {
    name: string;
    count: number;
}

export interface ReaderState {
    isOpen: boolean;
    queue: ReaderQueueItem[];
    currentIndex: number;
    content: string | null;
    isLoading: boolean;
    error: string | null;
    isMinimal: boolean;
}

export interface ReaderQueueItem {
    id?: string;
    title: string;
    url?: string;
}

export interface DateGroup {
    key: string;
    label: string;
    items: Link[];
}
