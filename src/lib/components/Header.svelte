<script lang="ts">
	import { ExternalLink, Settings, Sparkles } from 'lucide-svelte';
	import posthog from 'posthog-js';
	import type { Snippet } from 'svelte';

	interface Props {
		suggestionsExpanded?: boolean;
		onToggleSuggestions?: () => void;
		children?: Snippet;
	}

	let {
		suggestionsExpanded = false,
		onToggleSuggestions,
		children
	}: Props = $props();
</script>

<header class="header">
	<div class="container header-row">
		<a href="/" class="site-title">linkstash</a>
		{#if children}
			<div class="header-context">{@render children()}</div>
		{/if}
		<div class="header-actions">
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
				href="/settings"
				class="icon-btn"
				aria-label="Settings"
			>
				<Settings size={14} />
			</a>

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
