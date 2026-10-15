import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { loadConfig } from './config/index.mjs';
import { AiEdit } from './lib/c2pa/manifest.mjs';
import { loadReaderContext } from './lib/c2pa/context.mjs';
import { loadLocalSigner } from './lib/c2pa/signer.mjs';
import { deriveWithProvenance } from './lib/derive.mjs';
import { ImageAsset } from './lib/image-asset.mjs';
import { GatewayImageEditor, IdentityImageEditor } from './lib/image-editors.mjs';

function parseArguments([input, output, instruction], config) {
    if (!input || !output) throw new Error('usage: npm start -- <input image> <output image> [instruction]');

    return { input, instruction: instruction ?? config.defaultInstruction, output };
}

async function recolourWithProvenance({ editor, ...signing }, { input, instruction, output }) {
    const original = await ImageAsset.fromFile(input);
    const edited = (await editor.edit(original, instruction)).retitled(basename(output));
    const edit = new AiEdit({ agent: editor.agent, instruction });

    const { image, provenance } = await deriveWithProvenance(signing, { edit, edited, original });
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, image.buffer);
    return provenance;
}

function verify(provenance) {
    assert.ok(provenance, 'the output carries no manifest');
    assert.ok(provenance.isValid, 'the manifest did not validate');
    assert.ok(provenance.declaresAiManipulation, 'the manifest does not declare the AI manipulation');
    assert.ok(provenance.parent?.carriesManifest, 'the parent manifest was not carried forward');
}

const config = loadConfig();
const job = parseArguments(process.argv.slice(2), config);
const services = {
    claimGenerator: config.claimGenerator,
    context: await loadReaderContext(config.trust),
    editor: config.selfCheck ? new IdentityImageEditor() : new GatewayImageEditor(config.gateway),
    signer: await loadLocalSigner(config.signing),
};

const provenance = await recolourWithProvenance(services, job);
verify(provenance);
console.log(`${job.output}: ${provenance.describe()}`);
