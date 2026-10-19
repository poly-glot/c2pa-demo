import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../config/index.mjs';
import { loadReaderContext } from '../lib/c2pa/context.mjs';
import { AiEdit, ManualEdit } from '../lib/c2pa/manifest.mjs';
import { loadLocalSigner } from '../lib/c2pa/signer.mjs';
import { ActionKind, DigitalSourceType } from '../lib/c2pa/vocabulary.mjs';
import { createWithProvenance } from '../lib/create.mjs';
import { deriveWithProvenance } from '../lib/derive.mjs';
import { ImageAsset } from '../lib/image-asset.mjs';

const config = loadConfig();
const signing = {
    claimGenerator: config.claimGenerator,
    context: await loadReaderContext(config.trust),
    signer: await loadLocalSigner(config.signing),
};
const agent = { name: 'test editor' };
const photo = await ImageAsset.fromFile('samples/Mountain-Lake_Photo_Unsplash_1600x1067.jpg');
const stubEditor = { agent, generate: async (prompt, title) => photo.retitled(title) };

const generate = async (prompt, title) =>
    createWithProvenance(signing, { agent, generated: await stubEditor.generate(prompt, title) });
const { image: aiParent } = await generate('a lake at dawn', 'ai-parent.jpg');

const actionsOf = (provenance) =>
    Object.values(provenance.store.manifests).flatMap((manifest) =>
        manifest.assertions.filter(({ label }) => label.startsWith('c2pa.actions')).flatMap(({ data }) => data.actions),
    );
const thumbnailsOf = (provenance) =>
    Object.values(provenance.store.manifests)
        .flatMap((manifest) => [
            manifest.thumbnail,
            ...(manifest.ingredients ?? []).map((ingredient) => ingredient.thumbnail),
        ])
        .filter(Boolean);

const manualEdit = (kind) => new ManualEdit({ agent, description: `manual ${kind}`, kind });
const derive = (original, edit) =>
    deriveWithProvenance(signing, { edit, edited: original.retitled('edited.jpg'), original });

test('create path writes one c2pa.created with trainedAlgorithmicMedia, no ingredients and no parameters', async () => {
    const { image, provenance } = await generate('a lake at dawn', 'created.jpg');

    assert.equal(image.title, 'created.jpg');
    assert.ok(provenance.isValid);
    assert.deepEqual(provenance.failures, []);
    assert.ok(!provenance.parent);
    assert.deepEqual(provenance.components, []);
    assert.deepEqual(provenance.store.manifests[provenance.manifestId].ingredients ?? [], []);
    assert.equal(provenance.actions.length, 1);
    assert.equal(provenance.actions[0].action, ActionKind.CREATED);
    assert.equal(provenance.actions[0].digitalSourceType, DigitalSourceType.AI_GENERATED);
    assert.equal(provenance.actions[0].description, null);
    assert.equal(provenance.aiDeclaration, 'AI generated');
});

test('AI edit manifest carries no description and no prompt', async () => {
    const { provenance } = await derive(aiParent, new AiEdit({ agent, kind: ActionKind.EDITED }));
    const edit = actionsOf(provenance).find((action) => action.action === ActionKind.EDITED);

    assert.ok(provenance.isValid);
    assert.equal(edit.parameters, undefined);
    assert.equal(provenance.actions.find((action) => action.action === ActionKind.EDITED).description, null);
});

test('AI edit on a non-AI parent is signed', async () => {
    const { provenance } = await derive(photo, new AiEdit({ agent, kind: ActionKind.EDITED }));

    assert.ok(provenance.isValid);
    assert.equal(provenance.declaresAiManipulation, true);
});

test('neither the claim nor any ingredient carries a thumbnail', async () => {
    const { provenance } = await derive(aiParent, manualEdit(ActionKind.CROPPED));

    assert.deepEqual(thumbnailsOf(provenance), []);
});

test('manual edit on a non-AI parent comes back unsigned', async () => {
    const { image, provenance } = await derive(photo, manualEdit(ActionKind.CROPPED));

    assert.equal(provenance, null);
    assert.deepEqual(image.buffer, photo.buffer);
});

test('placing an AI-declared image on a non-AI parent is signed', async () => {
    const { provenance } = await deriveWithProvenance(signing, {
        edit: manualEdit(ActionKind.PLACED),
        edited: photo.retitled('placed.jpg'),
        original: photo,
        placed: { asset: aiParent, slot: 'overlay' },
    });

    assert.ok(provenance.isValid);
    assert.equal(provenance.aiDeclaration, 'AI generated');
});

const hasIngredientLink = (provenance, kind) =>
    Boolean(actionsOf(provenance).find((action) => action.action === kind)?.parameters?.ingredients?.length);

for (const kind of [ActionKind.CONVERTED, ActionKind.TRANSCODED]) {
    test(`manual ${kind} links to the parent ingredient`, async () => {
        const { provenance } = await derive(aiParent, manualEdit(kind));

        assert.ok(hasIngredientLink(provenance, kind));
    });
}

for (const kind of [ActionKind.CROPPED, ActionKind.CONVERTED, ActionKind.TRANSCODED]) {
    test(`manual ${kind} on an AI-declared parent is signed and valid`, async () => {
        const { provenance } = await derive(aiParent, manualEdit(kind));

        assert.ok(provenance.isValid);
        assert.deepEqual(provenance.failures, []);
        assert.equal(provenance.aiDeclaration, 'AI generated');
        assert.ok(provenance.actions.some((action) => action.action === kind));
    });
}
