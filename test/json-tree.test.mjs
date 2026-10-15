import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsonTree } from '../web/features/json-tree.mjs';

const store = {
    active_manifest: 'urn:c2pa:1',
    manifests: { 'urn:c2pa:1': { title: 'Hero.jpg', tags: ['ai', 'studio'] } },
};

test('jsonTree renders keys, typed values and open branches to depth two', () => {
    const html = jsonTree(store);

    assert.match(
        html,
        /<span class="tree__key">active_manifest<\/span>: <span class="tree__value is-string">&quot;urn:c2pa:1&quot;<\/span>/,
    );
    assert.match(
        html,
        /<details class="tree__branch" open>\s*<summary class="tree__row"><span class="tree__key">manifests/,
    );
    assert.match(html, /<details class="tree__branch" >\s*<summary class="tree__row"><span class="tree__key">tags/);
    assert.doesNotMatch(html, /tree__status/);
});

test('jsonTree search keeps only matching paths, highlights hits and counts them', () => {
    const html = jsonTree(store, ' HERO ');

    assert.match(html, /1 hit\b/);
    assert.match(html, /<mark>Hero<\/mark>/);
    assert.doesNotMatch(html, /active_manifest/);
    assert.doesNotMatch(html, /tags/);
    assert.match(
        html,
        /<details class="tree__branch" open>\s*<summary class="tree__row"><span class="tree__key">urn:c2pa:1/,
    );
});

test('jsonTree search matches keys but never array indexes', () => {
    assert.match(jsonTree(store, 'tags'), /1 hit\b/);
    assert.match(jsonTree(store, '0'), /No hits/);
    assert.match(jsonTree(store, 'c2pa'), /2 hits/);
});
