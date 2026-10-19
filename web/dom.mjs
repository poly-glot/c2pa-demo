const ESCAPES = { '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;' };

export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp';

export const ACCEPTED_MEDIA = `${ACCEPTED_IMAGES},video/mp4`;

const EXTENSIONS_BY_MIME = new Map([
    ['image/jpeg', ['.jpg', '.jpeg']],
    ['image/png', ['.png']],
    ['image/webp', ['.webp']],
    ['video/mp4', ['.mp4']],
]);

export const fileStem = (name) => name.replace(/\.[^.]+$/, '');

export const escape = (value) => String(value).replace(/["&'<>]/g, (char) => ESCAPES[char]);

export const loadImage = (uri) =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('the image could not be loaded'));
        image.src = uri;
    });

export const toDataUri = (blob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

export const mimeOf = (dataUri) => dataUri.slice(5, dataUri.indexOf(';'));

export const isVideo = (dataUri) => mimeOf(dataUri).startsWith('video/');

export const mediaMarkup = (dataUri, className, { alt = '', controls = false } = {}) =>
    isVideo(dataUri)
        ? `<video class="${className}" src="${dataUri}" muted playsinline preload="metadata" ${controls ? 'controls' : ''}></video>`
        : `<img class="${className}" src="${dataUri}" alt="${escape(alt)}" draggable="false" />`;

export function downloadName({ image, title }) {
    const [preferred, ...others] = EXTENSIONS_BY_MIME.get(mimeOf(image)) ?? [];
    if (!preferred) return title;

    const lowered = title.toLowerCase();
    return [preferred, ...others].some((extension) => lowered.endsWith(extension)) ? title : `${title}${preferred}`;
}

export const download = (layer) => {
    const link = document.createElement('a');
    link.href = layer.image;
    link.download = downloadName(layer);
    link.click();
};

export const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const tab = (label, active, name, value) =>
    `<button class="tab ${active ? 'is-active' : ''}" type="button" role="tab" aria-selected="${active}" data-${name}="${value}">${label}</button>`;

export const chip = (label, tone) => `<span class="chip is-${tone}">${escape(label)}</span>`;

export const versionLabel = (index) => (index ? `v${index + 1}` : 'Original');
