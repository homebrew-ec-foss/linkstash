<script lang="ts">
	import LinkItem from '$lib/components/LinkItem.svelte';
	import type { DateGroup, Link } from '$lib/types';

	interface Props {
		groups: DateGroup[];
		compact?: boolean;
		isLoading: boolean;
		isRefreshed: boolean;
		hasMore?: boolean;
		onOpenReader: (link: Link) => void;
		onLoadMore?: () => void;
	}

	let {
		groups,
		compact = false,
		isLoading,
		isRefreshed,
		hasMore = false,
		onOpenReader,
		onLoadMore = () => {}
	}: Props = $props();

	let sentinel: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && !isLoading && hasMore) {
						onLoadMore();
					}
				}
			},
			{ rootMargin: '300px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

{#if isLoading && groups.length === 0}
	<div class="loading">
		<p class="feed-loading-text">Loading links…</p>
	</div>
{:else if groups.length === 0}
	<div class="empty">
		<p class="feed-empty-title">No links found.</p>
		<p class="feed-empty-sub">Share a link in the WhatsApp group and it will show up here.</p>
	</div>
{:else}
	{#each groups as group (group.key)}
		<section class="date-group">
			<div class="date-heading">
				<span>{group.label}</span>
				<span class="date-heading-count">{group.items.length}</span>
			</div>
			<ul class="linklist {compact ? 'compact' : 'grid'}">
				{#each group.items as link, idx (link.id || link.url || idx)}
					<LinkItem {link} rank={link.displayIndex ?? idx + 1} {compact} {isRefreshed} {onOpenReader} />
				{/each}
			</ul>
		</section>
	{/each}

	{#if hasMore}
		<div bind:this={sentinel} class="load-more-sentinel">
			{#if isLoading}
				<div class="feed-loading-text">Loading…</div>
			{/if}
		</div>
	{/if}
{/if}
