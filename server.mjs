import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config/index.mjs';
import { createAccess } from './lib/http/access.mjs';
import { AiEdit, ManualEdit } from './lib/c2pa/manifest.mjs';
import { Provenance } from './lib/c2pa/provenance.mjs';
import { loadReaderContext } from './lib/c2pa/context.mjs';
import { loadLocalSigner } from './lib/c2pa/signer.mjs';
import { composeWithProvenance } from './lib/compose.mjs';
import { createWithProvenance } from './lib/create.mjs';
import { deriveWithProvenance } from './lib/derive.mjs';
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
const MANUAL_AGENT = { name: 'Browser canvas editor' };
const TEMPLATE_AGENT = { name: 'Browser template renderer' };
const VIDEO_AGENT = { name: 'ffmpeg' };
const isTemplate = (name) => extname(name) === '.html';

const config = loadConfig();
const signing = {
    claimGenerator: config.claimGenerator,
    context: await loadReaderContext(config.trust),
    signer: await loadLocalSigner(config.signing),
};
const editor = new GatewayImageEditor(config.gateway);
const access = createAccess(config.access);

const assetOf = (source) => ImageAsset.fromDataUri(source?.image, source?.title);
const manualEdit = ({ description, kind, region }) =>
    new ManualEdit({ agent: MANUAL_AGENT, description, kind, region });

const api = {
    'GET /api/samples': async () => (await readdir(SAMPLES_DIR)).filter(mimeTypeOf).sort(),
    'GET /api/templates': async () => (await readdir(TEMPLATES_DIR)).filter(isTemplate).sort(),
    'POST /api/create': async ({ prompt, title = 'generated' }) => {
        if (typeof prompt !== 'string' || !prompt.trim()) throw new RangeError('expected a non-empty prompt');

        const generated = (await editor.generate(prompt, title)).retitledAs(title);
        return createWithProvenance(signing, { agent: editor.agent, generated });
    },
    'POST /api/edits/ai': async ({ input, instruction, kind, parent, region, title }) => {
        const edit = new AiEdit({ agent: editor.agent, kind, region });
        const original = assetOf(parent);
        const edited = (
            await editor.edit(input ? assetOf({ image: input, title: parent.title }) : original, instruction)
        ).retitledAs(title);
        return deriveWithProvenance(signing, { edit, edited, original });
    },
    'POST /api/edits/manual': ({ edited, parent, placed, title, ...edit }) =>
        deriveWithProvenance(signing, {
            edit: manualEdit(edit),
            edited: ImageAsset.fromDataUri(edited).retitledAs(title),
            original: assetOf(parent),
            placed: placed && { asset: assetOf(placed), slot: placed.slot },
        }),
    'POST /api/edits/template': ({ components, rendered, title }) => {
        if (!Array.isArray(components)) throw new RangeError('expected a list of components');

        return composeWithProvenance(
            { ...signing, agent: TEMPLATE_AGENT },
            {
                components: components.map(({ edits = [], slot, ...component }) => ({
                    asset: assetOf(component),
                    edits: edits.map(manualEdit),
                    slot,
                })),
                rendered: ImageAsset.fromDataUri(rendered).retitledAs(title),
            },
        );
    },
    'POST /api/edits/video': async ({ kind, parent, title, width }) => {
        if (!VIDEO_KINDS.has(kind)) throw new RangeError(`unsupported video edit: ${kind}`);

        const original = assetOf(parent);
        const edited = (await reencode(original, { kind, width })).retitledAs(title);
        const description = describeVideoEdit({ kind, width });
        return deriveWithProvenance(signing, {
            edit: new ManualEdit({ agent: VIDEO_AGENT, description, kind }),
            edited,
            original,
        });
    },
    'POST /api/provenance': (image) => Provenance.of(assetOf(image), signing.context),
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
