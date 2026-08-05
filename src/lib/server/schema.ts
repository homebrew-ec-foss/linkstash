/**
 * Idempotent DDL + migrations for the Turso schema.
 * No environment imports so it can be reused by the standalone `db:init` script.
 */

export const SCHEMA_DDL: string[] = [
	`CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      content TEXT,
      submitted_by TEXT,
      ts INTEGER NOT NULL,
      count INTEGER DEFAULT 1,
      meta TEXT
    )`,
	`CREATE INDEX IF NOT EXISTS idx_links_ts ON links(ts DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_links_url ON links(url)`,
	`CREATE TABLE IF NOT EXISTS link_index (
      link_id TEXT PRIMARY KEY,
      normalized_url TEXT NOT NULL,
      domain TEXT,
      meta TEXT,
      ts INTEGER NOT NULL,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    )`,
	`CREATE INDEX IF NOT EXISTS idx_link_index_normalized_url ON link_index(normalized_url)`,
	`CREATE TABLE IF NOT EXISTS link_embeddings (
      link_id TEXT PRIMARY KEY,
      embedding F32_BLOB(128) NOT NULL,
      source_hash TEXT NOT NULL,
      ts INTEGER NOT NULL,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    )`,
	`CREATE INDEX IF NOT EXISTS idx_link_embeddings_ts ON link_embeddings(ts DESC)`
];

export const EMBEDDING_DIM = 128;

/**
 * Vector index creation can fail on older engines; the reader API has a
 * safe fallback path, so this is best-effort.
 */
export async function ensureVectorIndex(client: any): Promise<void> {
	try {
		await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_link_embeddings_vec
      ON link_embeddings(libsql_vector_idx(embedding))
    `);
	} catch (e) {
		console.warn('vector index not available for link_embeddings, using scan fallback', e);
	}
}

/**
 * Migrate old link_index (if it had a `url` column) into the new schema by
 * moving url into meta.url (if not already present).
 */
export async function migrateLinkIndex(client: any): Promise<void> {
	try {
		const cols = await client.execute({ sql: "PRAGMA table_info('link_index')", args: [] });
		const hasUrlCol = cols.rows.some((r: any) => r.name === 'url');

		if (hasUrlCol) {
			console.log('Migrating link_index: moving `url` column into meta.url');

			await client.execute(`
        CREATE TABLE IF NOT EXISTS link_index_new (
          link_id TEXT PRIMARY KEY,
          normalized_url TEXT NOT NULL,
          domain TEXT,
          meta TEXT,
          ts INTEGER NOT NULL,
          FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
        )
      `);

			const rows = await client.execute({
				sql: 'SELECT link_id, url, normalized_url, domain, meta, ts FROM link_index',
				args: []
			});

			for (const r of rows.rows) {
				let metaObj: Record<string, unknown> = {};
				try {
					metaObj = r.meta ? JSON.parse(r.meta as string) : {};
				} catch (e) {
					metaObj = {};
				}
				if (!metaObj.url && r.url) metaObj.url = r.url as string;
				await client.execute({
					sql: 'INSERT OR REPLACE INTO link_index_new (link_id, normalized_url, domain, meta, ts) VALUES (?, ?, ?, ?, ?)',
					args: [r.link_id, r.normalized_url, r.domain, JSON.stringify(metaObj), r.ts]
				});
			}

			await client.execute({ sql: 'DROP TABLE link_index', args: [] });
			await client.execute({ sql: 'ALTER TABLE link_index_new RENAME TO link_index', args: [] });
			await client.execute(
				'CREATE INDEX IF NOT EXISTS idx_link_index_normalized_url ON link_index(normalized_url)'
			);

			console.log('link_index migration complete');
		}
	} catch (e) {
		console.warn('link_index migration failed or not necessary', e);
	}
}
