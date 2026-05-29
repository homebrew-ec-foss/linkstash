/**
 * SuggestionsPanel component - displays related links and groups
 */

'use client';

import React, { JSX } from 'react';
import type { RelatedLink, RelatedGroup } from '../../lib/types';

interface SuggestionsPanelProps {
    isExpanded: boolean;
    onToggle: () => void;
    isLoading: boolean;
    sourceTitle: string;
    suggestedItems: RelatedLink[];
    suggestedGroups: RelatedGroup[];
}

const MAX_SUGGESTIONS_DISPLAY = 6;

export function SuggestionsPanel({
    isExpanded,
    onToggle,
    isLoading,
    sourceTitle,
    suggestedItems,
    suggestedGroups,
}: SuggestionsPanelProps): JSX.Element {
    // Don't render anything if collapsed
    if (!isExpanded) {
        return <></>;
    }

    return (
        <div
            className="home-suggestions-panel"
            aria-label="Homepage suggested content"
        >
            <div className="home-suggestions-col">
                <div className="home-suggestions-title">Suggested Articles</div>
                {sourceTitle && (
                    <div className="home-suggestions-subtitle">
                        Based on: {sourceTitle}
                    </div>
                )}
                {isLoading ? (
                    <div className="suggestion-empty">
                        Finding related links...
                    </div>
                ) : suggestedItems.length === 0 ? (
                    <div className="suggestion-empty">
                        No related links yet.
                    </div>
                ) : (
                    <ol className="suggestion-list">
                        {suggestedItems
                            .slice(0, MAX_SUGGESTIONS_DISPLAY)
                            .map((item) => (
                                <li key={item.id}>
                                    <a
                                        href={`/reader/${encodeURIComponent(item.id)}`}
                                        className="suggestion-link"
                                    >
                                        <span className="suggestion-title">
                                            {item.title}
                                        </span>
                                        <span className="suggestion-meta">
                                            {item.domain || 'unknown domain'} •{' '}
                                            {Math.round((item.score || 0) * 100)}%
                                        </span>
                                    </a>
                                </li>
                            ))}
                    </ol>
                )}
            </div>

            <div className="home-suggestions-col">
                <div className="home-suggestions-title">Suggested Groups</div>
                {suggestedGroups.length === 0 ? (
                    <div className="suggestion-empty">
                        No groups available.
                    </div>
                ) : (
                    <ul className="suggestion-group-list">
                        {suggestedGroups
                            .slice(0, MAX_SUGGESTIONS_DISPLAY)
                            .map((group) => (
                                <li key={group.name}>
                                    <span>{group.name}</span>
                                    <strong>{group.count}</strong>
                                </li>
                            ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
