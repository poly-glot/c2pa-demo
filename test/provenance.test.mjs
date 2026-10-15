import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../config/index.mjs';
import { loadReaderContext } from '../lib/c2pa/context.mjs';
import { AiEdit, ManualEdit } from '../lib/c2pa/manifest.mjs';
import { Provenance } from '../lib/c2pa/provenance.mjs';
import { loadLocalSigner } from '../lib/c2pa/signer.mjs';
import { ActionKind, AI_ACTIONS, MANUAL_ACTIONS } from '../lib/c2pa/vocabulary.mjs';
import { deriveWithProvenance } from '../lib/derive.mjs';
import { ImageAsset } from '../lib/image-asset.mjs';

const config = loadConfig();
const signing = {
    claimGenerator: config.claimGenerator,
    context: await loadReaderContext(config.trust),
    signer: await loadLocalSigner(config.signing),
};
const agent = { name: 'test editor' };
const region = { height: 40, width: 30, x: 10, y: 20 };
const original = await ImageAsset.fromFile('samples/NOVA-SPK-500ML_Hero_Studio_2400x2400_AI-Generated_DAT-Create.jpg');
const photo = await ImageAsset.fromFile('samples/Mountain-Lake_Photo_Unsplash_1600x1067.jpg');
const edited = original.retitled('edited.jpg');

const sign = (edit, placed) => deriveWithProvenance(signing, { edit, edited, original, placed });
const actionOf = (provenance, kind) => provenance.actions.find((action) => action.action === kind);

const UNPLACED_MANUAL_ACTIONS = [...MANUAL_ACTIONS].filter((kind) => kind !== ActionKind.PLACED);

for (const kind of UNPLACED_MANUAL_ACTIONS) {
    test(`manual ${kind} is signed with its region on top of the parent chain`, async () => {
        const { provenance } = await sign(new ManualEdit({ agent, description: kind, kind, region }));

        assert.ok(provenance.isValid);
        assert.deepEqual(provenance.failures, []);
        assert.deepEqual(actionOf(provenance, kind), {
            action: kind,
            agent: agent.name,
            description: kind,
            digitalSourceType: null,
            kind: 'not AI',
            manifestId: provenance.manifestId,
            region,
            title: edited.title,
            when: null,
        });
        assert.ok(actionOf(provenance, ActionKind.OPENED));
        assert.equal(provenance.declaresAiManipulation, false);

        const manifestIds = [...new Set(provenance.timeline.map((view) => view.manifestId))];
        assert.deepEqual(manifestIds, [provenance.manifestId, provenance.parentManifestId]);
        assert.equal(provenance.timeline.at(-1).kind, 'AI generated');
    });
}

for (const [kind, label] of [
    [ActionKind.EDITED, 'AI manipulated'],
    [ActionKind.INPAINTING, 'AI manipulated'],
    [ActionKind.OUTPAINTING, 'AI manipulated'],
    [ActionKind.UPSCALED, 'AI enhanced'],
]) {
    test(`AI ${kind} is labelled ${label}`, async () => {
        const { provenance } = await sign(new AiEdit({ agent, instruction: 'make it orange', kind, region }));

        assert.ok(provenance.isValid);
        assert.equal(actionOf(provenance, kind).kind, label);
        assert.equal(actionOf(provenance, kind).digitalSourceType, AI_ACTIONS.get(kind));
        assert.deepEqual(actionOf(provenance, kind).region, region);
        assert.ok(provenance.declaresAiManipulation);
        assert.equal(provenance.aiActions.length, 2);
    });
}

test('a placed edit carries its component ingredient', async () => {
    const edit = new ManualEdit({ agent, description: 'logo', kind: ActionKind.PLACED, region });
    const { provenance } = await sign(edit, { asset: photo, slot: 'logo' });

    assert.ok(provenance.isValid);
    assert.deepEqual(provenance.failures, []);
    assert.deepEqual(provenance.components, [{ carriesManifest: false, slot: 'logo', title: photo.title }]);
    assert.deepEqual(actionOf(provenance, ActionKind.PLACED).region, region);
});

test('a placed edit without the placed image is rejected', async () => {
    const edit = new ManualEdit({ agent, description: 'logo', kind: ActionKind.PLACED });

    await assert.rejects(sign(edit), RangeError);
});

test('unknown kinds and malformed regions are rejected', () => {
    assert.throws(() => new ManualEdit({ agent, description: '', kind: 'c2pa.bogus' }), RangeError);
    assert.throws(() => new AiEdit({ agent, instruction: '', kind: ActionKind.CROPPED }), RangeError);
    for (const malformed of [{ x: 1 }, { ...region, width: 0 }, { ...region, x: -1 }]) {
        assert.throws(
            () => new ManualEdit({ agent, description: '', kind: ActionKind.CROPPED, region: malformed }),
            RangeError,
        );
    }
});

test('data URIs that are not base64 JPEG, PNG or WebP are rejected', () => {
    assert.equal(ImageAsset.fromDataUri(photo.toDataUri(), 'lake.jpg').buffer.equals(photo.buffer), true);
    for (const uri of [undefined, 'data:,', 'data:text/html;base64,PGI+', 'data:image/png,raw']) {
        assert.throws(() => ImageAsset.fromDataUri(uri), RangeError, String(uri));
    }
});

test('Provenance.of embeds the claim thumbnail of every manifest as a data URI', async () => {
    const provenance = await Provenance.of(original, signing.context);
    const { identifier } = provenance.store.manifests[provenance.manifestId].thumbnail;

    assert.match(provenance.thumbnails[identifier], /^data:image\/jpeg;base64,/);
    assert.equal(provenance.toJSON().thumbnails, provenance.thumbnails);
});
