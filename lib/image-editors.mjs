import { ImageAsset } from './image-asset.mjs';

const EDIT_RULES = "Keep the image's aspect ratio and framing; change only what is asked.";

export class GatewayImageEditor {
    #gateway;

    constructor(gateway) {
        this.#gateway = gateway;
    }

    get agent() {
        return { name: this.#gateway.imageModel };
    }

    async edit(image, instruction) {
        const response = await fetch(`${this.#gateway.url}/v1/chat/completions`, {
            body: JSON.stringify(this.#request(image, instruction)),
            headers: { authorization: `Bearer ${this.#gateway.apiKey}`, 'content-type': 'application/json' },
            method: 'POST',
        });
        if (!response.ok)
            throw new Error(`gateway answered ${response.status}: ${(await response.text()).slice(0, 300)}`);

        const message = (await response.json()).choices?.[0]?.message;
        const uri = message?.images?.[0]?.image_url?.url;
        if (!uri) throw new Error(`the image model returned no image: ${message?.content ?? ''}`);

        return ImageAsset.fromDataUri(uri, image.title);
    }

    #request(image, instruction) {
        return {
            messages: [
                {
                    content: [
                        { text: `${instruction}\n${EDIT_RULES}`, type: 'text' },
                        { image_url: { url: image.toDataUri() }, type: 'image_url' },
                    ],
                    role: 'user',
                },
            ],
            modalities: ['image', 'text'],
            model: this.#gateway.imageModel,
        };
    }
}

export class IdentityImageEditor {
    get agent() {
        return { name: 'identity (self-check)' };
    }

    async edit(image) {
        return image;
    }
}
