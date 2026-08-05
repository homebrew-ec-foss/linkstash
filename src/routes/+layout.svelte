<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import ServiceWorkerRegister from '$lib/components/ServiceWorkerRegister.svelte';
	import { getFromLocalStorage } from '$lib/utils/storage';
	import { SETTINGS_THEME_KEY } from '$lib/constants';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	function applyTheme(value: string) {
		document.documentElement.classList.remove('light', 'dark');
		if (value === 'light' || value === 'dark') {
			document.documentElement.classList.add(value);
		}
	}

	onMount(() => {
		const theme = getFromLocalStorage<string>(SETTINGS_THEME_KEY);
		if (theme) applyTheme(theme);

		function handleSettingsChange(e: Event) {
			const { key, value } = (e as CustomEvent).detail;
			if (key === SETTINGS_THEME_KEY) applyTheme(value);
		}
		window.addEventListener('settings-change', handleSettingsChange);
		return () => window.removeEventListener('settings-change', handleSettingsChange);
	});
</script>

{@render children()}
<CommandPalette />
<ServiceWorkerRegister />
