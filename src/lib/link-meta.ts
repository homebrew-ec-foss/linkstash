/**
 * Typed accessors for link display fields.
 *
 * Link meta (title, url, domain, image, roomComment, ...) arrives flattened onto
 * the Link object from the API, but can also live inside the `meta` blob (e.g.
 * server-rendered pages). These helpers centralize the fallbacks and the
 * `meta` casts so components never need `(link as any)`.
 */

import type { Link } from './types';

function metaString(link: Link, key: string): string {
	const value = link.meta?.[key];
	return typeof value === 'string' ? value : '';
}

export function getLinkUrl(link: Link): string {
	return link.url || metaString(link, 'url');
}

export function getLinkTitle(link: Link): string {
	return link.title || metaString(link, 'title') || getLinkUrl(link) || 'Untitled';
}

export function getLinkDomain(link: Link): string {
	const direct = link.domain || metaString(link, 'domain');
	if (direct) return direct;

	const url = getLinkUrl(link);
	if (!url) return '';
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}

export function getLinkImage(link: Link): string {
	return metaString(link, 'image') || '';
}

export function getRoomComment(link: Link): string {
	return metaString(link, 'roomComment') || '';
}

export function getVoteCount(link: Link): number {
	return Number(link.count || 0);
}
