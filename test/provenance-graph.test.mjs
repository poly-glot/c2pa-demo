import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countIngredients, nodeAt, provenanceGraph } from '../web/features/provenance-graph.mjs';

const signer = { common_name: 'Test Signer', issuer: 'Demo' };
const thumb = (id) => ({
    format: 'image/jpeg',
    identifier: `self#jumbf=/c2pa/${id}/c2pa.assertions/c2pa.thumbnail.claim`,
});
const store = {
    active_manifest: 'urn:composite',
    manifests: {
        'urn:composite': {
            ingredients: [
                { active_manifest: 'urn:edited', relationship: 'componentOf', title: 'edited.jpg' },
                {
                    format: 'image/png',
                    relationship: 'componentOf',
                    thumbnail: thumb('ingredient'),
                    title: 'plain.png',
                },
            ],
            signature_info: signer,
            thumbnail: thumb('urn:composite'),
            title: 'composite.jpg',
        },
        'urn:edited': {
            ingredients: [{ active_manifest: 'urn:composite', relationship: 'parentOf', title: 'loop.jpg' }],
            signature_info: signer,
            thumbnail: thumb('urn:edited'),
            title: 'edited.jpg',
        },
    },
};

test('provenanceGraph roots at the active manifest and labels ingredients by relationship', () => {
    const graph = provenanceGraph(store);

    assert.equal(graph.kind, 'This file');
    assert.equal(graph.title, 'composite.jpg');
    assert.equal(graph.signer, 'Test Signer');
    assert.equal(graph.thumbnail, thumb('urn:composite').identifier);
    assert.deepEqual(
        graph.children.map(({ kind, signer: nodeSigner, thumbnail, title }) => ({
            kind,
            signer: nodeSigner,
            thumbnail,
            title,
        })),
        [
            {
                kind: 'Placed ingredient',
                signer: 'Test Signer',
                thumbnail: thumb('urn:edited').identifier,
                title: 'edited.jpg',
            },
            { kind: 'Placed ingredient', signer: null, thumbnail: thumb('ingredient').identifier, title: 'plain.png' },
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
