import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ImageAsset } from '../lib/image-asset.mjs';
import { ZeroGpuImageEditor } from '../lib/image-editors.mjs';

const HOST = 'https://space.hf.space';
const PIXELS = Buffer.from('webp-bytes');
const realFetch = globalThis.fetch;

function stubSpace(finalEvent) {
    const calls = [];
    const routes = new Map([
        ['/host', () => Response.json({ host: HOST })],
        ['/gradio_api/upload', () => Response.json(['/tmp/gradio/in.png'])],
        ['/gradio_api/call/infer', () => Response.json({ event_id: 'e1' })],
        ['/gradio_api/call/infer/e1', () => new Response(`event: heartbeat\ndata: null\n\n${finalEvent}\n\n`)],
        ['/gradio_api/file=/tmp/gradio/out.webp', () => new Response(PIXELS)],
    ]);

    globalThis.fetch = async (url, init = {}) => {
        calls.push({ init, url });
        const route = [...routes.keys()].find((suffix) => url.endsWith(suffix));
        return route ? routes.get(route)() : new Response('not found', { status: 404 });
    };

    return calls;
}

const complete = `event: complete\ndata: [{"path": "/tmp/gradio/out.webp", "url": "${HOST}/gradio_api/file=/tmp/gradio/out.webp"}, 42]`;

afterEach(() => {
    globalThis.fetch = realFetch;
});

test('edit uploads the image, sends the instruction with the edit rules and returns the WebP result', async () => {
    const calls = stubSpace(complete);
    const editor = new ZeroGpuImageEditor({ token: 'hf_test' });
    const source = new ImageAsset({ buffer: Buffer.from('png'), mimeType: 'image/png', title: 'in.png' });

    const edited = await editor.edit(source, 'Make it orange.');

    assert.equal(edited.mimeType, 'image/webp');
    assert.equal(edited.title, 'in.png');
    assert.equal(edited.buffer.equals(PIXELS), true);
    assert.equal(editor.agent, 'black-forest-labs/FLUX.1-Kontext-Dev');

    const [file, prompt] = JSON.parse(calls.find(({ url }) => url.endsWith('/call/infer')).init.body).data;
    assert.deepEqual(file, { meta: { _type: 'gradio.FileData' }, path: '/tmp/gradio/in.png' });
    assert.match(prompt, /^Make it orange\.\nKeep the image's aspect ratio/);
    assert.equal(
        calls.every(({ init }) => init.headers.authorization === 'Bearer hf_test'),
        true,
    );
});

test('generate sends no authorization without a token and surfaces a Space error', async () => {
    const calls = stubSpace('event: error\ndata: "ZeroGPU quota exceeded"');
    const editor = new ZeroGpuImageEditor({ token: '' });

    await assert.rejects(editor.generate('a lemon', 'lemon'), /ZeroGPU quota exceeded/);
    assert.equal(editor.creationAgent, 'black-forest-labs/FLUX.1-schnell');
    assert.equal(
        calls.some(({ init }) => 'authorization' in init.headers),
        false,
    );
});
