/**
 * Header component - displays branding and navigation
 */

'use client';

import React, { JSX } from 'react';
import { Github, BookOpen, Filter, Sparkles } from 'lucide-react';
import posthog from 'posthog-js';
import type { RankMode, Link } from '../../lib/types';

interface HeaderProps {
    rankMode: RankMode;
    onRankModeChange: (mode: RankMode) => void;
    isLoading: boolean;
    isRefreshed: boolean;
    links: Link[];
    onOpenReader: () => void;
    suggestionsExpanded?: boolean;
    onToggleSuggestions?: () => void;
}

export function Header({
    rankMode,
    onRankModeChange,
    isLoading,
    isRefreshed,
    links,
    onOpenReader,
    suggestionsExpanded = false,
    onToggleSuggestions,
}: HeaderProps): JSX.Element {
    const handleReaderClick = () => {
        posthog.capture('reader_opened', {
            total_links: links.length,
        });

        const linkWithId = links.find((x) => x.id);
        if (linkWithId?.id) {
            window.location.href = `/reader/${encodeURIComponent(linkWithId.id)}`;
        } else {
            const linkWithUrl = links.find((x) => x.url || x.meta?.url);
            if (linkWithUrl) {
                const url = linkWithUrl.url || (linkWithUrl.meta?.url as string);
                if (url) {
                    window.open(url, '_blank');
                }
            }
        }
    };

    return (
        <div className="header-container">
            <a
                href="https://hsp-ec.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="site-brand-link"
                aria-label="Open hsp-ec.xyz"
            >
                <img
                    src="https://hsp-ec.xyz/static/images/hsp-spinner.svg"
                    alt="HSP"
                    className="site-brand-icon"
                    width={16}
                    height={16}
                />
                <span className="site-brand-text">HSP Linkstash</span>
            </a>

            <div style={{ flex: 1 }} />

            <div className="header-actions">
                <button
                    type="button"
                    className="header-icon-button"
                    title="Open reading view"
                    aria-label="Open reading view"
                    onClick={handleReaderClick}
                >
                    <BookOpen size={18} aria-hidden="true" />
                </button>


                {onToggleSuggestions && (
                    <button
                        type="button"
                        className="header-icon-button"
                        title={suggestionsExpanded ? 'Hide suggestions' : 'Show suggestions'}
                        aria-label={suggestionsExpanded ? 'Hide suggestions' : 'Show suggestions'}
                        onClick={onToggleSuggestions}
                        aria-pressed={suggestionsExpanded}
                    >
                        <Sparkles size={18} aria-hidden="true" />
                    </button>
                )}

                <a
                    href="https://github.com/homebrew-ec-foss/linkstash"
                    className="header-icon-button"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="GitHub repository"
                    onClick={() => posthog.capture('github_link_clicked')}
                >
                    <Github size={18} aria-hidden="true" />
                </a>
            </div>
        </div>
    );
}

interface RankModeSelectorProps {
    mode: RankMode;
    onChange: (mode: RankMode) => void;
    isLoading: boolean;
    isRefreshed: boolean;
}

function RankModeSelector({
    mode,
    onChange,
    isLoading,
    isRefreshed,
}: RankModeSelectorProps): JSX.Element {
    const modes: RankMode[] = ['latest', 'top', 'rising'];

    return (
        <div
            className={`mode-switch ${isRefreshed ? 'show' : ''}`}
            role="tablist"
            aria-label="Feed sorting mode"
        >
            {modes.map((rankMode) => (
                <button
                    key={rankMode}
                    type="button"
                    className={`mode-pill ${mode === rankMode ? 'active' : ''}`}
                    onClick={() => onChange(rankMode)}
                    disabled={isLoading && mode === rankMode}
                    role="tab"
                    aria-selected={mode === rankMode}
                >
                    {rankMode.charAt(0).toUpperCase() + rankMode.slice(1)}
                </button>
            ))}
        </div>
    );
}
