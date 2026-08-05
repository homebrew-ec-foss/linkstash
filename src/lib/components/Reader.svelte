<script lang="ts">
	import { page } from '$app/stores';
	import posthog from 'posthog-js';
	import { renderMarkdown } from '$lib/markdown';
	import { extractFirstHeading } from '$lib/text-utils';
	import { getLinksCacheKey, getFromLocalStorage, setToLocalStorage } from '$lib/utils/storage';
	import { READER_CONTENT_LOAD_TIMEOUT_MS } from '$lib/constants';

	interface SuggestedItem {
		id: string;
		url: string;
		domain: string;
		title: string;
		roomComment: string;
		count: number;
		score: number;
	}

	interface SuggestedGroup {
		name: string;
		count: number;
	}

	let queue = $state<string[]>([]);
	let index = $state(0);
	let content = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let metas = $state<Record<string, any>>({});
	let isFromCache = $state(false);
	let isOnline = $state(true);
	let relatedItems = $state<SuggestedItem[]>([]);
	let relatedGroups = $state<SuggestedGroup[]>([]);
	let relatedLoading = $state(false);

	let articleEl: HTMLElement | null = $state(null);

	let touchStartX: number | null = null;
	let touchStartY: number | null = null;
	let touchStartTime: number | null = null;

	const currentId = $derived(queue.length > 0 ? queue[index] : undefined);
	const currentMeta = $derived(currentId ? metas[currentId] : null);

	$effect(() => {
		const handleOnline = () => (isOnline = true);
		const handleOffline = () => (isOnline = false);
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		isOnline = navigator.onLine;
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});

	$effect(() => {
		const path = $page.url.pathname;
		const hash = $page.url.hash.replace(/^#/, '');

		const readLocation = async () => {
			const pathMatch = path.match(/^\/reader\/([^\/]+)$/);
			const pathId = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : '';

			const hashIds = hash
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);

			const ids = pathId ? [pathId] : hashIds;

			if (ids.length === 0) {
				queue = [];
				index = 0;
				return;
			}

			if (ids.length === 1) {
				const single = ids[0];
				try {
					const res = await fetch('/api/links?limit=500&offset=0&mode=latest');
					if (!res.ok) {
						queue = [single];
						index = 0;
						return;
					}
					const data = await res.json();
					const links = data.items || data || [];
					const allIds = (links as any[])
						.filter((l) => l.id)
						.map((l) => l.id);
					const pos = allIds.indexOf(single);
					if (pos >= 0) {
						queue = allIds;
						index = pos;
					} else {
						queue = [single, ...allIds.filter((i: string) => i !== single)];
						index = 0;
					}
				} catch (e) {
					queue = [single];
					index = 0;
				}
			} else {
				queue = ids;
				index = 0;
			}
		};

		readLocation();
	});

	$effect(() => {
		if (!queue.length) return;

		posthog.capture('reader_page_opened', {
			queue_length: queue.length,
			initial_item_id: queue[0]
		});

		const cache = getFromLocalStorage<any[]>(getLinksCacheKey('latest'));
		if (!cache) {
			metas = {};
			return;
		}
		const m: Record<string, any> = {};
		cache.forEach((l) => {
			if (l && l.id) m[l.id] = l;
		});

		const filtered: Record<string, any> = {};
		queue.forEach((id) => {
			if (m[id]) filtered[id] = m[id];
		});
		metas = filtered;
	});

	$effect(() => {
		if (!currentId || metas[currentId]) return;

		(async () => {
			try {
				const res = await fetch('/api/links?limit=500&offset=0&mode=latest');
				if (!res.ok) return;
				const data = await res.json();
				const items = data.items || [];

				const currentItem = items.find((l: any) => l.id === currentId);
				if (currentItem) {
					metas = { ...metas, [currentId]: currentItem };
				}
			} catch (e) {
			}
		})();
	});

	$effect(() => {
		const id = currentId;
		if (!id) return;

		(async () => {
			loading = true;
			error = null;
			content = null;

			try {
				const cached = getFromLocalStorage<{ ts: number; content: string }>(
					`reader:content:${id}`
				);
				if (cached && cached.content) {
					content = cached.content;
					isFromCache = true;
				}
			} catch (err) {
			}

			try {
				const controller = new AbortController();
				let timedOut = false;
				const timeoutId = window.setTimeout(() => {
					timedOut = true;
					controller.abort();
					error = 'Timeout loading content';
					loading = false;
				}, READER_CONTENT_LOAD_TIMEOUT_MS);

				const res = await fetch(`/api/content/${id}`, { signal: controller.signal });
				clearTimeout(timeoutId);
				if (timedOut) return;
				if (!res.ok) {
					error = `Content not found (${res.status})`;
					return;
				}
				const txt = await res.text();

				content = txt;
				isFromCache = false;

				setToLocalStorage(`reader:content:${id}`, { ts: Date.now(), content: txt });

				const extracted = extractFirstHeading(txt || '');
				if (extracted.h1) {
					const cache = getFromLocalStorage<any[]>(getLinksCacheKey('latest'));
					if (cache) {
						const arr = cache;
						const idx = arr.findIndex((a) => a.id === id);
						if (idx >= 0) {
							const entry = arr[idx];
							if (!entry.meta) entry.meta = {};
							if (!entry.meta.title) {
								entry.meta.title = extracted.h1;
								arr[idx] = entry;
								setToLocalStorage(getLinksCacheKey('latest'), arr);
								metas = { ...metas, [id]: entry };
							}
						}
					}
				}
			} catch (e) {
				if (!((e as any)?.name === 'AbortError')) error = 'Error loading content';
			} finally {
				loading = false;
			}
		})();
	});

	function gotoNext() {
		if (!queue || queue.length === 0) return;
		const newIndex = index < queue.length - 1 ? index + 1 : 0;
		posthog.capture('reader_page_navigated', {
			direction: 'next',
			from_index: index,
			to_index: newIndex,
			queue_length: queue.length,
			wrapped: index >= queue.length - 1
		});
		index = newIndex;
	}

	function gotoPrev() {
		if (!queue || queue.length === 0) return;
		const newIndex = index > 0 ? index - 1 : queue.length - 1;
		posthog.capture('reader_page_navigated', {
			direction: 'previous',
			from_index: index,
			to_index: newIndex,
			queue_length: queue.length,
			wrapped: index === 0
		});
		index = newIndex;
	}

	$effect(() => {
		void index;
		void queue;

		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft') {
				gotoPrev();
				e.preventDefault();
			} else if (e.key === 'ArrowRight') {
				gotoNext();
				e.preventDefault();
			} else if (e.key === 'Escape') {
				history.back();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function handleTouchStart(e: TouchEvent) {
		const t = e.touches[0];
		touchStartX = t.clientX;
		touchStartY = t.clientY;
		touchStartTime = Date.now();
	}

	function handleTouchEnd(e: TouchEvent) {
		const t = e.changedTouches[0];
		if (touchStartX == null || touchStartY == null) return;
		const dx = t.clientX - touchStartX;
		const dy = t.clientY - touchStartY;
		const dt = Date.now() - (touchStartTime || 0);

		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && dt < 1000) {
			if (dx > 0) gotoPrev();
			else gotoNext();
		}

		touchStartX = null;
		touchStartY = null;
		touchStartTime = null;
	}

	function removeFromQueue(idx: number) {
		const q = queue.filter((_, i) => i !== idx);
		if (q.length === 0) {
			history.back();
			return;
		}
		let newIndex = index;
		if (idx === index) {
			if (idx < queue.length - 1) newIndex = idx;
			else newIndex = Math.max(0, idx - 1);
		} else if (idx < index) {
			newIndex = Math.max(0, index - 1);
		}
		queue = q;
		index = newIndex;
	}

	$effect(() => {
		const id = currentId;
		if (!id) {
			relatedItems = [];
			relatedGroups = [];
			return;
		}

		(async () => {
			relatedLoading = true;
			try {
				const res = await fetch(`/api/related/${encodeURIComponent(id)}`);
				if (!res.ok) return;
				const payload = await res.json();
				relatedItems = Array.isArray(payload.related) ? payload.related : [];
				relatedGroups = Array.isArray(payload.groups) ? payload.groups : [];
			} catch (e) {
				relatedItems = [];
				relatedGroups = [];
			} finally {
				relatedLoading = false;
			}
		})();
	});

	const defaultH1Text = $derived.by(() => {
		if (currentMeta?.meta?.title) return currentMeta.meta.title;
		if (currentMeta?.title) return currentMeta.title;
		if (currentMeta?.url) {
			try {
				return new URL(currentMeta.url).hostname;
			} catch (e) {
			}
		}
		if (currentId) return currentId;
		return 'Reader';
	});

	const extracted = $derived(extractFirstHeading(content ?? undefined));
	const pageH1 = $derived(extracted.h1 || defaultH1Text);
	const renderedHtml = $derived(extracted.content ? renderMarkdown(extracted.content) : '');
	const metaTitle = $derived(
		currentMeta?.meta?.title || currentMeta?.title || extracted.h1 || ''
	);

	$effect(() => {
		document.title = metaTitle || 'Reader';
	});

	$effect(() => {
		const el = articleEl;
		if (!el) return;
		const handleError = (e: Event) => {
			const target = e.target as HTMLElement;
			if (target.tagName !== 'IMG') return;
			const img = target as HTMLImageElement;
			if (img.dataset.proxied) return;
			img.dataset.proxied = '1';
			img.src = `/api/proxy?url=${encodeURIComponent(img.src)}`;
		};
		el.addEventListener('error', handleError, true);
		return () => el.removeEventListener('error', handleError, true);
	});

	function getHost(url: string): string {
		try {
			return new URL(url).hostname;
		} catch {
			return '';
		}
	}
</script>

<div class="reader" ontouchstart={handleTouchStart} ontouchend={handleTouchEnd}>
	<div class="container">
		<header class="reader-header">
			<div class="reader-header-row">
				<div class="reader-title">
					{#if currentMeta?.url}
						<a href={currentMeta.url} target="_blank" rel="noopener noreferrer">
							{getHost(currentMeta.url)}
						</a>
						<span class="reader-source">{currentMeta.meta?.title || extracted.h1 || currentMeta.title || currentId}</span>
					{:else}
						{metaTitle || 'Reader'}
					{/if}
				</div>
				{#if !isOnline || isFromCache}
					<div class="reader-status">
						{#if !isOnline}
							<span class="status-badge offline">Offline</span>
						{/if}
						{#if isFromCache}
							<span class="status-badge cached">Cached</span>
						{/if}
					</div>
				{/if}
			</div>
		</header>

		<main class="reader-content">
			{#if loading}
				<div class="loading">Loading…</div>
			{:else if error}
				<div class="empty">{error}</div>
			{:else if content}
				<article bind:this={articleEl}>
					<h1>{metaTitle || extracted.h1 || defaultH1Text}</h1>
					<div>{@html renderedHtml}</div>
				</article>

				{#if relatedItems.length > 0 || relatedGroups.length > 0}
					<hr style="margin: 2rem 0; border-top: 1px solid var(--border);" />

					{#if relatedItems.length > 0}
						<h3 class="related-heading">Related</h3>
						<ul style="list-style: none; padding: 0; margin: 0;">
							{#each relatedItems.slice(0, 8) as item (item.id)}
								<li style="padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
									<a href="/reader/{item.id}" class="related-item-title" style="color: var(--link); border-bottom-color: transparent;">{item.title}</a>
									<div class="related-item-meta">
										{item.domain} • {Math.round(item.score * 100)}%
									</div>
								</li>
							{/each}
						</ul>
					{/if}

					{#if relatedGroups.length > 0}
						<h3 class="related-heading">Groups</h3>
						<ul style="list-style: none; padding: 0; margin: 0;">
							{#each relatedGroups.slice(0, 6) as group (group.name)}
								<li style="padding: 0.25rem 0; display: flex; justify-content: space-between; border-bottom: 1px solid var(--border);">
									<span class="related-group-item">{group.name}</span>
									<strong class="related-group-count">{group.count}</strong>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			{:else}
				<div class="empty">No content.</div>
			{/if}
		</main>
	</div>

	{#if queue.length > 1}
		<footer class="reader-footer">
			<div class="reader-footer-inner">
				<span>Article {index + 1} of {queue.length}</span>
				<div class="reader-footer-nav">
					<button class="reader-btn" onclick={gotoPrev} title="Previous (←)">‹ Prev</button>
					<button class="reader-btn" onclick={gotoNext} title="Next (→)">Next ›</button>
				</div>
			</div>
		</footer>
	{/if}
</div>

<style>
	.reader-content {
		padding: 2rem 0 4rem;
	}

	.reader-footer {
		border-top: 1px solid var(--border);
		padding: 1rem 0;
		margin-top: 2rem;
		font-family: Inter, system-ui, sans-serif;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.reader-footer-inner {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.reader-footer-nav {
		display: flex;
		gap: 0.75rem;
	}

	.status-badge {
		font-family: Inter, system-ui, sans-serif;
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		border-radius: 2px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.status-badge.offline {
		background: #ef4444;
		color: white;
	}

	.status-badge.cached {
		background: #f59e0b;
		color: white;
	}

	.reader-btn {
		padding: 0.25rem 0.625rem;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--fg);
		font-size: 0.75rem;
		font-family: Inter, system-ui, sans-serif;
		cursor: pointer;
		border-radius: var(--radius);
		text-decoration: none;
		transition: background-color 150ms ease, border-color 150ms ease;
	}

	.reader-btn:hover {
		background-color: rgba(0, 0, 0, 0.03);
		border-color: var(--muted);
	}

	.reader-btn[disabled] {
		opacity: 0.4;
		cursor: default;
	}

	.reader-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.reader-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--fg);
		font-family: Inter, system-ui, sans-serif;
	}

	.reader-title a {
		color: var(--fg);
		border-bottom-color: transparent;
	}

	.reader-title a:hover {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.reader-source {
		font-size: 0.75rem;
		color: var(--muted);
		margin-left: 0.5rem;
		font-family: Inter, system-ui, sans-serif;
	}

	.reader-status {
		display: flex;
		gap: 0.375rem;
		margin-top: 0.5rem;
		font-size: 0.75rem;
		font-family: Inter, system-ui, sans-serif;
	}

	.related-item-title {
		font-family: Inter, system-ui, sans-serif;
		font-size: 0.875rem;
	}

	.related-item-meta {
		font-family: Inter, system-ui, sans-serif;
		font-size: 0.75rem;
		color: var(--muted);
		margin-top: 0.125rem;
	}

	.related-group-item {
		font-family: Inter, system-ui, sans-serif;
		font-size: 0.875rem;
	}

	.related-group-count {
		font-family: Inter, system-ui, sans-serif;
		font-size: 0.875rem;
	}

	.related-heading {
		font-family: Inter, system-ui, sans-serif;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	@media (prefers-color-scheme: dark) {
		.reader-btn:hover {
			background-color: rgba(255, 255, 255, 0.05);
			border-color: var(--muted);
		}
	}
</style>