<script lang="ts">
	import { goto } from '$app/navigation';
	import posthog from 'posthog-js';

	interface Result {
		id: string;
		title: string;
		domain?: string;
		count?: number;
		meta?: { title?: string; domain?: string; [key: string]: any };
		[key: string]: any;
	}

	let isOpen = $state(false);
	let search = $state('');
	let results = $state<Result[]>([]);
	let selectedIndex = $state(0);
	let loading = $state(false);
	let inputEl: HTMLInputElement | null = $state(null);

	let debounceTimer: number | undefined;

	$effect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				isOpen = !isOpen;
				search = '';
				results = [];
				selectedIndex = 0;
			} else if (e.key === 'Escape' && isOpen) {
				isOpen = false;
			}
		}

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});

	$effect(() => {
		if (isOpen) {
			queueMicrotask(() => inputEl?.focus());
		}
	});

	$effect(() => {
		const query = search.trim();
		if (!query) {
			results = [];
			selectedIndex = 0;
			return;
		}

		clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(async () => {
			loading = true;
			try {
				const response = await fetch('/api/links?limit=10000&offset=0&mode=latest');
				if (!response.ok) {
					loading = false;
					return;
				}
				const data = await response.json();
				const allLinks = data.items || data || [];
				const q = query.toLowerCase();
				const queryWords = q.split(/\s+/).filter(Boolean);

				const filtered = (allLinks as Result[])
					.filter((link) => {
						if (!link || !link.id) return false;
						const title = (link.title || link.meta?.title || '').toLowerCase();
						const domain = (link.domain || link.meta?.domain || '').toLowerCase();
						if (!title && !domain) return false;
						const combined = `${title} ${domain}`;
						return queryWords.some((word) => combined.includes(word)) || combined.includes(q);
					})
					.sort((a, b) => {
						const aTitle = (a.title || '').toLowerCase();
						const bTitle = (b.title || '').toLowerCase();
						return (bTitle.includes(q) ? 1 : 0) - (aTitle.includes(q) ? 1 : 0);
					})
					.slice(0, 10);

				results = filtered;
				selectedIndex = 0;
			} catch (e) {
				results = [];
			} finally {
				loading = false;
			}
		}, 150);

		return () => clearTimeout(debounceTimer);
	});

	function handleSelect(result: Result) {
		if (!result.id) return;

		posthog.capture('search_article_opened', {
			article_id: result.id,
			article_title: result.title,
			search_query: search
		});

		isOpen = false;
		search = '';
		results = [];
		goto(`/reader/${encodeURIComponent(result.id)}`);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (results.length > 0) setSelectedIndex((selectedIndex + 1) % results.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (results.length > 0) setSelectedIndex((selectedIndex - 1 + results.length) % results.length);
		} else if (e.key === 'Enter' && results.length > 0) {
			e.preventDefault();
			handleSelect(results[selectedIndex]);
		}
	}

	function setSelectedIndex(v: number) {
		selectedIndex = v;
	}
</script>

{#if isOpen}
	<div class="cmd-overlay" role="presentation" onclick={() => (isOpen = false)}>
		<div class="cmd-modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<div class="command-palette-header">
				<input
					bind:this={inputEl}
					bind:value={search}
					type="text"
					placeholder="Search articles... (Press ESC to close)"
					onkeydown={handleKeyDown}
					class="cmd-input"
				/>
			</div>

			{#if loading}
				<div class="cmd-results"><div style="padding: 12px; text-align: center; color: var(--muted);">Searching...</div></div>
			{:else if results.length === 0 && search}
				<div class="cmd-results"><div style="padding: 12px; text-align: center; color: var(--muted);">No articles found</div></div>
			{:else if results.length === 0}
				<div class="cmd-results"><div style="padding: 12px; text-align: center; color: var(--muted);">Start typing to search articles</div></div>
			{:else}
				<div class="cmd-results">
					{#each results as result, idx (result.id)}
						{@const title = result.title || result.meta?.title || 'Untitled'}
						{@const domain = result.domain || result.meta?.domain || 'unknown'}
						<button
							type="button"
							class="cmd-item {idx === selectedIndex ? 'selected' : ''}"
							onclick={() => handleSelect(result)}
						>
							<div class="cmd-item-title">{title}</div>
							<div class="cmd-item-meta">
								<span>{domain}</span>
								{#if result.count}
									<span>• {result.count} votes</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}

			<div style="padding: 8px 12px; border-top: 1px solid var(--border); font-size: 10px; color: var(--muted); display: flex; gap: 12px;">
				<span>↑ ↓ to navigate</span>
				<span>ENTER to open</span>
				<span>ESC to close</span>
			</div>
		</div>
	</div>
{/if}