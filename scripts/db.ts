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

/**
 * Server helpers: return link index or a single link by URL so server components
 * can call these directly (avoid relative fetch() in server runtime).
 */

function sanitizeLink(obj: any): any {
  const out = { ...obj };
  // remove sensitive fields that should never be exposed via public APIs
  delete out.submittedBy;
  delete out.roomId;
  // keep room comments; they're useful context and are intended to be public-facing
  delete out.submitted_by;
  delete out.room_id;
  if (out.meta && typeof out.meta === 'object') {
    delete out.meta.submittedBy;
    delete out.meta.roomId;
    // preserve meta.roomComment
    delete out.meta.submitted_by;
    delete out.meta.room_id;
  }
  return out;
}

export async function getLinks(): Promise<any[]> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT li.link_id AS id, li.domain, l.submitted_by, li.ts AS ts, l.count, COALESCE(l.meta, li.meta) as meta
          FROM link_index li
          LEFT JOIN links l ON l.id = li.link_id
          ORDER BY li.ts DESC`,
    args: []
  });

  return result.rows.map(row => {
    const metaObj = row.meta ? JSON.parse(row.meta as string) : {};
    const full = Object.assign({ id: row.id as string, ts: row.ts as number, count: row.count as number }, metaObj);
    return sanitizeLink(full);
  });
}

export async function getLinkByUrl(url: string): Promise<any | null> {
  await initDb();

  const normalizeUrl = (u: any): string => {
    if (!u || typeof u !== 'string') return '';
    try {
      const nu = new URL(u);
      const path = nu.pathname.replace(/\/+$|^$/, '');
      return nu.origin + (path || '/') + nu.search;
    } catch (e) {
      return (u as string).replace(/\/+$/, '');
    }
  };

  const qnorm = normalizeUrl(url);

  const result = await client.execute({
    sql: `SELECT l.id, l.url, l.domain, l.submitted_by, l.ts, l.count, COALESCE(l.meta, li.meta) as meta
          FROM link_index li
          JOIN links l ON l.id = li.link_id
          WHERE li.normalized_url = ?
          LIMIT 1`,
    args: [qnorm]
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const metaObj = row.meta ? JSON.parse(row.meta as string) : {};
  const full = Object.assign({ id: row.id as string, ts: row.ts as number, count: row.count as number }, metaObj);
  return sanitizeLink(full);
}