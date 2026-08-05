<script lang="ts">
	import LinksClient from '$lib/components/LinksClient.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<main class="app-main">
	<div class="container" role="main">
		<LinksClient initialPage={data.page} />
	</div>
</main>
