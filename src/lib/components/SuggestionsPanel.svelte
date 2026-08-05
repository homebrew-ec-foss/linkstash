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
	<div class="suggestions" aria-label="Homepage suggested content">
		<div class="suggestions-block">
			<h2 class="suggestions-title">Suggested Articles</h2>
			{#if sourceTitle}
				<p class="suggestions-source">Based on: {sourceTitle}</p>
			{/if}
			{#if isLoading}
				<div class="empty">Finding related links...</div>
			{:else if suggestedItems.length === 0}
				<div class="empty">No related links yet.</div>
			{:else}
				<ol class="suggestions-list">
					{#each suggestedItems.slice(0, MAX_SUGGESTIONS_DISPLAY) as item (item.id)}
						<li class="suggestion-item">
							<a href="/reader/{item.id}">{item.title}</a>
							<div class="suggestion-meta">
								{item.domain || 'unknown domain'} • {Math.round((item.score || 0) * 100)}%
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</div>

		<div class="suggestions-block">
			<h2 class="suggestions-title">Suggested Groups</h2>
			{#if suggestedGroups.length === 0}
				<div class="empty">No groups available.</div>
			{:else}
				<ul class="suggestions-groups">
					{#each suggestedGroups.slice(0, MAX_SUGGESTIONS_DISPLAY) as group (group.name)}
						<li class="suggestion-group">
							<span>{group.name}</span>
							<strong>{group.count}</strong>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
