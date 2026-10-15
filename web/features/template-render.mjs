import { fileStem, loadImage } from '../dom.mjs';
import { canvasOf, encode } from '../edits/canvas-ops.mjs';

export function parseTemplate(html) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const { body } = document;
    body.prepend(...document.head.querySelectorAll('style'));
    const textElements = [...body.querySelectorAll('[data-text]')];

    return {
        body,
        height: Number(body.dataset.height),
        placeholders: new Map(textElements.map((element) => [element.dataset.text, element.textContent])),
        slots: [...body.querySelectorAll('[data-slot]')].map((element) => element.dataset.slot),
        texts: textElements.map((element) => element.dataset.text),
        width: Number(body.dataset.width),
    };
}

export function fillTemplate(body, imageBySlot, textByName) {
    const filled = body.cloneNode(true);
    for (const element of filled.querySelectorAll('[data-slot]')) {
        element.src = imageBySlot.get(element.dataset.slot) ?? '';
    }
    for (const element of filled.querySelectorAll('[data-text]')) {
        element.textContent = textByName.get(element.dataset.text) ?? element.textContent;
    }

    return filled;
}

export function templateToSvg({ body, height, width }, imageBySlot, textByName) {
    const markup = new XMLSerializer().serializeToString(fillTemplate(body, imageBySlot, textByName));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
}

export const svgToDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export async function rasterize(svg, { height, width }) {
    const image = await loadImage(svgToDataUri(svg));
    const canvas = canvasOf(width, height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    return encode(canvas);
}

export async function adjustImage(layerImage, tool) {
    if (!tool) return layerImage;

    return encode(tool.apply(await loadImage(layerImage)));
}

export const componentFor = (slot, layer, tool) => ({
    edits: tool ? [tool.edit({})] : [],
    image: layer.image,
    slot,
    title: layer.title,
});

export const composeTitle = (templateName, count) => `${fileStem(templateName)}_${count}`;
