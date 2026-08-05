<script lang="ts">
	import { BookOpen, ExternalLink, LayoutGrid, Rows3, Sparkles } from 'lucide-svelte';
	import posthog from 'posthog-js';
	import type { Link } from '$lib/types';

	interface Props {
		links: Link[];
		onOpenReader: () => void;
		compact?: boolean;
		onToggleCompact?: () => void;
		suggestionsExpanded?: boolean;
		onToggleSuggestions?: () => void;
	}

	let {
		links,
		onOpenReader,
		compact = false,
		onToggleCompact,
		suggestionsExpanded = false,
		onToggleSuggestions
	}: Props = $props();

	function handleReaderClick() {
		posthog.capture('reader_opened', {
			total_links: links.length
		});
		onOpenReader();
	}
</script>

<header class="header">
	<div class="container header-row">
		<a href="/" class="site-title">linkstash</a>
		<div class="header-actions">
			{#if onToggleCompact}
				<button
					type="button"
					class="icon-btn"
					title={compact ? 'Switch to card view' : 'Switch to compact rows'}
					aria-label={compact ? 'Switch to card view' : 'Switch to compact rows'}
					aria-pressed={compact}
					onclick={onToggleCompact}
				>
					{#if compact}
						<LayoutGrid size={14} />
					{:else}
						<Rows3 size={14} />
					{/if}
				</button>
			{/if}

			<button
				type="button"
				class="icon-btn"
				title="Open reading view"
				aria-label="Open reading view"
				onclick={handleReaderClick}
			>
				<BookOpen size={14} />
			</button>

			{#if onToggleSuggestions}
				<button
					type="button"
					class="icon-btn"
					title={suggestionsExpanded ? 'Hide suggestions' : 'Show suggestions'}
					aria-label={suggestionsExpanded ? 'Hide suggestions' : 'Show suggestions'}
					onclick={onToggleSuggestions}
					aria-pressed={suggestionsExpanded}
				>
					<Sparkles size={14} />
				</button>
			{/if}

			<a
				href="https://github.com/homebrew-ec-foss/linkstash"
				class="icon-btn"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="GitHub repository"
				onclick={() => posthog.capture('github_link_clicked')}
			>
				<ExternalLink size={14} />
			</a>
		</div>
	</div>
</header>