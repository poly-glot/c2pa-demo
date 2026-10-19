import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadConfig } from '../config/index.mjs';
import { loadReaderContext } from '../lib/c2pa/context.mjs';
import { loadLocalSigner } from '../lib/c2pa/signer.mjs';
import { createWithProvenance } from '../lib/create.mjs';
import { ImageAsset } from '../lib/image-asset.mjs';

const OUTPUT = new URL('../samples/Reference-Clip_AI-Generated_DAT-Create.mp4', import.meta.url);
const SOURCE = 'testsrc2=size=640x360:rate=24:duration=3';
const AGENT = { name: 'Reference video model' };

export async function generateClip() {
    const directory = await mkdtemp(join(tmpdir(), 'clip-'));
    const path = join(directory, 'clip.mp4');

    try {
        await promisify(execFile)('ffmpeg', [
            ...['-v', 'error', '-f', 'lavfi', '-i', SOURCE],
            ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '32', path],
        ]);
        return new ImageAsset({
            buffer: await readFile(path),
            mimeType: 'video/mp4',
            title: 'Reference-Clip_AI-Generated_DAT-Create.mp4',
        });
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const config = loadConfig();
    const signing = {
        claimGenerator: config.claimGenerator,
        context: await loadReaderContext(config.trust),
        signer: await loadLocalSigner(config.signing),
    };
    const { image, provenance } = await createWithProvenance(signing, {
        agent: AGENT,
        generated: await generateClip(),
    });

    await writeFile(OUTPUT, image.buffer);
    console.log(`${OUTPUT.pathname}: ${image.buffer.length} bytes, ${provenance.describe()}`);
}
