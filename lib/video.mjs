import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ActionKind } from './c2pa/vocabulary.mjs';

const run = promisify(execFile);
const ENCODE_ARGUMENTS = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '28', '-an'];
const MAX_WIDTH = 7680;

export const VIDEO_KINDS = new Set([ActionKind.RESIZED, ActionKind.TRANSCODED]);

function filtersFor(kind, width) {
    if (kind !== ActionKind.RESIZED) return [];
    if (!Number.isInteger(width) || width < 16 || width > MAX_WIDTH) {
        throw new RangeError(`expected a width between 16 and ${MAX_WIDTH}`);
    }

    return ['-vf', `scale=${width - (width % 2)}:-2`];
}

export async function reencode(asset, { kind, width }) {
    if (!asset.isVideo) throw new RangeError('expected a video');

    const filters = filtersFor(kind, width);
    const directory = await mkdtemp(join(tmpdir(), 'video-'));
    const input = join(directory, 'input.mp4');
    const output = join(directory, 'output.mp4');

    try {
        await writeFile(input, asset.buffer);
        await run('ffmpeg', ['-y', '-v', 'error', '-i', input, ...filters, ...ENCODE_ARGUMENTS, output]);
        return asset.withBuffer(await readFile(output));
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

export const describeVideoEdit = ({ kind, width }) =>
    kind === ActionKind.RESIZED
        ? `Resized the video to ${width - (width % 2)} px wide`
        : 'Transcoded the video to H.264';
