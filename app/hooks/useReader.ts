/**
 * Custom hook for managing reader state
 * Consolidates reader-related state and actions into a single reducer
 */

'use client';

import { useReducer, useCallback } from 'react';
import type { ReaderState, ReaderQueueItem } from '../../lib/types';

type ReaderAction =
    | { type: 'OPEN'; payload: ReaderQueueItem[] }
    | { type: 'CLOSE' }
    | { type: 'SET_QUEUE'; payload: ReaderQueueItem[] }
    | { type: 'NEXT' }
    | { type: 'PREV' }
    | { type: 'SET_INDEX'; payload: number }
    | { type: 'SET_CONTENT'; payload: string }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'CLEAR_ERROR' }
    | { type: 'TOGGLE_MINIMAL' };

const initialState: ReaderState = {
    isOpen: false,
    queue: [],
    currentIndex: 0,
    content: null,
    isLoading: false,
    error: null,
    isMinimal: true,
};

function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
    switch (action.type) {
        case 'OPEN':
            return {
                ...state,
                isOpen: true,
                queue: action.payload,
                currentIndex: 0,
                content: null,
                error: null,
            };

        case 'CLOSE':
            return {
                ...state,
                isOpen: false,
                content: null,
                error: null,
            };

        case 'SET_QUEUE':
            return {
                ...state,
                queue: action.payload,
                currentIndex: 0,
            };

        case 'NEXT':
            return {
                ...state,
                currentIndex: Math.min(state.currentIndex + 1, state.queue.length - 1),
                content: null,
                error: null,
                isLoading: true,
            };

        case 'PREV':
            return {
                ...state,
                currentIndex: Math.max(state.currentIndex - 1, 0),
                content: null,
                error: null,
                isLoading: true,
            };

        case 'SET_INDEX':
            return {
                ...state,
                currentIndex: action.payload,
                content: null,
                error: null,
                isLoading: true,
            };

        case 'SET_CONTENT':
            return {
                ...state,
                content: action.payload,
                isLoading: false,
            };

        case 'SET_LOADING':
            return {
                ...state,
                isLoading: action.payload,
            };

        case 'SET_ERROR':
            return {
                ...state,
                error: action.payload,
                isLoading: false,
            };

        case 'CLEAR_ERROR':
            return {
                ...state,
                error: null,
            };

        case 'TOGGLE_MINIMAL':
            return {
                ...state,
                isMinimal: !state.isMinimal,
            };

        default:
            return state;
    }
}

export interface UseReaderReturn {
    state: ReaderState;
    open: (queue: ReaderQueueItem[]) => void;
    close: () => void;
    next: () => void;
    prev: () => void;
    goToIndex: (index: number) => void;
    setContent: (content: string) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    clearError: () => void;
    toggleMinimal: () => void;
    canGoNext: boolean;
    canGoPrev: boolean;
    currentItem: ReaderQueueItem | undefined;
}

/**
 * Custom hook for managing reader modal state
 */
export function useReader(): UseReaderReturn {
    const [state, dispatch] = useReducer(readerReducer, initialState);

    const open = useCallback((queue: ReaderQueueItem[]) => {
        dispatch({ type: 'OPEN', payload: queue });
    }, []);

    const close = useCallback(() => {
        dispatch({ type: 'CLOSE' });
    }, []);

    const next = useCallback(() => {
        dispatch({ type: 'NEXT' });
    }, []);

    const prev = useCallback(() => {
        dispatch({ type: 'PREV' });
    }, []);

    const goToIndex = useCallback((index: number) => {
        dispatch({ type: 'SET_INDEX', payload: index });
    }, []);

    const setContent = useCallback((content: string) => {
        dispatch({ type: 'SET_CONTENT', payload: content });
    }, []);

    const setLoading = useCallback((loading: boolean) => {
        dispatch({ type: 'SET_LOADING', payload: loading });
    }, []);

    const setError = useCallback((error: string | null) => {
        dispatch({ type: 'SET_ERROR', payload: error });
    }, []);

    const clearError = useCallback(() => {
        dispatch({ type: 'CLEAR_ERROR' });
    }, []);

    const toggleMinimal = useCallback(() => {
        dispatch({ type: 'TOGGLE_MINIMAL' });
    }, []);

    const canGoNext = state.currentIndex < state.queue.length - 1;
    const canGoPrev = state.currentIndex > 0;
    const currentItem = state.queue[state.currentIndex];

    return {
        state,
        open,
        close,
        next,
        prev,
        goToIndex,
        setContent,
        setLoading,
        setError,
        clearError,
        toggleMinimal,
        canGoNext,
        canGoPrev,
        currentItem,
    };
}
