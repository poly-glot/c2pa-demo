import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ImageAsset } from '../lib/image-asset.mjs';
import { editRegion } from '../lib/region.mjs';

const hasFfmpeg = (() => {
    try {
        execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

const PHOTO = 'samples/Mountain-Lake_Photo_Unsplash_1600x1067.jpg';

const pngSize = ({ buffer }) => ({ height: buffer.readUInt32BE(20), width: buffer.readUInt32BE(16) });

const solidPng = (colour, width, height) =>
    new ImageAsset({
        buffer: execFileSync('ffmpeg', [
            ...['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `color=${colour}:s=${width}x${height}`],
            ...['-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'],
        ]),
        mimeType: 'image/png',
        title: `${colour}.png`,
    });

function asRgbaPng(image) {
    const directory = mkdtempSync(join(tmpdir(), 'rgba-'));
    try {
        const path = join(directory, image.title);
        const output = join(directory, 'rgba.png');
        writeFileSync(path, image.buffer);
        execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', path, '-vf', 'format=rgba', '-frames:v', '1', output]);

        return new ImageAsset({ buffer: readFileSync(output), mimeType: 'image/png', title: image.title });
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
}

function rgbAt(image, x, y) {
    const directory = mkdtempSync(join(tmpdir(), 'rgb-'));
    try {
        const path = join(directory, image.retitledAs('pixel').title);
        writeFileSync(path, image.buffer);

        return [
            ...execFileSync('ffmpeg', [
                ...['-nostdin', '-v', 'error', '-i', path],
                ...['-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-'],
            ]),
        ];
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
}

test(
    'a region edit sends the selection with its surroundings and blends the result into the selection only',
    { skip: !hasFfmpeg && 'ffmpeg is not installed' },
    async () => {
        const photo = await ImageAsset.fromFile(PHOTO);
        const blue = solidPng('blue', 1024, 683);
        const sent = [];

        const edited = await editRegion(
            photo,
            { height: 200.4, width: 300.6, x: 400, y: 300 },
            async (surroundings) => {
                sent.push(surroundings);
                return blue;
            },
        );

        assert.deepEqual(pngSize(sent[0]), { height: 502, width: 603 });
        assert.equal(edited.mimeType, 'image/png');
        assert.equal(edited.title, photo.title);
        assert.deepEqual(pngSize(edited), { height: 1067, width: 1600 });

        assert.deepEqual(rgbAt(edited, 550, 400), rgbAt(blue, 10, 10));
        assert.notDeepEqual(rgbAt(edited, 400, 400), rgbAt(blue, 10, 10));
        const original = asRgbaPng(photo);
        assert.deepEqual(rgbAt(edited, 399, 400), rgbAt(original, 399, 400));
        assert.deepEqual(rgbAt(edited, 1200, 900), rgbAt(original, 1200, 900));
    },
);

test(
    'a region outside the image is rejected before the model is called',
    { skip: !hasFfmpeg && 'ffmpeg is not installed' },
    async () => {
        const photo = await ImageAsset.fromFile(PHOTO);
        const edit = () => assert.fail('the model must not be called');

        await assert.rejects(editRegion(photo, { height: 50, width: 50, x: 5000, y: 0 }, edit), RangeError);
    },
);
