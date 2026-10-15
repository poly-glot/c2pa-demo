import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccess, parseCookies } from '../lib/http/access.mjs';

const request = (headers) => ({ headers });
const cookieOf = (setCookie) => setCookie.split(';')[0];

test('parseCookies reads names and decoded values', () => {
    assert.deepEqual(
        [...parseCookies('a=1; __session=x%3Dy; empty=')],
        [
            ['a', '1'],
            ['__session', 'x=y'],
            ['empty', ''],
        ],
    );
    assert.equal(parseCookies(undefined).size, 0);
});

test('a configured password gates every request until the cookie or header carries it', () => {
    const access = createAccess({ password: 'open-sesame' });

    assert.equal(access.open, false);
    assert.equal(access.login('wrong'), null);
    assert.equal(access.login(undefined), null);
    assert.equal(access.authorised(request({})), false);
    assert.equal(access.authorised(request({ cookie: '__session=forged' })), false);
    assert.equal(access.authorised(request({ 'x-app-password': 'wrong' })), false);
    assert.equal(access.authorised(request({ 'x-app-password': 'open-sesame' })), true);

    const cookie = access.login('open-sesame');
    assert.match(cookie, /^__session=[0-9a-f]{64}; HttpOnly; Path=\/; SameSite=Strict$/);
    assert.equal(access.authorised(request({ cookie: cookieOf(cookie) })), true);
});

test('the cookie is the same on every instance with the same password', () => {
    const first = createAccess({ password: 'shared' });
    const second = createAccess({ password: 'shared' });
    const cookie = cookieOf(first.login('shared'));

    assert.equal(first.login('shared'), second.login('shared'));
    assert.equal(second.authorised(request({ cookie })), true);
    assert.equal(createAccess({ password: 'other' }).authorised(request({ cookie })), false);
});

test('cookies carry the Secure flag over https', () => {
    const access = createAccess({ password: 'x' });

    assert.match(access.login('x', true), /; Secure$/);
    assert.equal(access.logout(false), '__session=; Max-Age=0; HttpOnly; Path=/; SameSite=Strict');
    assert.equal(access.logout(true), '__session=; Max-Age=0; HttpOnly; Path=/; SameSite=Strict; Secure');
});

test('no password leaves the app open', () => {
    const access = createAccess({ password: '' });

    assert.equal(access.open, true);
    assert.equal(access.authorised(request({})), true);
});
