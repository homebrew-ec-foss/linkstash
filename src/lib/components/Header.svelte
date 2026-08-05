<script lang="ts">
	import { BookOpen, ExternalLink, Sparkles } from 'lucide-svelte';
	import posthog from 'posthog-js';
	import type { Link } from '$lib/types';

	interface Props {
		links: Link[];
		onOpenReader: () => void;
		suggestionsExpanded?: boolean;
		onToggleSuggestions?: () => void;
	}

	let {
		links,
		onOpenReader,
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

<div class="header-container">
	<a
		href="https://hsp-ec.xyz"
		target="_blank"
		rel="noopener noreferrer"
		class="site-brand-link"
		aria-label="Open hsp-ec.xyz"
	>
		<img
			src="https://hsp-ec.xyz/static/images/hsp-spinner.svg"
			alt="HSP"
			class="site-brand-icon"
			width={16}
			height={16}
		/>
		<span class="site-brand-text">HSP Linkstash</span>
	</a>

	<div style="flex: 1"></div>

	<div class="header-actions">
		<button
			type="button"
			class="header-icon-button"
			title="Open reading view"
			aria-label="Open reading view"
			onclick={handleReaderClick}
		>
			<BookOpen size={18} />
		</button>

		{#if onToggleSuggestions}
			<button
				type="button"
				class="header-icon-button"
				title={suggestionsExpanded ? 'Hide suggestions' : 'Show suggestions'}
				aria-label={suggestionsExpanded ? 'Hide suggestions' : 'Show suggestions'}
				onclick={onToggleSuggestions}
				aria-pressed={suggestionsExpanded}
			>
				<Sparkles size={18} />
			</button>
		{/if}

		<a
			href="https://github.com/homebrew-ec-foss/linkstash"
			class="header-icon-button"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="GitHub repository"
			onclick={() => posthog.capture('github_link_clicked')}
		>
			<ExternalLink size={18} />
		</a>
	</div>
</div>
