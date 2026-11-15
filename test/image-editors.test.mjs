import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ImageAsset } from '../lib/image-asset.mjs';
import { ModalImageEditor } from '../lib/image-editors.mjs';

const PIXELS = Buffer.from('png-bytes');
const ENDPOINTS = { createUrl: 'https://create.modal.run', editUrl: 'https://edit.modal.run' };
const realFetch = globalThis.fetch;

function stubFetch(response) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ body: JSON.parse(init.body), headers: init.headers, url });
        return response();
    };

    return calls;
}

afterEach(() => {
    globalThis.fetch = realFetch;
});

test('edit posts the image and the instruction with the edit rules and returns the PNG', async () => {
    const calls = stubFetch(() => new Response(PIXELS));
    const editor = new ModalImageEditor({ ...ENDPOINTS, key: 'wk-test', secret: 'ws-test' });
    const source = new ImageAsset({ buffer: Buffer.from('jpeg'), mimeType: 'image/jpeg', title: 'in.jpg' });

    const edited = await editor.edit(source, 'Make it orange.');

    assert.equal(edited.mimeType, 'image/png');
    assert.equal(edited.title, 'in.jpg');
    assert.equal(edited.buffer.equals(PIXELS), true);
    assert.equal(editor.agent, 'black-forest-labs/FLUX.1-Kontext-dev');

    const [{ body, headers, url }] = calls;
    assert.equal(url, ENDPOINTS.editUrl);
    assert.equal(body.image, Buffer.from('jpeg').toString('base64'));
    assert.match(body.prompt, /^Make it orange\.\nKeep the image's aspect ratio/);
    assert.equal(headers['modal-key'], 'wk-test');
    assert.equal(headers['modal-secret'], 'ws-test');
});

test('generate surfaces the endpoint error text', async () => {
    const calls = stubFetch(() => new Response('{"detail":"modal-http: invalid credentials"}', { status: 401 }));
    const editor = new ModalImageEditor({ ...ENDPOINTS, key: '', secret: '' });

    await assert.rejects(editor.generate('a lemon', 'lemon'), /answered 401: .*invalid credentials/);
    assert.equal(calls[0].url, ENDPOINTS.createUrl);
    assert.deepEqual(calls[0].body, { prompt: 'a lemon' });
    assert.equal(editor.creationAgent, 'black-forest-labs/FLUX.1-schnell');
});
