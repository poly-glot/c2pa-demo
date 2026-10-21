import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ImageAsset } from '../lib/image-asset.mjs';
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

const probeSize = (buffer) =>
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', '-'], {
        input: buffer,
    })
        .toString()
        .trim();

test('a resized video keeps an even width', { skip: !hasFfmpeg }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'clip-'));
    try {
        const path = join(directory, 'clip.mp4');
        await generateClip(path);
        const resized = await reencode(await ImageAsset.fromFile(path), { kind: 'c2pa.resized', width: 321 });

        assert.equal(probeSize(resized.buffer), '320,180');
        assert.equal(describeVideoEdit({ kind: 'c2pa.resized', width: 321 }), 'Resized the video to 320 px wide');
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
});

test('only videos are re-encoded and widths are bounded', async () => {
    const photo = await ImageAsset.fromFile('samples/Mountain-Lake_Photo_Unsplash_1600x1067.jpg');
    await assert.rejects(reencode(photo, { kind: 'c2pa.transcoded' }), RangeError);

    const clip = new ImageAsset({ buffer: Buffer.alloc(0), mimeType: 'video/mp4', title: 'clip.mp4' });
    await assert.rejects(reencode(clip, { kind: 'c2pa.resized', width: 8 }), RangeError);
});
