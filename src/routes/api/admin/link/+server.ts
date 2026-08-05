import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { deleteLinkById } from '$lib/server/db';
import { isAuthorized } from '$lib/server/auth';

/**
 * DELETE /api/admin/link
 * Delete a link by id. Gated by `Authorization: Bearer <AUTH_KEY>`.
 */
export const DELETE: RequestHandler = async (event) => {
	const authHeader = event.request.headers.get('authorization');
	if (!isAuthorized(authHeader)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = (await event.request.json().catch(() => ({}))) as { id?: string };
		const { id } = body;
		if (!id) return json({ error: 'Missing id' }, { status: 400 });

		const ok = await deleteLinkById(id);
		if (!ok) return json({ error: 'Delete failed' }, { status: 500 });

		return json({ ok: true });
	} catch (e) {
		console.error('admin delete error', e);
		return json({ error: 'Server error' }, { status: 500 });
	}
};
