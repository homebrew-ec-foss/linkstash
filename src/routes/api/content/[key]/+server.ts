import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getClient, initDb } from '$lib/server/db';
import { getPostHogClient } from '$lib/server/posthog';

/**
 * GET /api/content/[key]
 * Returns the stored markdown/plain-text content for a link id.
 */
export const GET: RequestHandler = async (event) => {
	const { key } = event.params;

	if (!key) {
		return json({ error: 'Missing content key' }, { status: 400 });
	}

	try {
		await initDb();

		const result = await getClient().execute({
			sql: 'SELECT content FROM links WHERE id = ?',
			args: [key]
		});

		if (result.rows.length === 0) {
			return json({ error: 'Not found' }, { status: 404 });
		}

		// Track content fetched event with PostHog
		const posthog = getPostHogClient();
		posthog.capture({
			distinctId: 'anonymous',
			event: 'content_fetched',
			properties: {
				content_id: key,
				content_length: (result.rows[0].content as string)?.length || 0
			}
		});

		return new Response(result.rows[0].content as string, {
			headers: { 'Content-Type': 'text/plain' }
		});
	} catch (error) {
		console.error('Error in content endpoint:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
