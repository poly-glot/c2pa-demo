import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from './config/index.mjs';
import { ImageAsset } from './lib/image-asset.mjs';
import { GatewayImageEditor, IdentityImageEditor } from './lib/image-editors.mjs';

const run = promisify(execFile);

function parseArguments([input, output, instruction], config) {
    if (!input || !output) throw new Error('usage: npm start -- <input image> <output image> [instruction]');

    return { input, instruction: instruction ?? config.defaultInstruction, output };
}

const config = loadConfig();
const { input, instruction, output } = parseArguments(process.argv.slice(2), config);
const editor = config.selfCheck ? new IdentityImageEditor() : new GatewayImageEditor(config.gateway);

const edited = await editor.edit(await ImageAsset.fromFile(input), instruction);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, edited.buffer);

const { stdout } = await run(config.provenanceBinary, [
    'edit',
    input,
    output,
    '-o',
    output,
    '--ai',
    '--agent',
    editor.agent,
]);
process.stdout.write(stdout);
