import { env } from '$env/dynamic/private';

/**
 * Constant-time-ish compare to avoid leaking the key via timing.
 */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Verify the `Authorization: Bearer <AUTH_KEY>` header.
 * Fails closed when AUTH_KEY is unset (empty key matches nothing).
 */
export function isAuthorized(authorization: string | null): boolean {
	const key = env.AUTH_KEY;
	if (!key) return false;
	const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
	if (!token) return false;
	return safeEqual(token, key);
}
