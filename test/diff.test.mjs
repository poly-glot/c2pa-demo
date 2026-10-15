import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineDiff } from '../web/diff.mjs';

test('lineDiff keeps common lines and marks the rest', () => {
    const lines = lineDiff('a\nb\nc', 'a\nc\nd');

    assert.deepEqual(lines, [
        { text: 'a', type: 'same' },
        { text: 'b', type: 'remove' },
        { text: 'c', type: 'same' },
        { text: 'd', type: 'add' },
    ]);
});

test('lineDiff against an empty document removes its one blank line and adds the rest', () => {
    assert.deepEqual(lineDiff('', 'x\ny'), [
        { text: '', type: 'remove' },
        { text: 'x', type: 'add' },
        { text: 'y', type: 'add' },
    ]);
});
