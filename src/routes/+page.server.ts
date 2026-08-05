import { getPaginatedLinks } from '$lib/server/db';
import type { LinksPage } from '$lib/server/db';

/**
 * Server-render the initial feed so the page paints real links on first load
 * (works with JS disabled / for crawlers). The client hydrates and continues
 * with infinite scroll via the links store.
 */
export const load = async (): Promise<{ page: LinksPage }> => {
	const page = await getPaginatedLinks({ mode: 'latest', offset: 0, limit: 50 });
	return { page };
};
