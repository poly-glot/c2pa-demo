import assert from 'node:assert/strict';
import { test } from 'node:test';
import { credentialStatus, describe, markerOf, newestFirst } from '../web/features/timeline.mjs';

const view = (action, extra = {}) => ({
    action,
    agent: 'demo',
    description: null,
    digitalSourceType: null,
    kind: 'not AI',
    manifestId: 'urn:new',
    ...extra,
});

const AI_EDIT = view('c2pa.edited', { description: 'Make the sky overcast', kind: 'AI manipulated' });

test('describe names the action in plain words', () => {
    assert.equal(describe(AI_EDIT), 'Edited with AI');
    assert.equal(describe(view('c2pa.opened')), 'Opened previous version');
    assert.equal(describe(view('c2pa.created')), 'Created in demo');
    assert.equal(
        describe(view('c2pa.cropped', { description: 'Cropped to 800×600 at 10,20' })),
        'Cropped to 800×600 at 10,20',
    );
    assert.equal(describe(view('c2pa.color_adjustments')), 'Color adjustments');
    assert.equal(describe(view('c2pa.upscaled', { kind: 'AI manipulated' })), 'Upscaled with AI');
});

test('newestFirst keeps manifest order and reverses actions within each manifest', () => {
    const opened = view('c2pa.opened');
    const created = view('c2pa.created', { manifestId: 'urn:old' });
    const placed = view('c2pa.placed', { manifestId: 'urn:old' });

    assert.deepEqual(newestFirst([opened, AI_EDIT, created, placed]), [AI_EDIT, opened, placed, created]);
});

test('markerOf separates AI, this manifest and earlier manifests', () => {
    assert.equal(markerOf(AI_EDIT, 'urn:new'), 'ai');
    assert.equal(markerOf(view('c2pa.opened'), 'urn:new'), 'current');
    assert.equal(markerOf(view('c2pa.opened'), 'urn:other'), 'earlier');
});

test('credentialStatus labels by the AI declaration the reader reports', () => {
    assert.deepEqual(credentialStatus(null), { label: 'No credentials', tone: 'none' });
    assert.deepEqual(credentialStatus({ aiDeclaration: 'AI edited', signerTrust: 'user', timeline: [] }), {
        label: 'AI edited',
        tone: 'ai',
    });
    assert.deepEqual(credentialStatus({ aiDeclaration: 'AI generated', signerTrust: 'c2pa', timeline: [AI_EDIT] }), {
        label: 'AI generated',
        tone: 'ai',
    });
    assert.deepEqual(credentialStatus({ aiDeclaration: null, signerTrust: 'c2pa', timeline: [] }), {
        label: 'Camera signed',
        tone: 'ok',
    });
    assert.deepEqual(credentialStatus({ aiDeclaration: null, signerTrust: 'user', timeline: [] }), {
        label: 'Signed',
        tone: 'ok',
    });
});
