<script lang="ts">
	import { onMount } from 'svelte';

	type SummaryItem = {
		id?: string;
		url?: string;
		title?: string;
		name?: string;
		domain?: string;
		roomComment?: string;
		ts?: number;
		count?: number;
		meta?: Record<string, any>;
	};

	type RoomStat = {
		name: string;
		total: number;
	};

	type SummaryResponse = {
		from: string | null;
		to: string | null;
		room: string | null;
		total: number;
		rooms: RoomStat[];
		summary: SummaryItem[];
	};

	let from = $state('');
	let to = $state('');
	let room = $state('');
	let query = $state('');
	let selectedDay = $state('');

	let data = $state<SummaryResponse | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function toIsoDay(d: Date) {
		return d.toISOString().slice(0, 10);
	}

	function formatRange(from: string | null, to: string | null) {
		if (!from || !to) return 'Latest activity';
		const fromDate = new Date(`${from}T00:00:00`);
		const toDate = new Date(`${to}T00:00:00`);
		const fromLabel = fromDate.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
		const toLabel = toDate.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
		return from === to ? fromLabel : `${fromLabel} to ${toLabel}`;
	}

	function roomName(item: SummaryItem) {
		return (item.roomComment || '').trim() || 'Unknown';
	}

	function dayKeyFromTs(ts: number | undefined) {
		if (!ts) return '';
		return new Date(ts).toISOString().slice(0, 10);
	}

	function formatLongDay(day: string) {
		const d = new Date(`${day}T00:00:00Z`);
		return d.toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function buildDayRange(from: string | null, to: string | null) {
		if (!from || !to) return [] as string[];
		const start = new Date(`${from}T00:00:00Z`);
		const end = new Date(`${to}T00:00:00Z`);
		const out: string[] = [];
		for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
			out.push(d.toISOString().slice(0, 10));
		}
		return out;
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const initialFrom = params.get('from') || params.get('day') || '';
		const initialTo = params.get('to') || params.get('day') || '';
		const initialRoom = params.get('room') || '';
		from = initialFrom;
		to = initialTo;
		room = initialRoom;
	});

	$effect(() => {
		let cancelled = false;

		async function run() {
			loading = true;
			error = null;
			try {
				const params = new URLSearchParams();
				if (from) params.set('from', from);
				if (to) params.set('to', to);
				if (room) params.set('room', room);

				const search = params.toString();
				const url = `/api/summary${search ? `?${search}` : ''}`;
				const res = await fetch(url);
				if (!res.ok) {
					error = `Failed to load summary (${res.status})`;
					return;
				}

				const payload = (await res.json()) as SummaryResponse;
				if (cancelled) return;
				data = payload;

				if (!from && payload.from) from = payload.from;
				if (!to && payload.to) to = payload.to;

				const queryParams = new URLSearchParams(window.location.search);
				if (from) queryParams.set('from', from);
				else queryParams.delete('from');
				if (to) queryParams.set('to', to);
				else queryParams.delete('to');
				queryParams.delete('day');
				if (room) queryParams.set('room', room);
				else queryParams.delete('room');
				const next = queryParams.toString();
				window.history.replaceState(null, '', `/summary${next ? `?${next}` : ''}`);
			} catch (e) {
				if (!cancelled) error = 'Unable to load summary';
			} finally {
				if (!cancelled) loading = false;
			}
		}

		run();
		return () => {
			cancelled = true;
		};
	});

	const filtered = $derived.by(() => {
		const list = data?.summary || [];
		if (!query.trim()) return list;
		const q = query.trim().toLowerCase();
		return list.filter((item) => {
			const title = (item.title || item.name || item.meta?.title || '').toLowerCase();
			const domain = (item.domain || item.meta?.domain || '').toLowerCase();
			const url = (item.url || item.meta?.url || '').toLowerCase();
			const roomText = roomName(item).toLowerCase();
			return (
				title.includes(q) ||
				domain.includes(q) ||
				url.includes(q) ||
				roomText.includes(q)
			);
		});
	});

	const totalVotes = $derived(
		filtered.reduce((acc, item) => acc + (item.count || 0), 0)
	);

	const activeRoomLabel = $derived(room || 'All rooms');
	const rangeFrom = $derived(data?.from || from || null);
	const rangeTo = $derived(data?.to || to || null);
	const calendarDays = $derived(buildDayRange(rangeFrom, rangeTo));

	const countsByDay = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const item of filtered) {
			const day = dayKeyFromTs(item.ts);
			if (!day) continue;
			counts.set(day, (counts.get(day) || 0) + 1);
		}
		return counts;
	});

	const maxDayCount = $derived.by(() => {
		let max = 0;
		for (const value of countsByDay.values()) {
			if (value > max) max = value;
		}
		return max || 1;
	});

	$effect(() => {
		const populatedDays = Array.from(countsByDay.keys()).sort((a, b) =>
			a.localeCompare(b)
		);
		if (populatedDays.length === 0) {
			selectedDay = '';
			return;
		}
		if (!selectedDay || !countsByDay.has(selectedDay)) {
			selectedDay = populatedDays[populatedDays.length - 1];
		}
	});

	const selectedDayLinks = $derived.by(() => {
		if (!selectedDay) return filtered;
		return filtered.filter((item) => dayKeyFromTs(item.ts) === selectedDay);
	});

	function getIntensity(count: number) {
		if (count === 0) return 0;
		if (count >= maxDayCount * 0.8) return 4;
		if (count >= maxDayCount * 0.55) return 3;
		if (count >= maxDayCount * 0.3) return 2;
		return 1;
	}

	const calendarOffset = $derived.by(() => {
		if (calendarDays.length === 0) return 0;
		return new Date(`${calendarDays[0]}T00:00:00Z`).getUTCDay();
	});

	function getIntensityColor(intensity: number) {
		if (intensity === 0) return 'transparent';
		const alpha = 0.1 + intensity * 0.2;
		return `rgba(80, 156, 147, ${alpha})`;
	}
</script>

<div class="summary">
	<h1>Summary</h1>
	<p class="subtitle">{formatRange(data?.from || from || null, data?.to || to || null)}</p>

	<div class="admin-form">
		<input type="date" class="admin-input" bind:value={from} max={toIsoDay(new Date())} />
		<input type="date" class="admin-input" bind:value={to} min={from || undefined} max={toIsoDay(new Date())} />
		<input type="text" class="admin-input" bind:value={query} placeholder="Search title, domain, URL, room" />
		<button class="admin-btn" onclick={() => { from = ''; to = ''; query = ''; }}>Reset</button>
	</div>

	<div style="display: flex; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 1rem;">
		<button class="admin-btn" onclick={() => room = ''} style="background: {room === '' ? 'var(--accent)' : 'var(--card)'}; color: {room === '' ? '#fff' : 'var(--fg)'}; border-color: {room === '' ? 'var(--accent)' : 'var(--border)'};">All rooms</button>
		{#each data?.rooms || [] as roomItem (roomItem.name)}
			<button class="admin-btn" onclick={() => room = roomItem.name} style="background: {roomItem.name === room ? 'var(--accent)' : 'var(--card)'}; color: {roomItem.name === room ? '#fff' : 'var(--fg)'}; border-color: {roomItem.name === room ? 'var(--accent)' : 'var(--border)'};">
				{roomItem.name} ({roomItem.total})
			</button>
		{/each}
	</div>

	<div class="summary-stats">
		<div class="summary-stat">
			<div class="summary-stat-value">{filtered.length}</div>
			<div class="summary-stat-label">links shown</div>
		</div>
		<div class="summary-stat">
			<div class="summary-stat-value">{totalVotes}</div>
			<div class="summary-stat-label">total votes</div>
		</div>
		<div class="summary-stat">
			<div class="summary-stat-value">{activeRoomLabel}</div>
			<div class="summary-stat-label">active room filter</div>
		</div>
	</div>

	<div style="margin-top: 2rem;">
		<h3 style="font-size: 0.75rem; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.5rem;">Calendar view</h3>
		<p style="font-size: 0.75rem; color: var(--muted); margin-bottom: 0.75rem;">
			{selectedDay ? formatLongDay(selectedDay) : 'Select a day with activity'}
		</p>

		<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.25rem; font-size: 0.6875rem; color: var(--muted); text-align: center; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.25rem;">
			<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
		</div>

		<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.25rem;">
			{#each Array(calendarOffset) as _, idx}
				<div></div>
			{/each}

			{#each calendarDays as day (day)}
				{@const count = countsByDay.get(day) || 0}
				{@const intensity = getIntensity(count)}
				<button
					type="button"
					onclick={() => selectedDay = day}
					title="{day}: {count} links"
					style="
						height: 2.5rem;
						border: 1px solid var(--border);
						background: {getIntensityColor(intensity)};
						color: var(--fg);
						cursor: pointer;
						display: flex;
						flex-direction: column;
						justify-content: flex-start;
						align-items: flex-start;
						padding: 0.25rem;
						font-size: 0.75rem;
						text-align: left;
						border-radius: var(--radius);
						{selectedDay === day ? 'border-color: var(--accent); outline: 1px solid var(--accent);' : ''}
					"
				>
					<span style="font-weight: 500;">{new Date(`${day}T00:00:00Z`).getUTCDate()}</span>
					<span style="font-size: 0.6875rem; opacity: 0.8;">{count > 0 ? count : ''}</span>
				</button>
			{/each}
		</div>
	</div>

	<div style="margin-top: 2rem; border-top: 1px solid var(--border); padding-top: 1rem;">
		{#if loading}
			<div class="loading">Loading summary...</div>
		{:else if error}
			<div class="empty">{error}</div>
		{:else if selectedDayLinks.length === 0}
			<div class="empty">No links match this filter.</div>
		{:else}
			<ul class="linklist">
				{#each selectedDayLinks as item, idx (item.id || `${item.url}-${idx}`)}
					{@const url = item.url || item.meta?.url || '#'}
					{@const title = item.title || item.name || item.meta?.title || url}
					{@const domain =
						item.domain ||
						item.meta?.domain ||
						(() => {
							try {
								return new URL(url).hostname;
							} catch (e) {
								return '';
							}
						})()}
					<li class="linklist-item">
						<div class="link-row">
							<div class="link-main">
								<a class="link-title" href={url} target="_blank" rel="noopener noreferrer">{title}</a>
								<div class="link-meta">
									<span class="link-domain">{domain}</span>
									<span class="link-room">{roomName(item)}</span>
									<span class="link-votes">{item.count ? `${item.count} votes` : ''}</span>
								</div>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<p style="margin-top: 2rem; text-align: center;">
		<a href="/" style="color: var(--muted); font-size: 0.875rem;">Back to feed</a>
	</p>
</div>