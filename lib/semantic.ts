import { createHash } from 'crypto';

export const EMBEDDING_DIM = 128;

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
    'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were',
    'will', 'with', 'this', 'these', 'those', 'you', 'your', 'we', 'our', 'they',
    'their', 'if', 'then', 'than', 'into', 'about', 'over', 'after', 'before'
]);

function fnv1a32(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/https?:\/\/[^\s]+/g, ' ')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export function buildSemanticSource(row: {
    title?: string;
    url?: string;
    domain?: string;
    content?: string;
    roomComment?: string;
    tags?: string[];
}) {
    const title = row.title || '';
    const domain = row.domain || '';
    const roomComment = row.roomComment || '';
    const tags = Array.isArray(row.tags) ? row.tags.join(' ') : '';
    const url = row.url || '';
    const content = row.content || '';

    // Weight title/domain/room higher by repeating them in source text.
    return [
        title,
        title,
        domain,
        domain,
        roomComment,
        roomComment,
        tags,
        url,
        content.slice(0, 6000),
    ]
        .filter(Boolean)
        .join('\n');
}

export function embedText(text: string, dim = EMBEDDING_DIM): number[] {
    const vec = new Array<number>(dim).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vec;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const h1 = fnv1a32(t);
        const h2 = fnv1a32(`${t}:${i}`);
        const idx = h1 % dim;
        const sign = (h2 & 1) === 0 ? 1 : -1;
        const weight = 1 / Math.sqrt(1 + t.length);
        vec[idx] += sign * weight;

        if (i < tokens.length - 1) {
            const bg = `${t}_${tokens[i + 1]}`;
            const bh = fnv1a32(bg);
            const bidx = bh % dim;
            vec[bidx] += 0.35;
        }
    }

    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) {
        for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }

    return vec;
}

export function embeddingToJson(vec: number[]): string {
    return `[${vec.map((v) => Number(v.toFixed(6))).join(',')}]`;
}

export function hashSource(text: string): string {
    return createHash('sha1').update(text).digest('hex');
}
