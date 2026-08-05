<script lang="ts">
	import '../app.css';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import ServiceWorkerRegister from '$lib/components/ServiceWorkerRegister.svelte';
</script>

<slot />
<CommandPalette />
<ServiceWorkerRegister />
