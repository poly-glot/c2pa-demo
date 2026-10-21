import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const MAX_WIDTH = 7680;
const RESIZED = 'c2pa.resized';
const TRANSCODED = 'c2pa.transcoded';

export const H264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast'];
export const VIDEO_KINDS = new Set([RESIZED, TRANSCODED]);

export const ffmpeg = (args) => run('ffmpeg', ['-y', '-v', 'error', ...args]);

function filtersFor(kind, width) {
    if (kind !== RESIZED) return [];
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
        await ffmpeg(['-i', input, ...filters, ...H264, '-crf', '28', '-an', output]);
        return asset.withBuffer(await readFile(output));
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

export const describeVideoEdit = ({ kind, width }) =>
    kind === RESIZED ? `Resized the video to ${width - (width % 2)} px wide` : 'Transcoded the video to H.264';
