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

	<div class="room-filter">
		<button
			type="button"
			class="admin-btn room-filter-btn"
			class:active={room === ''}
			onclick={() => (room = '')}
		>
			All rooms
		</button>
		{#each data?.rooms || [] as roomItem (roomItem.name)}
			<button
				type="button"
				class="admin-btn room-filter-btn"
				class:active={roomItem.name === room}
				onclick={() => (room = roomItem.name)}
			>
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

	<div class="calendar-section">
		<h3 class="calendar-heading">Calendar view</h3>
		<p class="calendar-subtitle">
			{selectedDay ? formatLongDay(selectedDay) : 'Select a day with activity'}
		</p>

		<div class="calendar-weekdays">
			<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
		</div>

		<div class="calendar-grid">
			{#each Array(calendarOffset) as _, idx (idx)}
				<div></div>
			{/each}

			{#each calendarDays as day (day)}
				{@const count = countsByDay.get(day) || 0}
				{@const intensity = getIntensity(count)}
				<button
					type="button"
					class="calendar-day"
					class:selected={selectedDay === day}
					onclick={() => (selectedDay = day)}
					title="{day}: {count} links"
					style:background={getIntensityColor(intensity)}
				>
					<span class="calendar-day-number">{new Date(`${day}T00:00:00Z`).getUTCDate()}</span>
					<span class="calendar-day-count">{count > 0 ? count : ''}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="summary-list-section">
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

	<p class="summary-back">
		<a href="/" class="summary-back-link">Back to feed</a>
	</p>
</div>