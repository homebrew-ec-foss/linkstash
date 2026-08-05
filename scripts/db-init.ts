#!/usr/bin/env bun
import { createClient } from '@libsql/client';
import { SCHEMA_DDL, ensureVectorIndex, migrateLinkIndex } from '../src/lib/server/schema';

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

	console.log('Initializing Turso database...');
	for (const ddl of SCHEMA_DDL) {
		await client.execute(ddl);
	}
	await ensureVectorIndex(client);
	await migrateLinkIndex(client);
	console.log('Database initialized successfully!');

	// Test the connection
	const result = await client.execute('SELECT 1 as test');
	console.log('Database connection test:', result.rows[0]);
}

main().catch((error) => {
	console.error('Error initializing database:', error);
	process.exit(1);
});
