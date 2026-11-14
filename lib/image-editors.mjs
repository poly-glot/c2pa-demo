import { ImageAsset, mimeTypeOf } from './image-asset.mjs';

const EDIT_RULES = "Keep the image's aspect ratio and framing; change only what is asked.";

const HUB_SPACES = 'https://huggingface.co/api/spaces';
const CREATE_SPACE = 'black-forest-labs/FLUX.1-schnell';
const EDIT_SPACE = 'black-forest-labs/FLUX.1-Kontext-Dev';

const RANDOM_SEED = [0, true];
const CREATE_SIZE = 1024;
const CREATE_STEPS = 4;
const EDIT_GUIDANCE = 2.5;
const EDIT_STEPS = 28;

const FINAL_EVENT = /^event: (complete|error)\ndata: (.*)$/m;

export class ZeroGpuImageEditor {
    #headers;

    constructor({ token }) {
        this.#headers = token ? { authorization: `Bearer ${token}` } : {};
    }

    get agent() {
        return EDIT_SPACE;
    }

    get creationAgent() {
        return CREATE_SPACE;
    }

    async edit(image, instruction) {
        const host = await this.#host(EDIT_SPACE);
        const file = await this.#upload(host, image);

        return this.#predict(
            host,
            [file, `${instruction}\n${EDIT_RULES}`, ...RANDOM_SEED, EDIT_GUIDANCE, EDIT_STEPS],
            image.title,
        );
    }

    async generate(prompt, title) {
        const host = await this.#host(CREATE_SPACE);

        return this.#predict(host, [prompt, ...RANDOM_SEED, CREATE_SIZE, CREATE_SIZE, CREATE_STEPS], title);
    }

    async #host(space) {
        const { host } = await this.#json(`${HUB_SPACES}/${space}/host`);
        return host;
    }

    async #upload(host, image) {
        const form = new FormData();
        form.append('files', new Blob([image.buffer], { type: image.mimeType }), image.title);

        const [path] = await this.#json(`${host}/gradio_api/upload`, { body: form, method: 'POST' });
        return { meta: { _type: 'gradio.FileData' }, path };
    }

    async #predict(host, data, title) {
        const { event_id } = await this.#json(`${host}/gradio_api/call/infer`, {
            body: JSON.stringify({ data }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });

        const events = await (await this.#fetch(`${host}/gradio_api/call/infer/${event_id}`)).text();
        const [, event, payload] = FINAL_EVENT.exec(events) ?? [];
        if (event !== 'complete') throw new Error(`the image model returned no image: ${payload ?? 'no result'}`);

        const [file] = JSON.parse(payload);
        const mimeType = mimeTypeOf(file.path);
        if (!mimeType) throw new Error(`the image model returned an unsupported file: ${file.path}`);

        const image = await this.#fetch(file.url);
        return new ImageAsset({ buffer: Buffer.from(await image.arrayBuffer()), mimeType, title });
    }

    async #fetch(url, init = {}) {
        const response = await fetch(url, { ...init, headers: { ...this.#headers, ...init.headers } });
        if (!response.ok)
            throw new Error(`ZeroGPU answered ${response.status}: ${(await response.text()).slice(0, 300)}`);

        return response;
    }

    async #json(url, init) {
        return (await this.#fetch(url, init)).json();
    }
}

export class IdentityImageEditor {
    get agent() {
        return 'identity (self-check)';
    }

    async edit(image) {
        return image;
    }
}
