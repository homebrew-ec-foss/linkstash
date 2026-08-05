#!/usr/bin/env bun
import { createClient } from '@libsql/client';

const INDEX_NAME = 'idx_link_embeddings_vec';

/**
 * Repair the link_embeddings vector index. `CREATE INDEX IF NOT EXISTS`
 * won't recreate an existing-but-broken index (libsql can leave the shadow
 * table inconsistent when the index was built over non-empty data, or when
 * the engine version changed). Dropping and recreating fixes that. If the
 * column dimension itself changed, you must rebuild `link_embeddings`
 * instead.
 */
async function main(): Promise<void> {
	const url = process.env.TURSO_DATABASE_URL;
	if (!url) {
		console.error('TURSO_DATABASE_URL is not set');
		process.exit(1);
	}

	const client = createClient({
		url,
		authToken: process.env.TURSO_AUTH_TOKEN
	});

	console.log(`Dropping vector index ${INDEX_NAME}...`);
	await client.execute(`DROP INDEX IF EXISTS ${INDEX_NAME}`);

	console.log(`Recreating vector index ${INDEX_NAME}...`);
	try {
		await client.execute(`
      CREATE INDEX ${INDEX_NAME}
      ON link_embeddings(libsql_vector_idx(embedding))
    `);
	} catch (e) {
		console.error('Failed to recreate vector index:', e);
		console.error('The engine may not support vectors on this database.');
		process.exit(1);
	}

	console.log('Verifying the shadow-row insert path...');
	try {
		const test = await client.execute({
			sql: `UPDATE link_embeddings SET ts = ts WHERE link_id IN (SELECT link_id FROM link_embeddings LIMIT 1)`
		});
		console.log('Insert path OK:', test.rowsAffected, 'row(s) touched');
	} catch (e) {
		console.error(
			'Vector index still rejects writes. If the F32_BLOB dimension changed, rebuild link_embeddings:',
			e
		);
		process.exit(1);
	}

	console.log('Vector index recreated and verified.');
}

main().catch((error) => {
	console.error('Error reindexing database:', error);
	process.exit(1);
});
