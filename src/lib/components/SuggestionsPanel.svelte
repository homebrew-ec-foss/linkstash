<script lang="ts">
	import type { RelatedLink, RelatedGroup } from '$lib/types';

	interface Props {
		isExpanded: boolean;
		onToggle: () => void;
		isLoading: boolean;
		sourceTitle: string;
		suggestedItems: RelatedLink[];
		suggestedGroups: RelatedGroup[];
	}

	let {
		isExpanded,
		onToggle,
		isLoading,
		sourceTitle,
		suggestedItems,
		suggestedGroups
	}: Props = $props();

	const MAX_SUGGESTIONS_DISPLAY = 6;
</script>

{#if isExpanded}
	<div class="home-suggestions-panel" aria-label="Homepage suggested content">
		<div class="home-suggestions-col">
			<div class="home-suggestions-title">Suggested Articles</div>
			{#if sourceTitle}
				<div class="home-suggestions-subtitle">Based on: {sourceTitle}</div>
			{/if}
			{#if isLoading}
				<div class="suggestion-empty">Finding related links...</div>
			{:else if suggestedItems.length === 0}
				<div class="suggestion-empty">No related links yet.</div>
			{:else}
				<ol class="suggestion-list">
					{#each suggestedItems.slice(0, MAX_SUGGESTIONS_DISPLAY) as item (item.id)}
						<li>
							<a href={`/reader/${encodeURIComponent(item.id)}`} class="suggestion-link">
								<span class="suggestion-title">{item.title}</span>
								<span class="suggestion-meta">
									{item.domain || 'unknown domain'} •{' '}
									{Math.round((item.score || 0) * 100)}%
								</span>
							</a>
						</li>
					{/each}
				</ol>
			{/if}
		</div>

		<div class="home-suggestions-col">
			<div class="home-suggestions-title">Suggested Groups</div>
			{#if suggestedGroups.length === 0}
				<div class="suggestion-empty">No groups available.</div>
			{:else}
				<ul class="suggestion-group-list">
					{#each suggestedGroups.slice(0, MAX_SUGGESTIONS_DISPLAY) as group (group.name)}
						<li>
							<span>{group.name}</span>
							<strong>{group.count}</strong>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
