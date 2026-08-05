<script lang="ts">
	import { goto } from '$app/navigation';
	import { groupItemsByDate } from '$lib/text-utils';
	import { createPaginatedLinks } from '$lib/stores/links.svelte';
	import Header from '$lib/components/Header.svelte';
	import LinksList from '$lib/components/LinksList.svelte';
	import SuggestionsPanel from '$lib/components/SuggestionsPanel.svelte';
	import { logger } from '$lib/logger';
	import type { RankMode, Link, RelatedLink, RelatedGroup } from '$lib/types';

	let rankMode: RankMode = $state('latest');
	let suggestionsExpanded = $state(false);
	let suggestedItems = $state<RelatedLink[]>([]);
	let suggestedGroups = $state<RelatedGroup[]>([]);
	let suggestedLoading = $state(false);
	let suggestedSourceTitle = $state('');

	const store = createPaginatedLinks(() => rankMode);

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

<div class="card">
	<Header
		links={store.links || []}
		onOpenReader={() => {
			const firstLink = store.links?.find((l) => Boolean(l.id));
			if (firstLink) handleOpenReader(firstLink);
		}}
		suggestionsExpanded={suggestionsExpanded}
		onToggleSuggestions={() => (suggestionsExpanded = !suggestionsExpanded)}
	/>

	<div>
		<SuggestionsPanel
			isExpanded={suggestionsExpanded}
			onToggle={() => (suggestionsExpanded = !suggestionsExpanded)}
			isLoading={suggestedLoading}
			sourceTitle={suggestedSourceTitle}
			suggestedItems={suggestedItems}
			suggestedGroups={suggestedGroups}
		/>

		<LinksList
			groups={dateGroups}
			isLoading={store.isLoading}
			isRefreshed={store.isRefreshed}
			hasMore={store.hasMore}
			onOpenReader={handleOpenReader}
			onLoadMore={store.loadMore}
		/>
	</div>
</div>
