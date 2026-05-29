import { NextRequest, NextResponse } from 'next/server';
import { client } from '../../../scripts/db';
import { sortLinksByMode, normalizeRankMode } from '../../../lib/sorting';
import { logger } from '../../../lib/logger';
import type { Link, RankMode } from '../../../lib/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/links
 * Fetch links with optional sorting mode and pagination
 * Optimized for performance by applying pagination in database when possible
 *
 * Query Parameters:
 *   - url: optional URL to fetch a specific link
 *   - mode: ranking mode ('latest', 'top', 'rising') - defaults to 'latest'
 *   - offset: pagination offset (default: 0)
 *   - limit: items per page (default: 50, max: 200)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const queryUrl = request.nextUrl.searchParams.get('url');
    const mode: RankMode = normalizeRankMode(request.nextUrl.searchParams.get('mode'));
    const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get('offset') || '0', 10));
    let limit = parseInt(request.nextUrl.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    limit = Math.min(limit, MAX_LIMIT);

    // Fetch specific link by URL
    if (queryUrl) {
      const result = await client.execute({
        sql: `SELECT l.id, l.url, li.domain, l.submitted_by, li.ts, l.count, COALESCE(l.meta, li.meta) as meta
              FROM link_index li
              LEFT JOIN links l ON l.id = li.link_id
              WHERE l.url = ? LIMIT 1`,
        args: [queryUrl],
      });

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Link not found' },
          { status: 404 }
        );
      }

      const row = result.rows[0];
      const link: Link = {
        id: row.id as string,
        url: row.url as string,
        domain: row.domain as string,
        ts: row.ts as number,
        count: row.count as number,
        meta: row.meta ? JSON.parse(row.meta as string) : {},
        submittedBy: row.submitted_by as string,
      };

      return NextResponse.json(link);
    }

    // Optimize query based on sort mode
    let orderClause = 'ORDER BY li.ts DESC';
    if (mode === 'top') {
      orderClause = 'ORDER BY l.count DESC, li.ts DESC';
    }

    // For rising mode, fetch all and sort in-memory (needs full dataset for scoring)
    if (mode === 'rising') {
      const fullResult = await client.execute({
        sql: `SELECT l.id, l.url, li.domain, l.submitted_by, li.ts, l.count, COALESCE(l.meta, li.meta) as meta
              FROM link_index li
              LEFT JOIN links l ON l.id = li.link_id`,
        args: [],
      });

      const links: Link[] = fullResult.rows.map((row) => ({
        id: row.id as string,
        url: row.url as string,
        domain: row.domain as string,
        ts: row.ts as number,
        count: row.count as number,
        meta: row.meta ? JSON.parse(row.meta as string) : {},
        submittedBy: row.submitted_by as string,
      }));

      const sorted = sortLinksByMode(links, mode);
      const total = sorted.length;
      const paged = sorted.slice(offset, offset + limit);

      const withIndex = paged.map((link, idx) => ({
        ...link,
        displayIndex: offset + idx + 1,
      }));

      return NextResponse.json({
        items: withIndex,
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      });
    }

    // For latest/top modes, use database pagination for efficiency
    const result = await client.execute({
      sql: `SELECT l.id, l.url, li.domain, l.submitted_by, li.ts, l.count, COALESCE(l.meta, li.meta) as meta
            FROM link_index li
            LEFT JOIN links l ON l.id = li.link_id
            ${orderClause}
            LIMIT ? OFFSET ?`,
      args: [limit, offset],
    });

    // Get total count for pagination metadata
    const countResult = await client.execute({
      sql: `SELECT COUNT(*) as count FROM link_index`,
      args: [],
    });
    const total = (countResult.rows[0]?.count as number) || 0;

    // Convert rows to Link objects
    const links: Link[] = result.rows.map((row) => ({
      id: row.id as string,
      url: row.url as string,
      domain: row.domain as string,
      ts: row.ts as number,
      count: row.count as number,
      meta: row.meta ? JSON.parse(row.meta as string) : {},
      submittedBy: row.submitted_by as string,
    }));

    // Add display index
    const withIndex = links.map((link, idx) => ({
      ...link,
      displayIndex: offset + idx + 1,
    }));

    return NextResponse.json({
      items: withIndex,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    logger.error('Error fetching links', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
