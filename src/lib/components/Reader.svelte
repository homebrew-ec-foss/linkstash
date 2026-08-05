<script lang="ts">
	import { page } from '$app/stores';
	import { Sparkles } from 'lucide-svelte';
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
	let suggestionsExpanded = $state(true);
	let fontSize = $state(16);
	let fontFamily = $state('system-ui');

	let articleEl: HTMLElement | null = $state(null);

	let touchStartX: number | null = null;
	let touchStartY: number | null = null;
	let touchStartTime: number | null = null;

	const currentId = $derived(queue.length > 0 ? queue[index] : undefined);
	const currentMeta = $derived(currentId ? metas[currentId] : null);

	// Online/offline detection
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

	// Parse location and build queue: prefer /reader/:id, fallback to legacy hash style.
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
						// not in index: show single first then the rest
						queue = [single, ...allIds.filter((i: string) => i !== single)];
						index = 0;
					}
				} catch (e) {
					queue = [single];
					index = 0;
				}
			} else {
				// multiple ids provided explicitly — follow that
				queue = ids;
				index = 0;
			}
		};

		readLocation();
	});

	// Load meta data for queue items from the stored links cache
	$effect(() => {
		if (!queue.length) return;

		// Track reader page opened event
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

		// Keep only metas for items in the queue
		const filtered: Record<string, any> = {};
		queue.forEach((id) => {
			if (m[id]) filtered[id] = m[id];
		});
		metas = filtered;
	});

	// Fetch metadata for current article if not available
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
				// ignore errors
			}
		})();
	});

	// Load content for current index
	$effect(() => {
		const id = currentId;
		if (!id) return;

		(async () => {
			loading = true;
			error = null;
			content = null;

			// Try to load cached content from localStorage first
			try {
				const cached = getFromLocalStorage<{ ts: number; content: string }>(
					`reader:content:${id}`
				);
				if (cached && cached.content) {
					content = cached.content;
					isFromCache = true;
				}
			} catch (err) {
				// ignore localStorage access errors
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

				// Persist content to localStorage for offline reading
				setToLocalStorage(`reader:content:${id}`, { ts: Date.now(), content: txt });

				// Try to extract H1 and update links_cache if it lacks a title
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

	// Navigation helpers (wrap around at ends)
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

	// Keyboard support
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

	// Touch handlers
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

	// Load related suggestions for the current item
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

	// Ensure every rendered page has an H1: prefer meta title, then hostname (from URL), then id
	const defaultH1Text = $derived.by(() => {
		if (currentMeta?.meta?.title) return currentMeta.meta.title;
		if (currentMeta?.title) return currentMeta.title;
		if (currentMeta?.url) {
			try {
				return new URL(currentMeta.url).hostname;
			} catch (e) {
				// ignore invalid URL
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

	// Update document title to show current article
	$effect(() => {
		document.title = metaTitle || 'Reader';
	});

	// Proxy-fallback for images that fail to load (delegated so sanitized HTML stays clean)
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
</script>

<div
	class="reader-overlay"
	role="region"
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	style="min-height: 100vh"
>
	<div class="reader-panel reader-minimal" style="height: 100vh">
		<aside class="reader-sidebar">
			<div class="sidebar-title">{metaTitle || 'Reader'}</div>
			<div class="sidebar-excerpt">{currentMeta?.summary || ''}</div>
		</aside>

		<div class="reader-body">
			<div class="reader-ctrls-vertical" role="toolbar" aria-label="Reader navigation">
				<button class="reader-btn-small" type="button" onclick={gotoPrev}>‹</button>
				<button class="reader-btn-small" type="button" onclick={gotoNext}>›</button>
				{#if currentMeta?.url}
					<a
						class="reader-btn-small"
						href={currentMeta.url}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Open"
						>⤢</a
					>
				{/if}
				<button
					class="reader-btn-small"
					type="button"
					onclick={() => removeFromQueue(index)}
					aria-label="Remove"
					>×</button
				>
			</div>

			<div class="reader-header">
				<div class="reader-title">
					{#if currentMeta?.url}
						{@const host = (() => {
							try {
								return new URL(currentMeta.url).hostname;
							} catch (e) {
								return metaTitle || 'Reader';
							}
						})()}
						<a
							href={currentMeta.url}
							target="_blank"
							rel="noopener noreferrer"
							class="reader-header-link"
							>{host}</a
						>
					{:else}
						{metaTitle || 'Reader'}
					{/if}
				</div>
				<div class="reader-status">
					{#if !isOnline}
						<span class="status-badge offline">Offline</span>
					{/if}
					{#if isFromCache}
						<span class="status-badge cached">Cached</span>
					{/if}
				</div>
				<div class="reader-toolbar">
					<div class="toolbar-group">
						<button
							type="button"
							class="toolbar-button"
							title="Decrease font size"
							onclick={() => (fontSize = Math.max(12, fontSize - 1))}
							>−</button
						>
						<input
							type="range"
							min="12"
							max="24"
							bind:value={fontSize}
							class="toolbar-slider"
							title="Font size: {fontSize}px"
						/>
						<button
							type="button"
							class="toolbar-button"
							title="Increase font size"
							onclick={() => (fontSize = Math.min(24, fontSize + 1))}
							>+</button
						>
					</div>

					<div class="toolbar-group">
						<select bind:value={fontFamily} class="toolbar-select" title="Font family">
							<option value="system-ui">System</option>
							<option value="Baskerville, 'Times New Roman', serif">Baskerville</option>
							<option value="Georgia, serif">Georgia</option>
							<option value="EB Garamond, serif">EB Garamond</option>
							<option value="Garamond, serif">Garamond</option>
							<option
								value="'Palatino Linotype', 'Book Antiqua', Palatino, serif"
								>Palatino</option
							>
							<option value="Cambria, serif">Cambria</option>
							<option value="'Times New Roman', serif">Times</option>
							<option value="Courier, monospace">Monospace</option>
						</select>
					</div>

					<div class="toolbar-group toolbar-group-end">
						<button
							type="button"
							class="toolbar-button"
							onclick={() => (suggestionsExpanded = !suggestionsExpanded)}
							title={suggestionsExpanded ? 'Hide suggestions' : 'Show suggestions'}
							aria-label={suggestionsExpanded ? 'Hide suggestions' : 'Show suggestions'}
						>
							<Sparkles size={16} />
						</button>
						{#if currentMeta?.url}
							<a
								href={currentMeta.url}
								target="_blank"
								rel="noopener noreferrer"
								class="toolbar-button"
								title="Open original"
								>↗</a
							>
						{/if}
						<button
							type="button"
							class="toolbar-button"
							onclick={() => history.back()}
							aria-label="Close"
							title="Close"
							>✕</button
						>
					</div>
				</div>
			</div>

			<div class="reader-content reader-content-with-suggestions">
				<div class="reader-article-col">
					{#if loading}
						<div class="p-6 text-center text-gray-500">Loading…</div>
					{:else if error}
						<div class="p-6 text-center text-gray-500">{error}</div>
					{:else if content}
						<article
							class="markdown-body"
							style="font-size: {fontSize}px; font-family: {fontFamily}"
						>
							<h1 class="markdown-title" style="font-family: {fontFamily}">
								{metaTitle || 'Untitled'}
							</h1>
							<div bind:this={articleEl}>{@html renderedHtml}</div>
						</article>
					{:else}
						<div class="p-6 text-center text-gray-500">No content.</div>
					{/if}
				</div>

				<aside class="reader-suggestions-side" aria-label="Suggested articles and groups">
					{#if suggestionsExpanded}
						<div class="suggestion-section-title">Suggested Articles</div>
						{#if relatedLoading}
							<div class="suggestion-empty">Finding related links...</div>
						{:else if relatedItems.length === 0}
							<div class="suggestion-empty">No related links yet.</div>
						{:else}
							<ol class="suggestion-list">
								{#each relatedItems.slice(0, 10) as item (item.id)}
									<li>
										<a
											href={`/reader/${encodeURIComponent(item.id)}`}
											class="suggestion-link"
										>
											<span class="suggestion-title">{item.title}</span>
											<span class="suggestion-meta"
												>{item.domain || 'unknown domain'} •{' '}
												{Math.round(item.score * 100)}%</span
											>
										</a>
									</li>
								{/each}
							</ol>
						{/if}

						<div class="suggestion-section-title">Suggested Groups</div>
						{#if relatedGroups.length === 0}
							<div class="suggestion-empty">No groups available.</div>
						{:else}
							<ul class="suggestion-group-list">
								{#each relatedGroups.slice(0, 8) as group (group.name)}
									<li>
										<span>{group.name}</span>
										<strong>{group.count}</strong>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</aside>
			</div>
		</div>

		<aside class="reader-queue">
			<ol>
				{#each queue as it, i (it)}
					<li class={i === index ? 'active' : ''}>
						<button
							class="queue-title"
							onclick={() => (index = i)}
						>
							{metas[it] && (metas[it].title || metas[it]?.meta?.title)
								? metas[it].title || metas[it]?.meta?.title
								: it}
						</button>
						<button
							class="queue-remove"
							onclick={(e) => {
								e.stopPropagation();
								removeFromQueue(i);
							}}
							aria-label="Remove"
							>×</button
						>
					</li>
				{/each}
			</ol>
		</aside>
	</div>
</div>
