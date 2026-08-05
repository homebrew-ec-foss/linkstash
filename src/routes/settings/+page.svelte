<script lang="ts">
	import { onMount } from 'svelte';
	import Header from '$lib/components/Header.svelte';
	import { getFromLocalStorage, setToLocalStorage } from '$lib/utils/storage';
	import {
		SETTINGS_LAYOUT_KEY,
		SETTINGS_THEME_KEY,
		SETTINGS_READER_FONT_KEY
	} from '$lib/constants';

	let layout = $state<'compact' | 'grid'>('grid');
	let theme = $state<'light' | 'dark' | 'system'>('system');
	let readerFont = $state<'serif' | 'sans'>('sans');
	let mounted = $state(false);

	onMount(() => {
		layout = getFromLocalStorage<string>(SETTINGS_LAYOUT_KEY) === 'compact' ? 'compact' : 'grid';
		theme = (getFromLocalStorage<string>(SETTINGS_THEME_KEY) as 'light' | 'dark' | 'system') || 'system';
		readerFont = (getFromLocalStorage<string>(SETTINGS_READER_FONT_KEY) as 'serif' | 'sans') || 'sans';
		mounted = true;
	});

	function saveLayout(value: 'compact' | 'grid') {
		layout = value;
		setToLocalStorage(SETTINGS_LAYOUT_KEY, value);
		dispatchEvent(new CustomEvent('settings-change', { detail: { key: SETTINGS_LAYOUT_KEY, value } }));
	}

	function saveTheme(value: 'light' | 'dark' | 'system') {
		theme = value;
		setToLocalStorage(SETTINGS_THEME_KEY, value);
		applyTheme(value);
		dispatchEvent(new CustomEvent('settings-change', { detail: { key: SETTINGS_THEME_KEY, value } }));
	}

	function saveReaderFont(value: 'serif' | 'sans') {
		readerFont = value;
		setToLocalStorage(SETTINGS_READER_FONT_KEY, value);
		dispatchEvent(new CustomEvent('settings-change', { detail: { key: SETTINGS_READER_FONT_KEY, value } }));
	}

	function applyTheme(value: 'light' | 'dark' | 'system') {
		if (value === 'system') {
			document.documentElement.classList.remove('light', 'dark');
		} else {
			document.documentElement.classList.remove('light', 'dark');
			document.documentElement.classList.add(value);
		}
	}
</script>

<svelte:head>
	<title>Settings – linkstash</title>
</svelte:head>

<Header />

<main class="app-main">
	<div class="container settings-page">
		<h1 class="settings-heading">Settings</h1>

		{#if mounted}
			<section class="settings-section">
				<h2 class="settings-label">Layout</h2>
				<p class="settings-description">Choose how links are displayed on the home page.</p>
				<div class="settings-options">
					<button
						type="button"
						class="settings-option"
						class:selected={layout === 'grid'}
						onclick={() => saveLayout('grid')}
					>
						<span class="settings-option-title">Card grid</span>
						<span class="settings-option-desc">Visual cards with thumbnails</span>
					</button>
					<button
						type="button"
						class="settings-option"
						class:selected={layout === 'compact'}
						onclick={() => saveLayout('compact')}
					>
						<span class="settings-option-title">Compact rows</span>
						<span class="settings-option-desc">Dense list view</span>
					</button>
				</div>
			</section>

			<section class="settings-section">
				<h2 class="settings-label">Theme</h2>
				<p class="settings-description">Override the color scheme.</p>
				<div class="settings-options">
					<button
						type="button"
						class="settings-option"
						class:selected={theme === 'light'}
						onclick={() => saveTheme('light')}
					>
						<span class="settings-option-title">Light</span>
					</button>
					<button
						type="button"
						class="settings-option"
						class:selected={theme === 'dark'}
						onclick={() => saveTheme('dark')}
					>
						<span class="settings-option-title">Dark</span>
					</button>
					<button
						type="button"
						class="settings-option"
						class:selected={theme === 'system'}
						onclick={() => saveTheme('system')}
					>
						<span class="settings-option-title">System</span>
					</button>
				</div>
			</section>

			<section class="settings-section">
				<h2 class="settings-label">Reader font</h2>
				<p class="settings-description">Font used for article headings in reader view.</p>
				<div class="settings-options">
					<button
						type="button"
						class="settings-option"
						class:selected={readerFont === 'sans'}
						onclick={() => saveReaderFont('sans')}
					>
						<span class="settings-option-title">Sans-serif</span>
						<span class="settings-option-desc">System default</span>
					</button>
					<button
						type="button"
						class="settings-option"
						class:selected={readerFont === 'serif'}
						onclick={() => saveReaderFont('serif')}
					>
						<span class="settings-option-title">Serif</span>
						<span class="settings-option-desc">Georgia / Times</span>
					</button>
				</div>
			</section>
		{/if}
	</div>
</main>
