<script lang="ts">
	import { BookOpen } from 'lucide-svelte';
	import posthog from 'posthog-js';
	import type { Link, DateGroup } from '$lib/types';

	interface Props {
		groups: DateGroup[];
		isLoading: boolean;
		isRefreshed: boolean;
		hasMore?: boolean;
		onOpenReader: (link: Link) => void;
		onLoadMore?: () => void;
	}

	let {
		groups,
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

{#snippet linkItem(link: Link, idx: number)}
	{@const url = link.url || (link.meta?.url as string) || ''}
	{@const title = link.title || (link.meta?.title as string) || url || 'Untitled'}
	{@const domain = (() => {
		let d = link.domain || (link.meta?.domain as string) || '';
		if (!d && url) {
			try {
				d = new URL(url).hostname;
			} catch (e) {
				d = '';
			}
		}
		return d;
	})()}
	{@const hasReaderId = Boolean(link.id)}
	{@const rank = link.displayIndex ?? idx + 1}
	{@const roomComment = link.meta?.roomComment ?? (link as any).roomComment ?? ''}
	{@const voteCount = link.count ?? 0}

	<li
		class="link-item {isRefreshed ? 'flash' : ''}"
		role="listitem"
	>
		<div class="rank">{rank}.</div>
		<div class="link-main">
			<a
				href={url || '#'}
				target="_blank"
				rel="noopener noreferrer"
				class="link-title"
				onclick={() => {
					posthog.capture('link_clicked', {
						link_title: title,
						link_url: url,
						link_domain: domain,
						link_rank: rank,
						vote_count: voteCount
					});
				}}
			>
				{title}
			</a>
			<div class="link-domain">
				{domain}
				{#if roomComment} — {roomComment}{/if}
			</div>
		</div>

		<div class="votes">{voteCount ? `${voteCount} votes` : ''}</div>

		<button
			type="button"
			class="link-reader-button"
			title={hasReaderId ? 'Open in reader view' : 'Reader view unavailable'}
			aria-label={hasReaderId ? 'Open in reader view' : 'Reader view unavailable'}
			disabled={!hasReaderId}
			onclick={() => {
				posthog.capture('reader_opened_from_link', {
					link_id: link.id,
					link_title: title,
					link_url: url
				});
				onOpenReader(link);
			}}
		>
			<BookOpen size={13} />
		</button>
	</li>
{/snippet}

{#if isLoading && groups.length === 0}
	<ol class="link-list">
		<li class="p-4 text-center text-gray-500">Loading links…</li>
	</ol>
{:else if groups.length === 0}
	<ol class="link-list">
		<li class="p-4 text-center text-gray-500">No links found.</li>
	</ol>
{:else}
	{#each groups as group (group.key)}
		<div class="date-group">
			<div class="date-heading">{group.label}</div>
			<ol class="link-list">
				{#each group.items as link, idx (link.id || link.url || idx)}
					{@render linkItem(link, idx)}
				{/each}
			</ol>
		</div>
	{/each}

	{#if hasMore}
		<div bind:this={sentinel} class="lazy-load-sentinel">
			{#if isLoading}
				<div class="text-center text-gray-500 p-2">Loading…</div>
			{/if}
		</div>
	{/if}
{/if}
