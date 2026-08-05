/**
 * Markdown → sanitized HTML rendering for the reader.
 * Uses `marked` (GFM) for parsing and `sanitize-html` for sanitization,
 * so it is safe to run on both server and client.
 */
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export function getYouTubeId(url: string | undefined): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		if (u.hostname === 'youtu.be') {
			return u.pathname.slice(1);
		}
		if (
			u.hostname === 'www.youtube.com' ||
			u.hostname === 'youtube.com' ||
			u.hostname.endsWith('.youtube.com')
		) {
			const v = u.searchParams.get('v');
			if (v) return v;
			const parts = u.pathname.split('/').filter(Boolean);
			if (parts[0] === 'shorts' && parts[1]) return parts[1];
		}
		return null;
	} catch (e) {
		return null;
	}
}

function escapeAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Handles both the modern token-object signature and legacy positional args.
function imageRenderer(...args: any[]): string {
	const first = args[0];
	const href = typeof first === 'object' && first ? (first.href as string) : (first as string);
	const title = typeof first === 'object' && first ? (first.title as string) : (args[1] as string);
	const text = typeof first === 'object' && first ? (first.text as string) : (args[2] as string);

	const id = getYouTubeId(href);
	if (id) {
		return `<div class="embed-youtube"><iframe src="https://www.youtube.com/embed/${escapeAttr(
			id
		)}" title="${escapeAttr(title || text || 'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen frameborder="0"></iframe></div>`;
	}

	const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
	return `<img class="markdown-img" src="${escapeAttr(href || '')}" alt="${escapeAttr(
		text || ''
	)}"${titleAttr}>`;
}

marked.use({
	gfm: true,
	renderer: {
		image: imageRenderer
	}
});

export function renderMarkdown(md: string): string {
	const html = marked.parse(md) as string;
	return sanitizeHtml(html, {
		allowedTags: [
			...sanitizeHtml.defaults.allowedTags,
			'img',
			'iframe',
			'span'
		],
		allowedAttributes: {
			...sanitizeHtml.defaults.allowedAttributes,
			img: ['src', 'alt', 'title', 'class'],
			iframe: ['src', 'title', 'allow', 'allowfullscreen', 'frameborder', 'width', 'height'],
			span: ['class']
		},
		allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com'],
		// allow relative hrefs/images to be proxied by the client reader
		transformTags: {}
	});
}
