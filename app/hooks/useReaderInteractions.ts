/**
 * Custom hook for managing reader interactions (keyboard, touch, scroll)
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface UseReaderInteractionsParams {
    isOpen: boolean;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
    onToggleMinimal?: () => void;
}

const SWIPE_MIN_DISTANCE = 50;
const SWIPE_MAX_TIME = 300;

/**
 * Hook for managing keyboard, touch, and scroll interactions for the reader
 */
export function useReaderInteractions({
    isOpen,
    onNext,
    onPrev,
    onClose,
    onToggleMinimal,
}: UseReaderInteractionsParams): void {
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const touchStartTime = useRef<number | null>(null);

    // Prevent background scrolling when reader is open
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const originalOverflow = document.body.style.overflow;

        const handleTouchMove = (event: TouchEvent) => {
            const overlay = document.querySelector('.reader-overlay');
            if (overlay?.contains(event.target as Node)) {
                // Allow scrolling inside the reader overlay
                return;
            }
            event.preventDefault();
        };

        if (isOpen) {
            document.body.style.overflow = 'hidden';
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
        } else {
            document.body.style.overflow = originalOverflow || '';
        }

        return () => {
            document.body.style.overflow = originalOverflow || '';
            document.removeEventListener('touchmove', handleTouchMove);
        };
    }, [isOpen]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.key) {
                case 'ArrowLeft':
                    onPrev();
                    event.preventDefault();
                    break;
                case 'ArrowRight':
                    onNext();
                    event.preventDefault();
                    break;
                case 'Escape':
                    onClose();
                    event.preventDefault();
                    break;
                case 'M':
                case 'm':
                    if (onToggleMinimal) {
                        onToggleMinimal();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onNext, onPrev, onClose, onToggleMinimal]);

    // Touch swipe handling
    const handleTouchStart = useCallback((event: React.TouchEvent) => {
        const touch = event.touches[0];
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
        touchStartTime.current = Date.now();
    }, []);

    const handleTouchEnd = useCallback(
        (event: React.TouchEvent) => {
            if (
                touchStartX.current === null ||
                touchStartY.current === null ||
                touchStartTime.current === null
            ) {
                return;
            }

            const endTouch = event.changedTouches[0];
            const deltaX = endTouch.clientX - touchStartX.current;
            const deltaY = endTouch.clientY - touchStartY.current;
            const deltaTime = Date.now() - touchStartTime.current;

            const isSwipe =
                Math.abs(deltaX) > SWIPE_MIN_DISTANCE &&
                Math.abs(deltaY) < SWIPE_MIN_DISTANCE &&
                deltaTime < SWIPE_MAX_TIME;

            if (isSwipe) {
                if (deltaX > 0) {
                    // Swiped right - go to previous
                    onPrev();
                } else {
                    // Swiped left - go to next
                    onNext();
                }
            }

            touchStartX.current = null;
            touchStartY.current = null;
            touchStartTime.current = null;
        },
        [onNext, onPrev]
    );

    // Expose touch handlers for use in JSX
    useEffect(() => {
        const overlay = document.querySelector('.reader-overlay');
        if (overlay) {
            overlay.addEventListener('touchstart', handleTouchStart as any);
            overlay.addEventListener('touchend', handleTouchEnd as any);

            return () => {
                overlay.removeEventListener('touchstart', handleTouchStart as any);
                overlay.removeEventListener('touchend', handleTouchEnd as any);
            };
        }
    }, [handleTouchStart, handleTouchEnd]);
}
