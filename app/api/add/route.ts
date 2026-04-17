import { NextRequest, NextResponse } from 'next/server';
import { client, initDb, LinkRecord } from '../../../scripts/db';
import { getPostHogClient } from '../../../lib/posthog-server';
import YAML from 'js-yaml';
import { createHash } from 'crypto';


interface ExistingLinkEntry extends LinkRecord {
}

interface AddRequestBody {
    link: {
        url: string;
        submittedBy?: string;
        submitted_by?: string;
    } | string;
    room?: {
        id?: string;
        comment?: string;
        room_id?: string;
        room_comment?: string;
    };
}

const DEFAULT_VOTE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function getVoteCooldownMs() {
    const raw = Number(process.env.VOTE_COOLDOWN_MS || DEFAULT_VOTE_COOLDOWN_MS);
    if (!Number.isFinite(raw) || raw < 0) return DEFAULT_VOTE_COOLDOWN_MS;
    return raw;
}

function createVoterFingerprint(submittedBy?: string | null, roomId?: string | null) {
    const seed = (submittedBy && submittedBy.trim()) || (roomId && roomId.trim()) || 'anonymous';
    return createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

function pruneRecentVoters(voters: Record<string, number>, now: number, cooldownMs: number) {
    const out: Record<string, number> = {};
    for (const [fingerprint, ts] of Object.entries(voters)) {
        if (typeof ts !== 'number') continue;
        if (now - ts <= cooldownMs) {
            out[fingerprint] = ts;
        }
    }
    return out;
}

export async function POST(request: NextRequest) {
    // Initialize database if needed
    await initDb();

    // Normalize URL for consistent deduping
    const normalizeUrl = (u: string): string => {
        try {
            const nu = new URL(u);
            // strip trailing slashes from pathname
            const path = nu.pathname.replace(/\/+$/, '');
            // keep origin + path + search
            return nu.origin + (path || '/') + nu.search;
        } catch (e) {
            return u.replace(/\/+$/, '');
        }
    };

    // helper to extract tags from frontmatter
    const extractTags = (frontmatter: any): string[] => {
        if (!frontmatter) return [];
        const t = frontmatter.tags || frontmatter.tag || frontmatter.tags_list;
        if (!t) return [];
        if (Array.isArray(t)) return t.map(String).map(s => s.trim().toLowerCase()).filter(Boolean);
        return String(t).split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    };


    // Check auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== process.env.AUTH_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse JSON body and validate shape
    let body: AddRequestBody;
    try {
        body = await request.json();
    } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { link, room } = body as AddRequestBody;
    if (!link) {
        return NextResponse.json({ error: 'Missing link' }, { status: 400 });
    }

    // Determine URL and submitter
    let urlStr: string | null = null;
    if (typeof link === 'string') {
        urlStr = link;
    } else if (link && typeof link.url === 'string') {
        urlStr = link.url;
    }

    if (!urlStr) {
        return NextResponse.json({ error: 'Missing link URL' }, { status: 400 });
    }

    try {
        // validate URL
        // this will throw if invalid
        new URL(urlStr);
    } catch (e) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const submitter = (typeof link === 'object' && link ? (link.submittedBy || (link as any).submitted_by) : null) || null;
    const roomId = room ? (room.id || (room as any).room_id) : undefined;
    const roomComment = room ? (room.comment || (room as any).room_comment) : undefined;

    try {
        // if an old-style LAVA_URL is configured we'll still send to that service
        // for backwards compatibility; otherwise use the new `defuddle.md` public
        // converter which simply returns the page as Markdown with YAML
        // frontmatter when you append the target URL to the path.
        const parseLink = async (linkUrl: string) => {
            // helper that returns the shape expected by the rest of the handler
            // ({url, frontmatter, body})
            if (process.env.LAVA_URL) {
                // old behaviour: forward to lava
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (process.env.AUTH_KEY) {
                    headers['Authorization'] = 'Bearer ' + process.env.AUTH_KEY;
                }
                const apiRes = await fetch(process.env.LAVA_URL + '/api', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        links: [linkUrl],
                        returnFormat: 'json',
                        parser: 'jsdom',
                        saveToDisk: false
                    })
                });

                if (!apiRes.ok) {
                    const txt = await apiRes.text();
                    console.error('lava API returned error', apiRes.status, txt);
                    if (apiRes.status === 400) {
                        throw new Error('upstream-rejected:' + txt);
                    }
                    throw new Error('upstream-error:' + apiRes.status + ':' + txt);
                }
                const arr = await apiRes.json();
                if (!Array.isArray(arr) || arr.length === 0) {
                    throw new Error('invalid-upstream-response');
                }
                return arr[0];
            }

            // new default behaviour: call public defuddle.md converter.
            const target = encodeURIComponent(linkUrl);
            const apiRes = await fetch('https://defuddle.md/' + target);
            if (!apiRes.ok) {
                const txt = await apiRes.text();
                console.error('defuddle.md returned error', apiRes.status, txt);
                throw new Error('upstream-error:' + apiRes.status + ':' + txt);
            }
            const text = await apiRes.text();
            // split YAML frontmatter if present
            let frontmatter: any = {};
            let body = text;
            if (text.startsWith('---')) {
                const parts = text.split('---');
                // parts[0] is empty, [1] is yaml, rest is body
                if (parts.length >= 3) {
                    try {
                        frontmatter = YAML.load(parts[1]) || {};
                    } catch (e) {
                        console.warn('failed to parse yaml frontmatter', e);
                        frontmatter = {};
                    }
                    body = parts.slice(2).join('---').trim();
                }
            }
            return { url: linkUrl, frontmatter, body };
        };

        // fetch / parse the URL using whichever parser is active
        let data;
        try {
            const item = await parseLink(urlStr);
            data = [item];
        } catch (err: any) {
            const message = String(err.message || err);
            if (message.startsWith('upstream-rejected:')) {
                return NextResponse.json({ error: 'Upstream rejected link: ensure you are sending a URL string (not an object)', details: message.replace(/^upstream-rejected:/, '') }, { status: 400 });
            }
            console.error('parser error', message);
            return NextResponse.json({ error: 'Upstream error', details: message }, { status: 502 });
        }

        // Build a map of existing normalized URLs
        const existingMap: Record<string, ExistingLinkEntry> = {};
        const existingLinks = await client.execute({
            sql: 'SELECT id, url, domain, content, submitted_by, ts, count, meta FROM links',
            args: []
        });

        for (const row of existingLinks.rows) {
            if (!row.url) continue;
            const n = normalizeUrl(row.url as string);
            if (!n) continue;
            existingMap[n] = {
                id: row.id as string,
                url: row.url as string,
                domain: row.domain as string,
                content: row.content as string,
                submittedBy: row.submitted_by as string,
                ts: row.ts as number,
                count: row.count as number,
                meta: row.meta ? JSON.parse(row.meta as string) : {}
            };
        }

        for (const item of data) {
            if (!item || typeof item.url !== 'string') {
                console.warn('Skipping upstream item with invalid or missing url', item);
                continue;
            }
            const nurl = normalizeUrl(item.url);
            if (!nurl) {
                console.warn('Skipping upstream item with un-normalizable url', item.url);
                continue;
            }
            const now = Date.now();
            if (existingMap[nurl]) {
                // Increment votes, but ignore rapid repeat votes from the same voter fingerprint.
                const entry = existingMap[nurl];
                const cooldownMs = getVoteCooldownMs();
                const voterFingerprint = createVoterFingerprint(submitter, roomId);

                // Merge existing meta with upstream frontmatter when empty
                let meta = entry.meta || {};
                if (item.frontmatter && Object.keys(meta).length === 0) {
                    meta = item.frontmatter;
                }

                const existingVoteState = (meta.voteState && typeof meta.voteState === 'object') ? meta.voteState : {};
                const recentVoters = pruneRecentVoters(
                    (existingVoteState.recentVoters && typeof existingVoteState.recentVoters === 'object') ? existingVoteState.recentVoters : {},
                    now,
                    cooldownMs
                );
                const isDuplicateVote = typeof recentVoters[voterFingerprint] === 'number' && (now - recentVoters[voterFingerprint]) <= cooldownMs;

                let newCount = Number(entry.count || 1);
                let nextTs = Number(entry.ts || now);
                if (!isDuplicateVote) {
                    newCount += 1;
                    nextTs = now;
                    recentVoters[voterFingerprint] = now;
                }

                // Include submitter and room info in meta
                if (submitter) {
                    meta.submittedBy = submitter;
                } else if (!meta.submittedBy && entry.submittedBy) {
                    meta.submittedBy = entry.submittedBy;
                }
                if (roomId) meta.roomId = roomId;
                if (roomComment) meta.roomComment = roomComment;

                // Record tags in meta (no separate tag table)
                const tags = extractTags(item.frontmatter);
                if (tags.length > 0) {
                    meta.tags = tags;
                }

                meta.voteState = {
                    recentVoters,
                    uniqueRecentVoters: Object.keys(recentVoters).length,
                    lastVoteAt: isDuplicateVote ? existingVoteState.lastVoteAt || entry.ts || now : now,
                    cooldownMs,
                };

                // Update content inline if provided
                let contentToSet = entry.content;
                if (item.body) {
                    contentToSet = item.body;
                }

                await client.execute({
                    sql: 'UPDATE links SET count = ?, ts = ?, meta = ?, content = ?, submitted_by = ? WHERE id = ?',
                    args: [newCount, nextTs, JSON.stringify(meta), contentToSet || null, submitter, entry.id]
                });

                // Track link vote activity with PostHog
                const posthog = getPostHogClient();
                if (isDuplicateVote) {
                    posthog.capture({
                        distinctId: submitter || 'anonymous',
                        event: 'link_vote_ignored',
                        properties: {
                            link_id: entry.id,
                            link_url: item.url,
                            link_domain: new URL(item.url).hostname,
                            vote_count: newCount,
                            submitted_by: submitter,
                            room_id: roomId,
                            cooldown_ms: cooldownMs,
                        }
                    });
                } else {
                    posthog.capture({
                        distinctId: submitter || 'anonymous',
                        event: 'link_upvoted',
                        properties: {
                            link_id: entry.id,
                            link_url: item.url,
                            link_domain: new URL(item.url).hostname,
                            new_vote_count: newCount,
                            submitted_by: submitter,
                            room_id: roomId,
                        }
                    });
                }

                // Ensure meta includes canonical URL
                try {
                    if (!meta.url) meta.url = item.url;
                } catch (e) {
                    // ignore
                }

                // Upsert lightweight index entry for fast lookups
                try {
                    const domain = (function () { try { return new URL(item.url).hostname } catch (e) { return '' } })();
                    await client.execute({
                        sql: 'INSERT OR REPLACE INTO link_index (link_id, normalized_url, domain, meta, ts) VALUES (?, ?, ?, ?, ?)',
                        args: [entry.id, nurl, domain, JSON.stringify(meta), nextTs]
                    });
                } catch (e) {
                    console.warn('Failed to upsert link_index for', entry.id, e);
                }
            } else {
                const id = crypto.randomUUID();
                const meta = item.frontmatter || {};
                const cooldownMs = getVoteCooldownMs();
                const voterFingerprint = createVoterFingerprint(submitter, roomId);

                // Ensure submitter & room info recorded in meta
                if (submitter) {
                    meta.submittedBy = submitter;
                }
                if (roomId) meta.roomId = roomId;
                if (roomComment) meta.roomComment = roomComment;

                // record tags in meta (replacing separate tag table)
                const tags = extractTags(item.frontmatter);
                if (tags.length > 0) {
                    meta.tags = tags;
                }

                meta.voteState = {
                    recentVoters: {
                        [voterFingerprint]: now,
                    },
                    uniqueRecentVoters: 1,
                    lastVoteAt: now,
                    cooldownMs,
                };

                const contentVal = item.body || null;

                await client.execute({
                    sql: 'INSERT INTO links (id, url, domain, content, submitted_by, ts, count, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    args: [id, item.url, new URL(item.url).hostname, contentVal, submitter, now, 1, JSON.stringify(meta)]
                });

                // Track link added event with PostHog
                const posthog = getPostHogClient();
                posthog.capture({
                    distinctId: submitter || 'anonymous',
                    event: 'link_added',
                    properties: {
                        link_id: id,
                        link_url: item.url,
                        link_domain: new URL(item.url).hostname,
                        submitted_by: submitter,
                        room_id: roomId,
                        has_content: !!contentVal,
                        tags: meta.tags || [],
                    }
                });

                // Ensure meta includes canonical URL
                try { if (!meta.url) meta.url = item.url; } catch (e) { }

                // Upsert into link_index for fast metadata lookups (no `url` column)
                try {
                    const domain = (function () { try { return new URL(item.url).hostname } catch (e) { return '' } })();
                    await client.execute({
                        sql: 'INSERT OR REPLACE INTO link_index (link_id, normalized_url, domain, meta, ts) VALUES (?, ?, ?, ?, ?)',
                        args: [id, nurl, domain, JSON.stringify(meta), now]
                    });
                } catch (e) {
                    console.warn('Failed to insert into link_index for', id, e);
                }


            }
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error in add endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}