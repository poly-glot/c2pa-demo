import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ImageAsset } from '../lib/image-asset.mjs';
import { ZeroGpuImageEditor } from '../lib/image-editors.mjs';

const HOST = 'https://space.hf.space';
const PIXELS = Buffer.from('webp-bytes');
const realFetch = globalThis.fetch;

const queueStream = (completed) =>
    [
        { msg: 'estimation' },
        { msg: 'process_starts' },
        { msg: 'process_completed', ...completed },
        { msg: 'close_stream' },
    ]
        .map((message) => `data: ${JSON.stringify(message)}\n\n`)
        .join('');

function stubSpace(completed) {
    const calls = [];
    const routes = [
        ['/host', () => Response.json({ host: HOST })],
        [
            '/config',
            () =>
                Response.json({
                    dependencies: [
                        { api_name: 'other', id: 0 },
                        { api_name: 'infer', id: 2 },
                    ],
                }),
        ],
        ['/gradio_api/upload', () => Response.json(['/tmp/gradio/in.png'])],
        ['/gradio_api/queue/join', () => Response.json({ event_id: 'e1' })],
        ['/gradio_api/queue/data?session_hash=', () => new Response(queueStream(completed))],
        ['/gradio_api/file=/tmp/gradio/out.webp', () => new Response(PIXELS)],
    ];

    globalThis.fetch = async (url, init = {}) => {
        calls.push({ init, url });
        const route = routes.find(([fragment]) => url.includes(fragment));
        return route ? route[1]() : new Response('not found', { status: 404 });
    };

    return calls;
}

const succeeded = {
    output: { data: [{ path: '/tmp/gradio/out.webp', url: `${HOST}/gradio_api/file=/tmp/gradio/out.webp` }, 42] },
    success: true,
};

afterEach(() => {
    globalThis.fetch = realFetch;
});

test('edit uploads the image, queues the instruction with the edit rules and returns the WebP result', async () => {
    const calls = stubSpace(succeeded);
    const editor = new ZeroGpuImageEditor({ token: 'hf_test' });
    const source = new ImageAsset({ buffer: Buffer.from('png'), mimeType: 'image/png', title: 'in.png' });

    const edited = await editor.edit(source, 'Make it orange.');

    assert.equal(edited.mimeType, 'image/webp');
    assert.equal(edited.title, 'in.png');
    assert.equal(edited.buffer.equals(PIXELS), true);
    assert.equal(editor.agent, 'black-forest-labs/FLUX.1-Kontext-Dev');

    const join = JSON.parse(calls.find(({ url }) => url.endsWith('/queue/join')).init.body);
    const [file, prompt] = join.data;
    assert.equal(join.fn_index, 2);
    assert.deepEqual(file, { meta: { _type: 'gradio.FileData' }, path: '/tmp/gradio/in.png' });
    assert.match(prompt, /^Make it orange\.\nKeep the image's aspect ratio/);
    assert.equal(
        calls.every(({ init }) => init.headers.authorization === 'Bearer hf_test'),
        true,
    );
});

test('generate sends no authorization without a token and surfaces the Space error message', async () => {
    const calls = stubSpace({ output: { error: 'You have exceeded your free ZeroGPU quota' }, success: false });
    const editor = new ZeroGpuImageEditor({ token: '' });

    await assert.rejects(editor.generate('a lemon', 'lemon'), /exceeded your free ZeroGPU quota/);
    assert.equal(editor.creationAgent, 'black-forest-labs/FLUX.1-schnell');
    assert.equal(
        calls.some(({ init }) => 'authorization' in init.headers),
        false,
    );
});
