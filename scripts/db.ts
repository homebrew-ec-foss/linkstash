import { createClient, Client } from '@libsql/client';

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

// content is stored inline on the links table now; no separate ContentRecord


const client: Client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// Initialize database schema
export async function initDb(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      content TEXT,
      submitted_by TEXT,
      ts INTEGER NOT NULL,
      count INTEGER DEFAULT 1,
      meta TEXT
    )
  `);

  // Create index for faster queries
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_links_ts ON links(ts DESC)
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_links_url ON links(url)
  `);

  // Lightweight index for fast URL -> metadata lookups
  // Note: `url` field used to be stored here; migration below will move it into `meta` if present.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS link_index (
      link_id TEXT PRIMARY KEY,
      normalized_url TEXT NOT NULL,
      domain TEXT,
      meta TEXT,
      ts INTEGER NOT NULL,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_link_index_normalized_url ON link_index(normalized_url)
  `);

  // Migrate old link_index (if it had a `url` column) into the new schema by
  // moving url into meta.url (if not already present).
  try {
    const cols = await client.execute({ sql: "PRAGMA table_info('link_index')", args: [] });
    const hasUrlCol = cols.rows.some(r => (r.name as string) === 'url');

    if (hasUrlCol) {
      console.log('Migrating link_index: moving `url` column into meta.url');

      // create new temporary table
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

      const rows = await client.execute({ sql: 'SELECT link_id, url, normalized_url, domain, meta, ts FROM link_index', args: [] });

      for (const r of rows.rows) {
        let metaObj = {} as any;
        try { metaObj = r.meta ? JSON.parse(r.meta as string) : {}; } catch (e) { metaObj = {} }
        if (!metaObj.url && r.url) metaObj.url = r.url as string;
        await client.execute({
          sql: 'INSERT OR REPLACE INTO link_index_new (link_id, normalized_url, domain, meta, ts) VALUES (?, ?, ?, ?, ?)',
          args: [r.link_id, r.normalized_url, r.domain, JSON.stringify(metaObj), r.ts]
        });
      }

      // replace old table
      await client.execute({ sql: 'DROP TABLE link_index', args: [] });
      await client.execute({ sql: 'ALTER TABLE link_index_new RENAME TO link_index', args: [] });

      // ensure index exists
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_link_index_normalized_url ON link_index(normalized_url)
      `);

      console.log('link_index migration complete');
    }
  } catch (e) {
    console.warn('link_index migration failed or not necessary', e);
  }

}

export { client };