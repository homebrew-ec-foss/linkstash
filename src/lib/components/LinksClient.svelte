<script lang="ts">
	import { goto } from '$app/navigation';
	import { groupItemsByDate } from '$lib/text-utils';
	import { createPaginatedLinks } from '$lib/stores/links.svelte';
	import Header from '$lib/components/Header.svelte';
	import LinksList from '$lib/components/LinksList.svelte';
	import SuggestionsPanel from '$lib/components/SuggestionsPanel.svelte';
	import { getFromLocalStorage, setToLocalStorage } from '$lib/utils/storage';
	import { SETTINGS_LAYOUT_KEY } from '$lib/constants';
	import { logger } from '$lib/logger';
	import posthog from 'posthog-js';
	import type { RankMode, Link, RelatedLink, RelatedGroup } from '$lib/types';
	import type { PaginatedLinksInitial } from '$lib/stores/links.svelte';

	interface Props {
		initialPage?: PaginatedLinksInitial;
	}

	let { initialPage }: Props = $props();

	let rankMode: RankMode = $state('latest');
	let suggestionsExpanded = $state(false);
	let suggestedItems = $state<RelatedLink[]>([]);
	let suggestedGroups = $state<RelatedGroup[]>([]);
	let suggestedLoading = $state(false);
	let suggestedSourceTitle = $state('');

	// Layout preference: default to card grid. Read from localStorage only on the
	// client (after hydration) to avoid an SSR/client mismatch.
	let compactMode = $state(false);

	$effect(() => {
		compactMode = getFromLocalStorage<boolean>(SETTINGS_LAYOUT_KEY) ?? false;
	});

	// svelte-ignore state_referenced_locally -- initialPage is read once to seed the store
	const store = createPaginatedLinks(() => rankMode, initialPage);

	// Load related links/suggestions based on the top link - only when expanded
	$effect(() => {
		if (!suggestionsExpanded) {
			suggestedItems = [];
			suggestedGroups = [];
			suggestedSourceTitle = '';
			return;
		}

		const topLink = store.links?.[0];
		if (!topLink?.id) {
			suggestedItems = [];
			suggestedGroups = [];
			suggestedSourceTitle = '';
			return;
		}

		suggestedSourceTitle = topLink.title || (topLink.meta?.title as string) || topLink.url || 'Top link';

		(async () => {
			suggestedLoading = true;
			try {
				const response = await fetch(`/api/related/${encodeURIComponent(String(topLink.id))}`);
				if (!response.ok) {
					logger.warn(`Failed to fetch related links: ${response.status}`);
					return;
				}
				const payload = await response.json();
				suggestedItems = Array.isArray(payload.related) ? payload.related : [];
				suggestedGroups = Array.isArray(payload.groups) ? payload.groups : [];
			} catch (error) {
				logger.error('Error fetching related links', error);
				suggestedItems = [];
				suggestedGroups = [];
			} finally {
				suggestedLoading = false;
			}
		})();
	});

	const dateGroups = $derived(store.links ? groupItemsByDate(store.links) : []);

	function handleOpenReader(link: Link) {
		if (!link.id) {
			logger.warn('Cannot open reader for link without ID');
			return;
		}
		goto(`/reader/${encodeURIComponent(link.id)}`);
	}
</script>

<Header
	suggestionsExpanded
	onToggleSuggestions={() => (suggestionsExpanded = !suggestionsExpanded)}
/>

<div>
	<SuggestionsPanel
		isExpanded={suggestionsExpanded}
		onToggle={() => (suggestionsExpanded = !suggestionsExpanded)}
		isLoading={suggestedLoading}
		sourceTitle={suggestedSourceTitle}
		{suggestedItems}
		{suggestedGroups}
	/>

	<LinksList
		groups={dateGroups}
		compact={compactMode}
		isLoading={store.isLoading}
		isRefreshed={store.isRefreshed}
		hasMore={store.hasMore}
		onOpenReader={handleOpenReader}
		onLoadMore={store.loadMore}
	/>
</div>
