import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = '__session';
const PASSWORD_HEADER = 'x-app-password';
const COOKIE_FLAGS = 'HttpOnly; Path=/; SameSite=Strict';

const digest = (key, value) => createHmac('sha256', key).update(value).digest();
const same = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const flagsFor = (secure) => (secure ? `${COOKIE_FLAGS}; Secure` : COOKIE_FLAGS);

export const parseCookies = (header = '') =>
    new Map(
        header
            .split(';')
            .map((pair) => pair.trim().split('='))
            .filter(([name]) => name)
            .map(([name, ...rest]) => [name, decodeURIComponent(rest.join('='))]),
    );

export function createAccess({ password }) {
    const open = password === '';
    const expected = digest(password, password);
    const token = digest(password, COOKIE).toString('hex');
    const matches = (candidate) => typeof candidate === 'string' && same(digest(password, candidate), expected);

    return {
        authorised(request) {
            if (open) return true;

            const presented = parseCookies(request.headers.cookie).get(COOKIE) ?? '';
            return same(Buffer.from(presented), Buffer.from(token)) || matches(request.headers[PASSWORD_HEADER]);
        },
        login(candidate, secure) {
            return matches(candidate) ? `${COOKIE}=${token}; ${flagsFor(secure)}` : null;
        },
        logout: (secure) => `${COOKIE}=; Max-Age=0; ${flagsFor(secure)}`,
        open,
    };
}
