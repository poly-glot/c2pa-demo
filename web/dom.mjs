const ESCAPES = { '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;' };

export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp';

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

export const download = ({ image, title }) => {
    const link = document.createElement('a');
    link.href = image;
    link.download = title;
    link.click();
};

export const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const tab = (label, active, name, value) =>
    `<button class="tab ${active ? 'is-active' : ''}" type="button" role="tab" aria-selected="${active}" data-${name}="${value}">${label}</button>`;

export const chip = (label, tone) => `<span class="chip is-${tone}">${escape(label)}</span>`;

export const versionLabel = (index) => (index ? `v${index + 1}` : 'Original');
