<script lang="ts">
	type LinkItem = {
		id: string;
		url?: string;
		meta?: { title?: string; text?: string; url?: string; [key: string]: any };
		[key: string]: any;
	};

	let links = $state<LinkItem[] | null>(null);
	let loading = $state(true);
	let authKey = $state('');
	let error = $state<string | null>(null);
	let deleting = $state<Record<string, boolean>>({});
	let search = $state('');

	async function fetchLinks() {
		loading = true;
		try {
			const res = await fetch('/api/links');
			if (!res.ok) throw new Error('Failed to load');
			const data = await res.json();
			const items = Array.isArray(data) ? data : data.items || [];
			links = items;
			error = null;
		} catch (e: any) {
			error = e.message || 'Error fetching links';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const stored =
			typeof window !== 'undefined' ? window.localStorage.getItem('admin_auth') : null;
		if (stored) authKey = stored;
		fetchLinks();
	});

	async function handleDelete(id: string) {
		if (!window.confirm('Delete this link?')) return;
		if (!authKey) {
			window.alert('Enter the AUTH_KEY before deleting');
			return;
		}

		deleting = { ...deleting, [id]: true };
		try {
			const res = await fetch('/api/admin/link', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authKey}`
				},
				body: JSON.stringify({ id })
			});
			const json = await res.json();
			if (!res.ok) {
				window.alert(json.error || 'Delete failed');
				return;
			}
			links = links ? links.filter((x) => x.id !== id) : links;
		} catch (e: any) {
			window.alert(e.message || 'Delete request failed');
		} finally {
			deleting = { ...deleting, [id]: false };
		}
	}

	function saveAuth() {
		window.localStorage.setItem('admin_auth', authKey);
		window.alert('Auth key saved to localStorage');
	}

	const filtered = $derived.by(() => {
		if (!links) return [];
		const q = search.trim().toLowerCase();
		if (!q) return links;
		return links.filter((l) => {
			const t =
				(l.meta?.title || '') +
				' ' +
				(l.meta?.url || l.url || '') +
				' ' +
				(l.id || '');
			return t.toLowerCase().includes(q);
		});
	});

	function shortId(id: string) {
		return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
	}
</script>

<div class="admin">
	<h1>Admin</h1>
	<p>Delete links (authenticate with your <code>AUTH_KEY</code>).</p>

	<div class="admin-form">
		<input class="admin-input" bind:value={authKey} placeholder="AUTH_KEY" aria-label="AUTH_KEY" />
		<button class="admin-btn" onclick={saveAuth}>Save</button>
		<button class="admin-btn" onclick={() => { authKey = ''; window.localStorage.removeItem('admin_auth'); }}>Clear</button>
		<input class="admin-input" placeholder="Search title, url, or id" bind:value={search} />
	</div>

	{#if error}
		<div class="admin-error">{error}</div>
	{/if}

	{#if loading}
		<div class="loading">Loading links…</div>
	{:else}
		<table class="admin-table">
			<thead>
				<tr>
					<th class="id-col">ID</th>
					<th>Title / URL</th>
					<th class="actions-col"></th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as l (l.id)}
					<tr>
						<td class="id-cell" title={l.id}><code>{shortId(l.id)}</code></td>
						<td>
							<div>{l.meta?.title || l.meta?.text || l.meta?.url || l.url}</div>
						</td>
						<td class="text-right">
							<button
								class="admin-btn delete"
								disabled={Boolean(deleting[l.id])}
								onclick={() => handleDelete(l.id)}
							>
								{deleting[l.id] ? 'Deleting…' : 'Delete'}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<div class="admin-footer">
		<button class="admin-btn" onclick={fetchLinks}>Refresh</button>
	</div>
</div>