import { sortLinksByMode } from '$lib/sorting';
import { getFromLocalStorage, setToLocalStorage, getLinksCacheKey } from '$lib/utils/storage';
import { logger } from '$lib/logger';
import type { Link, RankMode } from '$lib/types';

const LINKS_PER_PAGE = 50;

/**
 * Paginated links loading with infinite scroll + localStorage caching.
 * Re-fetches from page 0 whenever the rank `mode` changes.
 */
export function createPaginatedLinks(getMode: () => RankMode) {
	const mode = $derived(getMode());

	let links = $state<Link[] | null>(null);
	let isLoading = $state(true);
	let isRefreshed = $state(false);
	let hasMore = $state(true);
	let offset = $state(0);
	let allLinksCount = $state(0);

	async function fetchLinks(pageOffset = 0) {
		try {
			if (pageOffset === 0) {
				const cacheKey = getLinksCacheKey(mode);
				const cached = getFromLocalStorage<Link[]>(cacheKey);
				if (cached) {
					links = sortLinksByMode(cached, mode);
				}
			}

			const response = await fetch(
				`/api/links?mode=${mode}&offset=${pageOffset}&limit=${LINKS_PER_PAGE}`
			);
			if (!response.ok) {
				logger.warn(`Failed to fetch links: ${response.status}`);
				if (pageOffset === 0) isLoading = false;
				return;
			}

			const data = await response.json();
			const sorted = sortLinksByMode(data.items || [], mode).map((item, index) => ({
				...item,
				displayIndex: pageOffset + index + 1
			}));

			if (pageOffset === 0) {
				links = sorted;
				setToLocalStorage(getLinksCacheKey(mode), sorted);
				isRefreshed = true;
				setTimeout(() => {
					isRefreshed = false;
				}, 1800);
			} else {
				links = [...(links ?? []), ...sorted];
			}

			allLinksCount = data.total || 0;
			hasMore = pageOffset + LINKS_PER_PAGE < allLinksCount;
			offset = pageOffset + LINKS_PER_PAGE;
		} catch (error) {
			logger.error('Error fetching links', error);
			if (pageOffset === 0) isLoading = false;
		} finally {
			if (pageOffset === 0) isLoading = false;
		}
	}

	$effect(() => {
		// track mode so this re-runs when the rank mode changes
		void mode;
		links = null;
		offset = 0;
		allLinksCount = 0;
		hasMore = true;
		isLoading = true;
		fetchLinks(0);
	});

	function loadMore() {
		if (!isLoading && hasMore) {
			fetchLinks(offset);
		}
	}

	return {
		get links() {
			return links;
		},
		get isLoading() {
			return isLoading;
		},
		get isRefreshed() {
			return isRefreshed;
		},
		get hasMore() {
			return hasMore;
		},
		loadMore
	};
}
