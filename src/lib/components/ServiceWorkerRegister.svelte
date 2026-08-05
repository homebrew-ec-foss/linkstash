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

{#if registered && updateAvailable}
	<div class="sw-toast">
		<div class="sw-toast-message">Update available</div>
		<button type="button" class="admin-btn" onclick={refreshAndReload}>Reload</button>
	</div>
{/if}

<style>
	.sw-toast {
		position: fixed;
		bottom: 0.75rem;
		right: 0.75rem;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
	}

	.sw-toast-message {
		font-size: 0.875rem;
		color: var(--fg);
	}
</style>
