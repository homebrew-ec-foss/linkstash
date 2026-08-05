<script lang="ts">
	let registered = $state(false);
	let updateAvailable = $state(false);

	$effect(() => {
		if (!('serviceWorker' in navigator)) return;

		let reg: ServiceWorkerRegistration | null = null;

		navigator.serviceWorker
			.register('/sw.js')
			.then((r) => {
				reg = r;
				registered = true;

				// detect updates
				if (r.waiting) updateAvailable = true;
				r.addEventListener('updatefound', () => {
					const newWorker = r.installing;
					if (!newWorker) return;
					newWorker.addEventListener('statechange', () => {
						if (
							newWorker.state === 'installed' &&
							navigator.serviceWorker.controller
						) {
							updateAvailable = true;
						}
					});
				});
			})
			.catch(() => {
				// ignore registration errors
			});

		const onControllerChange = () => {
			updateAvailable = false;
		};
		navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

		return () => {
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
		};
	});

	function refreshAndReload() {
		if (!navigator.serviceWorker.controller) return window.location.reload();
		navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
	}
</script>

{#if registered}
	<div style="position: fixed; bottom: 12px; right: 12px; z-index: 9999">
		{#if updateAvailable}
			<div
				style="background: var(--card); padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.2)"
			>
				<div style="margin-bottom: 6px">Update available</div>
				<div style="display: flex; gap: 8px">
					<button onclick={refreshAndReload}>Reload</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
