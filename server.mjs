import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadConfig } from './config/index.mjs';
import { createAccess } from './lib/http/access.mjs';
import { ImageAsset, mimeTypeOf } from './lib/image-asset.mjs';
import { GatewayImageEditor } from './lib/image-editors.mjs';
import { describeVideoEdit, reencode, VIDEO_KINDS } from './lib/video.mjs';

const WEB_DIR = fileURLToPath(new URL('./web/', import.meta.url));
const SAMPLES_DIR = fileURLToPath(new URL('./samples/', import.meta.url));
const TEMPLATES_DIR = fileURLToPath(new URL('./templates/', import.meta.url));
const STATIC_TYPES = new Map([
    ['.css', 'text/css'],
    ['.html', 'text/html; charset=utf-8'],
    ['.mjs', 'text/javascript'],
]);
const MANUAL_AGENT = 'Browser canvas editor';
const TEMPLATE_AGENT = 'Browser template renderer';
const VIDEO_AGENT = 'ffmpeg';
const AI_EDIT = 'c2pa.edited';
const INVALID_INPUT_EXIT = 2;
const MAX_OUTPUT = 256 * 1024 * 1024;
const isTemplate = (name) => extname(name) === '.html';

const config = loadConfig();
const editor = new GatewayImageEditor(config.gateway);
const access = createAccess(config.access);
const run = promisify(execFile);

const assetOf = (source) => ImageAsset.fromDataUri(source?.image, source?.title);
const flag = (name, value) => (value == null ? [] : [name, String(value)]);
const regionFlag = (region) => flag('--region', region && `${region.x},${region.y},${region.width},${region.height}`);

async function provenance(args) {
    try {
        const { stdout } = await run(config.provenanceBinary, [...args, '--json'], { maxBuffer: MAX_OUTPUT });
        return JSON.parse(stdout);
    } catch (error) {
        const message =
            error.stderr
                ?.toString()
                .replace(/^provenance: /, '')
                .trim() || error.message;
        throw new (error.code === INVALID_INPUT_EXIT ? RangeError : Error)(message);
    }
}

async function stage(directory, asset, index) {
    const folder = join(directory, String(index));
    await mkdir(folder);

    const path = join(folder, asset.title);
    await writeFile(path, asset.buffer);
    return path;
}

async function withFiles(assets, task) {
    const directory = await mkdtemp(join(tmpdir(), 'provenance-'));
    try {
        const paths = await Promise.all(assets.map((asset, index) => stage(directory, asset, index)));
        return await task(paths, join(directory, 'output'));
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

const sign = (result, assets, args) =>
    withFiles(assets, async (paths, output) => {
        const report = await provenance([...args(...paths), '-o', output]);
        return { image: result.withBuffer(await readFile(output)), provenance: report };
    });

const api = {
    'GET /api/samples': async () => (await readdir(SAMPLES_DIR)).filter(mimeTypeOf).sort(),
    'GET /api/templates': async () => (await readdir(TEMPLATES_DIR)).filter(isTemplate).sort(),
    'POST /api/create': async ({ prompt, title = 'generated' }) => {
        if (typeof prompt !== 'string' || !prompt.trim()) throw new RangeError('expected a non-empty prompt');

        const generated = (await editor.generate(prompt, title)).retitledAs(title);
        return sign(generated, [generated], (input) => ['create', input, '--agent', editor.agent]);
    },
    'POST /api/edits/ai': async ({ input, instruction, kind = AI_EDIT, parent, region, title }) => {
        const original = assetOf(parent);
        const source = input ? assetOf({ image: input, title: parent.title }) : original;
        const edited = (await editor.edit(source, instruction)).retitledAs(title);
        return sign(edited, [original, edited], (parentPath, editedPath) => [
            'edit',
            parentPath,
            editedPath,
            '--ai',
            '--agent',
            editor.agent,
            ...flag('--action', kind),
            ...regionFlag(region),
        ]);
    },
    'POST /api/edits/manual': ({ description, edited, kind, parent, placed, region, title }) => {
        const result = ImageAsset.fromDataUri(edited).retitledAs(title);
        const assets = [assetOf(parent), result, ...(placed ? [assetOf(placed)] : [])];
        return sign(result, assets, (parentPath, editedPath, placedPath) => [
            'edit',
            parentPath,
            editedPath,
            '--agent',
            MANUAL_AGENT,
            ...flag('--action', kind),
            ...flag('--description', description),
            ...regionFlag(region),
            ...flag('--placed', placedPath && `${placed.slot}=${placedPath}`),
        ]);
    },
    'POST /api/edits/template': ({ components, rendered, title }) => {
        if (!Array.isArray(components)) throw new RangeError('expected a list of components');

        const result = ImageAsset.fromDataUri(rendered).retitledAs(title);
        return sign(result, [result, ...components.map(assetOf)], (renderedPath, ...componentPaths) => [
            'compose',
            renderedPath,
            '--agent',
            TEMPLATE_AGENT,
            ...components.flatMap(({ edits = [], slot }, index) => [
                '--component',
                `${slot}=${componentPaths[index]}`,
                ...edits.flatMap(({ description, kind: action }) => ['--edit', `${slot}=${action}=${description}`]),
            ]),
        ]);
    },
    'POST /api/edits/video': async ({ kind, parent, title, width }) => {
        if (!VIDEO_KINDS.has(kind)) throw new RangeError(`unsupported video edit: ${kind}`);

        const original = assetOf(parent);
        const edited = (await reencode(original, { kind, width })).retitledAs(title);
        return sign(edited, [original, edited], (parentPath, editedPath) => [
            'edit',
            parentPath,
            editedPath,
            '--agent',
            VIDEO_AGENT,
            '--action',
            kind,
            '--description',
            describeVideoEdit({ kind, width }),
        ]);
    },
    'POST /api/provenance': (image) => withFiles([assetOf(image)], ([path]) => provenance(['inspect', path])),
};

const CLIENT_ERRORS = [RangeError, SyntaxError, URIError];
const statusOf = (error) => (CLIENT_ERRORS.some((type) => error instanceof type) ? 400 : 500);

async function readJson(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);

    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body === null || typeof body !== 'object') throw new RangeError('expected a JSON object');

    return body;
}

const NO_CACHE = { 'cache-control': 'private, no-store' };

const isSecure = (request) => request.headers['x-forwarded-proto'] === 'https';

function respondJson(response, status, body) {
    response.writeHead(status, { ...NO_CACHE, 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
}

async function serveFile(response, directory, name, status = 200) {
    const path = normalize(join(directory, name));
    if (!path.startsWith(directory)) return respondJson(response, 404, { error: 'not found' });

    try {
        const body = await readFile(path);
        response.writeHead(status, {
            ...NO_CACHE,
            'content-type': STATIC_TYPES.get(extname(name)) ?? mimeTypeOf(name) ?? 'application/octet-stream',
        });
        response.end(body);
    } catch {
        respondJson(response, 404, { error: 'not found' });
    }
}

function setCookie(response, cookie) {
    response.writeHead(204, { ...NO_CACHE, 'set-cookie': cookie });
    response.end();
}

async function login(request, response) {
    const cookie = access.login((await readJson(request)).password, isSecure(request));
    if (!cookie) return respondJson(response, 401, { error: 'wrong password' });

    setCookie(response, cookie);
}

const session = {
    DELETE: (request, response) => setCookie(response, access.logout(isSecure(request))),
    GET: (request, response) => respondJson(response, 200, { required: !access.open }),
    POST: login,
};

const deny = (response, pathname) =>
    pathname.startsWith('/api/')
        ? respondJson(response, 401, { error: 'password required' })
        : serveFile(response, WEB_DIR, 'login.html', 401);

async function route(request, response) {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname === '/api/health') return respondJson(response, 200, { ok: true });
    if (pathname === '/api/session' && session[request.method]) return session[request.method](request, response);
    if (!access.authorised(request)) return deny(response, pathname);

    const sample = pathname.match(/^\/api\/samples\/(.+)$/);
    if (sample) return serveFile(response, SAMPLES_DIR, decodeURIComponent(sample[1]));

    const template = pathname.match(/^\/api\/templates\/(.+)$/);
    if (template) return serveFile(response, TEMPLATES_DIR, decodeURIComponent(template[1]));

    const endpoint = api[`${request.method} ${pathname}`];
    if (!endpoint) return serveFile(response, WEB_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));

    const body = request.method === 'POST' ? await readJson(request) : undefined;
    respondJson(response, 200, (await endpoint(body)) ?? null);
}

async function handle(request, response) {
    try {
        await route(request, response);
    } catch (error) {
        console.error(error);
        respondJson(response, statusOf(error), { error: error.message });
    }
}

createServer(handle).listen(config.port, () => console.log(`http://localhost:${config.port}`));
