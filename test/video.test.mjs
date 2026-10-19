import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { loadConfig } from '../config/index.mjs';
import { loadReaderContext } from '../lib/c2pa/context.mjs';
import { ManualEdit } from '../lib/c2pa/manifest.mjs';
import { Provenance } from '../lib/c2pa/provenance.mjs';
import { loadLocalSigner } from '../lib/c2pa/signer.mjs';
import { ActionKind } from '../lib/c2pa/vocabulary.mjs';
import { createWithProvenance } from '../lib/create.mjs';
import { deriveWithProvenance } from '../lib/derive.mjs';
import { describeVideoEdit, reencode } from '../lib/video.mjs';
import { generateClip } from '../scripts/reference-clip.mjs';

const hasFfmpeg = (() => {
    try {
        execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

const config = loadConfig();
const signing = {
    claimGenerator: config.claimGenerator,
    context: await loadReaderContext(config.trust),
    signer: await loadLocalSigner(config.signing),
};
const agent = { name: 'ffmpeg' };

const assertionLabels = (provenance) =>
    Object.values(provenance.store.manifests).flatMap((manifest) => manifest.assertions.map(({ label }) => label));

const transcode = async (original, kind = ActionKind.TRANSCODED, width) => {
    const edited = (await reencode(original, { kind, width })).retitled('edited.mp4');
    const edit = new ManualEdit({ agent, description: describeVideoEdit({ kind, width }), kind });
    return deriveWithProvenance(signing, { edit, edited, original });
};

test('an AI video is read, transcoded and re-signed with its parent manifest', { skip: !hasFfmpeg }, async () => {
    const { image: aiClip } = await createWithProvenance(signing, { agent, generated: await generateClip() });
    const { provenance } = await transcode(aiClip);

    assert.ok(provenance.isValid);
    assert.deepEqual(provenance.failures, []);
    assert.equal(provenance.aiDeclaration, 'AI generated');
    assert.ok(provenance.actions.some((action) => action.action === ActionKind.TRANSCODED));
    assert.ok(provenance.parent.carriesManifest);
    assert.ok(assertionLabels(provenance).includes('c2pa.hash.bmff.v3'));
    assert.ok(!Object.values(provenance.store.manifests).some((manifest) => manifest.thumbnail));
});

test('a resized video keeps an even width', { skip: !hasFfmpeg }, async () => {
    const resized = await reencode(await generateClip(), { kind: ActionKind.RESIZED, width: 321 });
    const size = execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', '-'],
        {
            input: resized.buffer,
        },
    )
        .toString()
        .trim();

    assert.equal(size, '320,180');
});

test('a non-AI video comes back unsigned', { skip: !hasFfmpeg }, async () => {
    const { image, provenance } = await transcode(await generateClip());

    assert.equal(provenance, null);
    assert.equal(await Provenance.of(image, signing.context), null);
});
