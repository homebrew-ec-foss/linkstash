<script lang="ts">
	import { BookOpen } from 'lucide-svelte';
	import posthog from 'posthog-js';
	import type { Link } from '$lib/types';
	import {
		getLinkTitle,
		getLinkUrl,
		getLinkDomain,
		getLinkImage,
		getRoomComment,
		getVoteCount
	} from '$lib/link-meta';

	interface Props {
		link: Link;
		rank: number;
		compact?: boolean;
		isRefreshed?: boolean;
		onOpenReader: (link: Link) => void;
	}

	let { link, rank, compact = false, isRefreshed = false, onOpenReader }: Props = $props();

	const url = $derived(getLinkUrl(link));
	const title = $derived(getLinkTitle(link));
	const domain = $derived(getLinkDomain(link));
	const image = $derived(getLinkImage(link));
	const roomComment = $derived(getRoomComment(link));
	const voteCount = $derived(getVoteCount(link));
	const flashClass = $derived(isRefreshed ? 'flash' : '');
</script>

<li class="linklist-item {flashClass}">
	<div class="link-row">
		<span class="rank">#{rank}</span>
		<div class="link-main">
			{#if image && !compact}
				<a class="link-thumb" href={url || '#'} target="_blank" rel="noopener noreferrer">
					<img src={image} alt="" loading="lazy" referrerpolicy="no-referrer" />
				</a>
			{/if}
			<a
				class="link-title"
				href={url || '#'}
				target="_blank"
				rel="noopener noreferrer"
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
			<div class="link-meta">
				<span class="link-domain">{domain}</span>
				{#if roomComment}<span class="link-room">{roomComment}</span>{/if}
				{#if voteCount > 0}
					<span class="link-votes">{voteCount} {voteCount === 1 ? 'vote' : 'votes'}</span>
				{/if}
			</div>
		</div>
		{#if link.id}
			<a
				class="reader-link"
				href="/reader/{link.id}"
				aria-label="Open in reader view"
				onclick={() => {
					posthog.capture('reader_opened_from_link', {
						link_id: link.id,
						link_title: title,
						link_url: url
					});
					onOpenReader(link);
				}}
			>
				<BookOpen size={12} />
			</a>
		{/if}
	</div>
</li>
