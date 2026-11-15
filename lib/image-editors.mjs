import { ImageAsset } from './image-asset.mjs';

const EDIT_RULES = "Keep the image's aspect ratio and framing; change only what is asked.";

const CREATE_MODEL = 'black-forest-labs/FLUX.1-schnell';
const EDIT_MODEL = 'black-forest-labs/FLUX.1-Kontext-dev';

export class ModalImageEditor {
    #createUrl;
    #editUrl;
    #headers;

    constructor({ createUrl, editUrl, key, secret }) {
        this.#createUrl = createUrl;
        this.#editUrl = editUrl;
        this.#headers = { 'content-type': 'application/json', 'modal-key': key, 'modal-secret': secret };
    }

    get agent() {
        return EDIT_MODEL;
    }

    get creationAgent() {
        return CREATE_MODEL;
    }

    edit(image, instruction) {
        return this.#render(
            this.#editUrl,
            { image: image.buffer.toString('base64'), prompt: `${instruction}\n${EDIT_RULES}` },
            image.title,
        );
    }

    generate(prompt, title) {
        return this.#render(this.#createUrl, { prompt }, title);
    }

    async #render(url, body, title) {
        const response = await fetch(url, { body: JSON.stringify(body), headers: this.#headers, method: 'POST' });
        if (!response.ok) {
            throw new Error(`the image model answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
        }

        return new ImageAsset({ buffer: Buffer.from(await response.arrayBuffer()), mimeType: 'image/png', title });
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
