import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActionKind, AI_ACTIONS, MANUAL_ACTIONS } from '../lib/c2pa/vocabulary.mjs';
import { ACTION } from '../web/actions.mjs';
import { boundsOf } from '../web/edits/canvas-ops.mjs';
import { TOOLS } from '../web/edits/registry.mjs';

const SELECTION = { height: 40, width: 30, x: 10, y: 20 };
const PARAMS = {
    layer: { title: 'Logo' },
    margin: 64,
    prompt: 'Add a boat.',
    quality: 70,
    selection: SELECTION,
    sliders: { brightness: 120, contrast: 100, saturation: 80 },
    strokes: [
        [
            { x: 5.4, y: 8 },
            { x: 20, y: 30.2 },
        ],
        [{ x: 12, y: 2 }],
    ],
    width: 640,
};
const manualTools = TOOLS.filter(({ mode }) => mode !== 'ai');
const aiTools = TOOLS.filter(({ mode }) => mode === 'ai');
const byId = Object.fromEntries(TOOLS.map((tool) => [tool.id, tool]));

test('every tool has identity fields and unique ids', () => {
    for (const tool of TOOLS) {
        for (const field of ['id', 'label', 'group', 'mode']) assert.ok(tool[field], `${tool.id} lacks ${field}`);
        assert.ok(Array.isArray(tool.needs));
    }
    assert.equal(new Set(TOOLS.map(({ id }) => id)).size, TOOLS.length);
});

test('functions match the mode', () => {
    for (const tool of manualTools) {
        assert.equal(typeof tool.apply, 'function', tool.id);
        assert.equal(typeof tool.edit, 'function', tool.id);
        assert.equal(tool.request, undefined);
    }
    for (const tool of aiTools) {
        assert.equal(typeof tool.request, 'function', tool.id);
        assert.equal(tool.apply, undefined);
        assert.equal(tool.edit, undefined);
    }
});

test('the browser action vocabulary mirrors the signer vocabulary', () => {
    assert.deepEqual(new Set(Object.values(ACTION)), new Set(Object.values(ActionKind)));
});

test('manual edits return a kind the signer accepts and a region when they need one', () => {
    for (const tool of manualTools) {
        const edit = tool.edit(PARAMS);
        assert.ok(MANUAL_ACTIONS.has(edit.kind), tool.id);
        assert.ok(edit.description, tool.id);
        if (tool.needs.includes('selection') || tool.needs.includes('strokes')) assert.ok(edit.region, tool.id);
    }
});

test('colour description lists only changed percentages', () => {
    assert.equal(byId.colour.edit(PARAMS).description, 'Adjusted Brightness 120%, Saturation 80%');
});

test('export, reencode and place extensions', () => {
    assert.equal(byId.exportPng.edit(PARAMS).format, 'image/png');
    assert.equal(byId.exportWebp.edit(PARAMS).format, 'image/webp');
    assert.equal(byId.reencode.edit(PARAMS).quality, 70);
    assert.deepEqual(byId.placeImage.edit(PARAMS).placed, { slot: 'overlay' });
    assert.equal(byId.placeImage.edit(PARAMS).description, 'Placed Logo at 10,20 30×40');
    assert.equal(byId.publish.mode, 'publish');
});

test('boundsOf covers all strokes on whole pixels', () => {
    assert.deepEqual(boundsOf(PARAMS.strokes), { height: 29, width: 15, x: 5, y: 2 });
    assert.equal(boundsOf([]), null);
    assert.deepEqual(boundsOf([[{ x: 4.2, y: 7.9 }]]), { height: 1, width: 1, x: 4, y: 7 });
});

test('AI requests carry a kind the signer accepts and scope their instruction', () => {
    for (const tool of aiTools) assert.ok(AI_ACTIONS.has(tool.request(PARAMS).kind), tool.id);

    const inpaint = byId.inpaint.request(PARAMS);
    assert.match(inpaint.instruction, /^Add a boat\. Change only the region 10,20,30,40 px/);
    assert.match(inpaint.instruction, /leave everything outside it exactly as it is\.$/);
    assert.deepEqual(inpaint.region, SELECTION);

    assert.match(byId.outpaint.request(PARAMS).instruction, /^Extend the image outward by 64 px on every side/);
    assert.equal(typeof byId.outpaint.prepare, 'function');
    assert.match(byId.upscale.request(PARAMS).instruction, /twice its width and height/);
    assert.equal(byId.aiEdit.request(PARAMS).instruction, 'Add a boat.');
});
