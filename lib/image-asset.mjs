import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const EXTENSION_BY_MIME = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['video/mp4', '.mp4'],
]);
const MIME_BY_EXTENSION = new Map([
    ['.jpeg', 'image/jpeg'],
    ...[...EXTENSION_BY_MIME].map(([mimeType, extension]) => [extension, mimeType]),
]);

const DATA_URI = /^data:([^;,]+);base64,(.*)$/s;

export const mimeTypeOf = (path) => MIME_BY_EXTENSION.get(extname(path).toLowerCase());

export class ImageAsset {
    constructor({ buffer, mimeType, title }) {
        this.buffer = buffer;
        this.mimeType = mimeType;
        this.title = title;
        Object.freeze(this);
    }

    static async fromFile(path) {
        const mimeType = mimeTypeOf(path);
        if (!mimeType) throw new Error(`unsupported image type: ${path}`);

        return new ImageAsset({ buffer: await readFile(path), mimeType, title: basename(path) });
    }

    static fromDataUri(uri, title) {
        const [, mimeType, data] = DATA_URI.exec(uri) ?? [];
        if (!EXTENSION_BY_MIME.has(mimeType)) throw new RangeError('expected a base64 JPEG, PNG, WebP or MP4 data URI');

        return new ImageAsset({ buffer: Buffer.from(data, 'base64'), mimeType, title });
    }

    get isVideo() {
        return this.mimeType.startsWith('video/');
    }

    retitled(title) {
        return new ImageAsset({ ...this, title });
    }

    retitledAs(stem) {
        return this.retitled(`${stem}${EXTENSION_BY_MIME.get(this.mimeType) ?? ''}`);
    }

    withBuffer(buffer) {
        return new ImageAsset({ ...this, buffer });
    }

    toDataUri() {
        return `data:${this.mimeType};base64,${this.buffer.toString('base64')}`;
    }

    toJSON() {
        return { image: this.toDataUri(), mimeType: this.mimeType, title: this.title };
    }
}
