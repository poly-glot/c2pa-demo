import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sizeLabel } from '../web/features/canvas-markup.mjs';
import { isLargeEnough, rectangle } from '../web/features/stage.mjs';

test('rectangle normalises a drag in any direction', () => {
    assert.deepEqual(rectangle({ x: 30, y: 40 }, { x: 10, y: 5 }), { height: 35, width: 20, x: 10, y: 5 });
});

test('isLargeEnough rejects selections under eight pixels', () => {
    assert.equal(isLargeEnough({ height: 8, width: 8 }), true);
    assert.equal(isLargeEnough({ height: 7, width: 80 }), false);
});

test('sizeLabel names the size and the placed ingredients', () => {
    assert.equal(sizeLabel(null), '');
    assert.equal(sizeLabel({ height: 900, width: 1600 }), '1600 × 900 px');
    assert.equal(sizeLabel({ height: 900, width: 1600 }, [{}, {}]), '1600 × 900 px · 2 placed ingredients');
});
