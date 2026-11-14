import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ImageAsset } from './image-asset.mjs';
import { ffmpeg } from './video.mjs';

const run = promisify(execFile);

const CONTEXT_SHARE = 0.5;
const MAX_FEATHER = 48;
const FEATHER_SHARE = 1 / 6;

async function sizeOf(path) {
    const { stdout } = await run('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        path,
    ]);
    const [width, height] = stdout.trim().split(',').map(Number);

    return { height, width };
}

function selectionWithin({ height, width, x, y }, bounds) {
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const right = Math.min(bounds.width, Math.round(x + width));
    const bottom = Math.min(bounds.height, Math.round(y + height));
    if (![left, top, right, bottom].every(Number.isFinite) || right - left < 1 || bottom - top < 1) {
        throw new RangeError('expected a region inside the image');
    }

    return { height: bottom - top, width: right - left, x: left, y: top };
}

function contextAround(selection, bounds) {
    const margin = Math.round(Math.max(selection.width, selection.height) * CONTEXT_SHARE);
    const left = Math.max(0, selection.x - margin);
    const top = Math.max(0, selection.y - margin);
    const right = Math.min(bounds.width, selection.x + selection.width + margin);
    const bottom = Math.min(bounds.height, selection.y + selection.height + margin);

    return { height: bottom - top, width: right - left, x: left, y: top };
}

const cropOf = ({ height, width, x, y }) => `crop=${width}:${height}:${x}:${y}`;

function compositeFilter(selection, context) {
    const feather = Math.max(
        1,
        Math.min(MAX_FEATHER, Math.floor(Math.min(selection.width, selection.height) * FEATHER_SHARE)),
    );
    const alpha = `255*clip(min(min(X+1,W-X),min(Y+1,H-Y))/${feather},0,1)`;
    const inner = { ...selection, x: selection.x - context.x, y: selection.y - context.y };

    return [
        `[1:v]format=rgba,scale=${context.width}:${context.height},${cropOf(inner)},geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alpha}'[patch]`,
        '[0:v]format=rgba[base]',
        `[base][patch]overlay=${selection.x}:${selection.y}:format=rgb`,
    ].join(';');
}

export async function editRegion(image, region, edit) {
    const directory = await mkdtemp(join(tmpdir(), 'region-'));
    const stage = async (asset, stem) => {
        const path = join(directory, asset.retitledAs(stem).title);
        await writeFile(path, asset.buffer);
        return path;
    };
    const render = async (stem, args) => {
        const output = join(directory, `${stem}.png`);
        await ffmpeg([...args, '-frames:v', '1', '-update', '1', output]);
        return new ImageAsset({ buffer: await readFile(output), mimeType: 'image/png', title: image.title });
    };

    try {
        const source = await stage(image, 'source');
        const bounds = await sizeOf(source);
        const selection = selectionWithin(region, bounds);
        const context = contextAround(selection, bounds);

        const surroundings = await render('surroundings', ['-i', source, '-vf', `format=rgba,${cropOf(context)}`]);
        const patch = await stage(await edit(surroundings), 'patch');

        return await render('composite', [
            '-i',
            source,
            '-i',
            patch,
            '-filter_complex',
            compositeFilter(selection, context),
        ]);
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}
