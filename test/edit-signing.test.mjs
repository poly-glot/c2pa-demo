import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingInput, nextTitle } from '../web/features/edit-signing.mjs';

test('missingInput names the first empty input the tool needs', () => {
    const tool = { needs: ['prompt', 'selection'] };

    assert.equal(missingInput(tool, { prompt: '', selection: null }), 'Describe the change first.');
    assert.equal(missingInput(tool, { prompt: 'sky', selection: null }), 'Drag a rectangle over the image first.');
    assert.equal(missingInput(tool, { prompt: 'sky', selection: { height: 1, width: 1, x: 0, y: 0 } }), undefined);
    assert.equal(missingInput({ needs: ['strokes'] }, { strokes: [] }), 'Turn on Brush and draw on the image first.');
});

test('nextTitle numbers the next version from the source stem', () => {
    assert.equal(nextTitle({ layers: [{}, {}], title: 'lake.jpg' }), 'lake_v3');
});
