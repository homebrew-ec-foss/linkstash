import { createClient, type Client } from '@libsql/client';
import { env } from '$env/dynamic/private';
import {
	SCHEMA_DDL,
	EMBEDDING_DIM,
	ensureVectorIndex,
	migrateLinkIndex
} from './schema';

export interface LinkRecord {
	id: string;
	url: string;
	domain: string;
	content?: string; // content stored inline now
	ts: number;
	count: number;
	meta?: Record<string, any>;
	submittedBy?: string; // who submitted the link
}

// Lazy-initialize client so routes that don't touch the DB never pay the cost
let _client: Client | null = null;

export function getClient(): Client {
	if (!_client) {
		const url = env.TURSO_DATABASE_URL;
		if (!url) {
			throw new Error('TURSO_DATABASE_URL environment variable is not set');
		}
		_client = createClient({
			url,
			authToken: env.TURSO_AUTH_TOKEN
		});
	}
	return _client;
}

let attemptedVectorIndexInit = false;

// Initialize database schema
export async function initDb(): Promise<void> {
	if (!env.TURSO_DATABASE_URL) {
		return;
	}

	const c = getClient();

	for (const ddl of SCHEMA_DDL) {
		await c.execute(ddl);
	}

	if (!attemptedVectorIndexInit) {
		attemptedVectorIndexInit = true;
		await ensureVectorIndex(c);
	}

	await migrateLinkIndex(c);
}

export { EMBEDDING_DIM };

/**
 * Strip sensitive fields that should never be exposed via public APIs.
 * Room comments are preserved; they're useful context and are intended to be public-facing.
 */
export function sanitizeLink(obj: any): any {
	const out = { ...obj };
	delete out.submittedBy;
	delete out.roomId;
	delete out.submitted_by;
	delete out.room_id;
	if (out.meta && typeof out.meta === 'object') {
		delete out.meta.submittedBy;
		delete out.meta.roomId;
		delete out.meta.submitted_by;
		delete out.meta.room_id;
		delete out.meta.voteState;
	}
	return out;
}

function normalizeUrl(u: string): string {
	if (!u || typeof u !== 'string') return '';
	try {
		const nu = new URL(u);
		const path = nu.pathname.replace(/\/+$|^$/, '');
		return nu.origin + (path || '/') + nu.search;
	} catch (e) {
		return u.replace(/\/+$/, '');
	}
}

/**
 * Build a Link-shaped object from a joined row.
 * meta fields (title, url, domain, roomComment, tags, ...) are spread over the base row.
 */
export function rowToLink(row: any): any {
	const meta = row.meta ? JSON.parse(row.meta as string) : {};
	const base: any = { id: row.id as string, ts: row.ts as number, count: row.count as number };
	if (row.url) base.url = row.url as string;
	if (row.domain) base.domain = row.domain as string;
	return Object.assign(base, meta);
}

export async function getLinks(): Promise<any[]> {
	await initDb();
	const result = await getClient().execute({
		sql: `SELECT li.link_id AS id, li.domain, l.url AS url, l.submitted_by, li.ts AS ts, l.count, COALESCE(l.meta, li.meta) AS meta
          FROM link_index li
          LEFT JOIN links l ON l.id = li.link_id
          ORDER BY li.ts DESC`,
		args: []
	});

	return result.rows.map((row) => sanitizeLink(rowToLink(row)));
}

export async function getLinkByUrl(url: string): Promise<any | null> {
	await initDb();

	const qnorm = normalizeUrl(url);

	const result = await getClient().execute({
		sql: `SELECT l.id, l.url, l.domain, l.submitted_by, l.ts, l.count, COALESCE(l.meta, li.meta) AS meta
          FROM link_index li
          JOIN links l ON l.id = li.link_id
          WHERE li.normalized_url = ?
          LIMIT 1`,
		args: [qnorm]
	});

	if (result.rows.length === 0) return null;
	return sanitizeLink(rowToLink(result.rows[0]));
}

export async function deleteLinkById(id: string): Promise<boolean> {
	await initDb();
	try {
		// Delete from links; link_index is configured with FK ON DELETE CASCADE, but clean both to be safe
		await getClient().execute({ sql: 'DELETE FROM links WHERE id = ?', args: [id] });
		await getClient().execute({ sql: 'DELETE FROM link_index WHERE link_id = ?', args: [id] });
		return true;
	} catch (e) {
		console.error('deleteLinkById error', e);
		return false;
	}
}
