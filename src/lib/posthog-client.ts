/**
 * Client-side PostHog initialization (SvelteKit equivalent of instrumentation.client.ts).
 */
import posthog from 'posthog-js';
import { env } from '$env/dynamic/public';

let initialized = false;

export function initPostHog(): void {
	if (initialized || typeof window === 'undefined') return;
	const key = env.PUBLIC_POSTHOG_KEY;
	if (!key) return;

	posthog.init(key, {
		api_host: env.PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
		// Enables capturing unhandled exceptions via Error Tracking
		capture_exceptions: true,
		// Turn on debug in development mode
		debug: import.meta.env.DEV
	});

	initialized = true;
}
