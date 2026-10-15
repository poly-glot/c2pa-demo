import { api } from '../api.mjs';
import { fileStem, loadImage } from '../dom.mjs';
import { encode, JPEG } from '../edits/canvas-ops.mjs';

const MISSING = {
    layer: 'Choose a layer to place first.',
    margin: 'Enter a margin first.',
    prompt: 'Describe the change first.',
    selection: 'Drag a rectangle over the image first.',
    strokes: 'Turn on Brush and draw on the image first.',
    width: 'Enter a width first.',
};

const isEmpty = (value) => !value || value.length === 0;

export const missingInput = (tool, params) =>
    MISSING[tool.needs.find((need) => MISSING[need] && isEmpty(params[need]))];

export const nextTitle = (source) => `${fileStem(source.title)}_v${source.layers.length + 1}`;

const mimeOf = (dataUri) => dataUri.slice(5, dataUri.indexOf(';'));

const encodeEdit = (canvas, { format, quality }, parentFormat) =>
    quality ? encode(canvas, JPEG, quality / 100) : encode(canvas, format ?? parentFormat);

async function signManual(tool, parent, params, title) {
    const edit = tool.edit(params);
    const edited = encodeEdit(tool.apply(await loadImage(parent.image), params), edit, mimeOf(parent.image));
    const placed = edit.placed && { ...edit.placed, image: params.layer.image, title: params.layer.title };
    const result = await api.manualEdit(parent, edited, { ...edit, placed }, title);

    return { ...result, caption: edit.description, kind: edit.kind };
}

async function signAi(tool, parent, params, title) {
    const request = tool.request(params);
    const input = tool.prepare && encode(tool.prepare(await loadImage(parent.image), params), mimeOf(parent.image));
    const result = await api.aiEdit(parent, { ...request, input }, title);

    return { ...result, caption: params.prompt, kind: request.kind };
}

export const signEdit = (tool, parent, params, title) =>
    (tool.mode === 'ai' ? signAi : signManual)(tool, parent, params, title);
