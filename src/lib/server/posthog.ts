import { PostHog } from 'posthog-node';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog {
	if (!posthogClient) {
		posthogClient = new PostHog(env.PUBLIC_POSTHOG_KEY ?? '', {
			host: env.PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0
		});
		if (privateEnv.DEV) {
			posthogClient.debug(true);
		}
	}
	return posthogClient;
}

export async function shutdownPostHog(): Promise<void> {
	if (posthogClient) {
		await posthogClient.shutdown();
	}
}
