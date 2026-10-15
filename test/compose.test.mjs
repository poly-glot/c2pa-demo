import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../config/index.mjs';
import { loadReaderContext } from '../lib/c2pa/context.mjs';
import { loadLocalSigner } from '../lib/c2pa/signer.mjs';
import { ManualEdit } from '../lib/c2pa/manifest.mjs';
import { ActionKind, DigitalSourceType } from '../lib/c2pa/vocabulary.mjs';
import { composeWithProvenance } from '../lib/compose.mjs';
import { ImageAsset } from '../lib/image-asset.mjs';

const config = loadConfig();
const services = {
    agent: { name: 'test renderer' },
    claimGenerator: config.claimGenerator,
    context: await loadReaderContext(config.trust),
    signer: await loadLocalSigner(config.signing),
};
const ai = await ImageAsset.fromFile('samples/NOVA-SPK-500ML_Hero_Studio_2400x2400_AI-Generated_DAT-Create.jpg');
const photo = await ImageAsset.fromFile('samples/Mountain-Lake_Photo_Unsplash_1600x1067.jpg');
const rendered = photo.retitled('two-up.jpg');

const compose = (left, right) =>
    composeWithProvenance(services, {
        components: [
            { asset: left, slot: 'left' },
            { asset: right, slot: 'right' },
        ],
        rendered,
    });

const createdSourceType = (provenance) =>
    provenance.actions.find((action) => action.action === 'c2pa.created').digitalSourceType;

for (const [name, left, right, expected, aiCount] of [
    ['AI left, photo right', ai, photo, DigitalSourceType.AI_MANIPULATED, 2],
    ['photo left, AI right', photo, ai, DigitalSourceType.AI_MANIPULATED, 2],
    ['AI both', ai, ai, DigitalSourceType.AI_MANIPULATED, 2],
    ['photo both', photo, photo, DigitalSourceType.COMPOSITE, 0],
]) {
    test(`composite of ${name}`, async () => {
        const { provenance } = await compose(left, right);

        assert.ok(provenance.isValid);
        assert.deepEqual(provenance.failures, []);
        assert.equal(createdSourceType(provenance), expected);
        assert.equal(provenance.aiActions.length, aiCount);
        assert.deepEqual(
            provenance.components.map((component) => component.carriesManifest),
            [left === ai, right === ai],
        );
        assert.equal(provenance.actions.filter((action) => action.action === 'c2pa.placed').length, 2);
    });
}

test('composite records per-slot edits after their placement and the template text', async () => {
    const crop = new ManualEdit({
        agent: services.agent,
        description: 'Cropped to the slot',
        kind: ActionKind.CROPPED,
    });
    const { provenance } = await composeWithProvenance(services, {
        components: [
            { asset: photo, edits: [crop], slot: 'left' },
            { asset: photo, slot: 'right' },
        ],
        rendered,
        text: { headline: 'Fresh' },
    });

    assert.ok(provenance.isValid);
    assert.deepEqual(provenance.failures, []);
    assert.deepEqual(
        provenance.actions.map((action) => action.action),
        [ActionKind.CREATED, ActionKind.PLACED, ActionKind.CROPPED, ActionKind.PLACED],
    );
    assert.equal(provenance.actions[0].description, 'headline: Fresh');
    assert.deepEqual(
        provenance.components.map((component) => component.slot),
        ['left', 'right'],
    );
});
