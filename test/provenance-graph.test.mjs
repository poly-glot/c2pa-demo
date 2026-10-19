import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countIngredients, nodeAt, provenanceGraph } from '../web/features/provenance-graph.mjs';

const signer = { common_name: 'Test Signer', issuer: 'Demo' };
const store = {
    active_manifest: 'urn:composite',
    manifests: {
        'urn:composite': {
            ingredients: [
                { active_manifest: 'urn:edited', relationship: 'componentOf', title: 'edited.jpg' },
                { format: 'image/png', relationship: 'componentOf', title: 'plain.png' },
            ],
            signature_info: signer,
            title: 'composite.jpg',
        },
        'urn:edited': {
            ingredients: [{ active_manifest: 'urn:composite', relationship: 'parentOf', title: 'loop.jpg' }],
            signature_info: signer,
            title: 'edited.jpg',
        },
    },
};

test('provenanceGraph roots at the active manifest and labels ingredients by relationship', () => {
    const graph = provenanceGraph(store);

    assert.equal(graph.kind, 'This file');
    assert.equal(graph.title, 'composite.jpg');
    assert.equal(graph.signer, 'Test Signer');
    assert.deepEqual(
        graph.children.map(({ kind, signer: nodeSigner, title }) => ({ kind, signer: nodeSigner, title })),
        [
            { kind: 'Placed ingredient', signer: 'Test Signer', title: 'edited.jpg' },
            { kind: 'Placed ingredient', signer: null, title: 'plain.png' },
        ],
    );
});

test('provenanceGraph stops at a manifest already on the path instead of looping', () => {
    const loop = nodeAt(provenanceGraph(store), '0.0.0');

    assert.equal(loop.kind, 'Edited from');
    assert.equal(loop.signer, null);
    assert.deepEqual(loop.children, []);
    assert.equal(countIngredients(provenanceGraph(store)), 3);
});

test('nodeAt walks an index path from the root', () => {
    const graph = provenanceGraph(store);

    assert.equal(nodeAt(graph, '0'), graph);
    assert.equal(nodeAt(graph, '0.1').format, 'image/png');
});
