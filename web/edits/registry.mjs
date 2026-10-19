import { ACTION } from '../actions.mjs';
import {
    adjustColour,
    blur,
    boundsOf,
    crop,
    DEFAULT_BRUSH,
    draw,
    erase,
    flip,
    grayscale,
    invert,
    pad,
    place,
    resize,
    rotate,
    sepia,
    sharpen,
    unchanged,
} from './canvas-ops.mjs';

const BLUR_RADIUS = 4;

export const UNCHANGED_PERCENT = 100;

export const SLIDER_LABELS = { brightness: 'Brightness', contrast: 'Contrast', saturation: 'Saturation' };

const manual = (tool) => ({ mode: 'manual', needs: [], ...tool });

const ai = (tool) => ({ mode: 'ai', needs: [], ...tool });

const fixedEdit = (description, kind) => () => ({ description, kind });

const describeRegion = ({ height, width, x, y }) => `${width}×${height} at ${x},${y}`;

const changedSliders = (sliders) =>
    Object.entries(SLIDER_LABELS)
        .filter(([name]) => sliders[name] !== UNCHANGED_PERCENT)
        .map(([name, label]) => `${label} ${sliders[name]}%`);

const exportTool = (id, label, format) =>
    manual({
        apply: unchanged,
        edit: () => ({ description: `Converted to ${label}`, format, kind: ACTION.converted }),
        group: 'Export',
        id: `export${id}`,
        label: `Export as ${label}`,
    });

const orientationTool = (id, label, apply, description) =>
    manual({
        apply,
        edit: fixedEdit(description, ACTION.orientation),
        group: 'Orientation',
        id,
        label,
    });

const filterTool = (id, label, apply, description) =>
    manual({ apply, edit: fixedEdit(description, ACTION.filtered), group: 'Filters', id, label });

export const TOOLS = [
    manual({
        apply: grayscale,
        edit: fixedEdit('Converted to black and white', ACTION.colorAdjustments),
        group: 'Adjust',
        id: 'blackAndWhite',
        label: 'Black & white',
    }),
    manual({
        apply: (image, { sliders }) => adjustColour(image, sliders),
        edit: ({ sliders }) => {
            const changes = changedSliders(sliders);
            return {
                description: changes.length ? `Adjusted ${changes.join(', ')}` : 'Adjusted colour',
                kind: ACTION.colorAdjustments,
            };
        },
        group: 'Colour',
        id: 'colour',
        label: 'Apply',
        needs: ['sliders'],
    }),
    filterTool('sharpen', 'Sharpen', sharpen, 'Sharpened with a 3×3 kernel'),
    filterTool('blur', 'Blur', (image) => blur(image, BLUR_RADIUS), `Blurred with a ${BLUR_RADIUS}px radius`),
    filterTool('sepia', 'Sepia', sepia, 'Applied a sepia tone'),
    filterTool('invert', 'Invert', invert, 'Inverted the colours'),
    orientationTool('rotateLeft', 'Rotate left', (image) => rotate(image, -1), 'Rotated 90° anticlockwise'),
    orientationTool('rotateRight', 'Rotate right', (image) => rotate(image, 1), 'Rotated 90° clockwise'),
    orientationTool('flipHorizontal', 'Flip horizontal', (image) => flip(image, 'horizontal'), 'Flipped horizontally'),
    orientationTool('flipVertical', 'Flip vertical', (image) => flip(image, 'vertical'), 'Flipped vertically'),
    manual({
        apply: (image, { width }) => resize(image, width),
        edit: ({ width }) => ({ description: `Resized to ${width}px wide`, kind: ACTION.resized }),
        group: 'Geometry',
        id: 'resize',
        label: 'Resize',
        needs: ['width'],
    }),
    manual({
        apply: (image, { selection }) => crop(image, selection),
        edit: ({ selection }) => ({
            description: `Cropped to ${describeRegion(selection)}`,
            kind: ACTION.cropped,
            region: selection,
        }),
        group: 'Geometry',
        id: 'crop',
        label: 'Crop selection',
        needs: ['selection'],
    }),
    manual({
        apply: (image, { strokes }) => draw(image, strokes, DEFAULT_BRUSH),
        edit: ({ strokes }) => {
            const region = boundsOf(strokes);
            return { description: `Drew over ${describeRegion(region)}`, kind: ACTION.drawing, region };
        },
        group: 'Paint',
        id: 'draw',
        label: 'Draw',
        needs: ['strokes'],
    }),
    manual({
        apply: (image, { selection }) => erase(image, selection),
        edit: ({ selection }) => ({
            description: `Erased ${describeRegion(selection)}`,
            kind: ACTION.edited,
            region: selection,
        }),
        group: 'Paint',
        id: 'erase',
        label: 'Erase selection',
        needs: ['selection'],
    }),
    manual({
        apply: (image, { overlay, selection }) => place(image, overlay, selection),
        edit: ({ selection }) => ({
            description: `Placed an image at ${selection.x},${selection.y} ${selection.width}×${selection.height}`,
            kind: ACTION.placed,
            placed: { slot: 'overlay' },
            region: selection,
        }),
        group: 'Place',
        id: 'placeImage',
        label: 'Place image',
        needs: ['selection', 'layer'],
    }),
    exportTool('Png', 'PNG', 'image/png'),
    exportTool('Webp', 'WebP', 'image/webp'),
    manual({
        apply: unchanged,
        edit: ({ quality }) => ({
            description: `Re-encoded as JPEG at quality ${quality}`,
            kind: ACTION.transcoded,
            quality,
        }),
        group: 'Export',
        id: 'reencode',
        label: 'Re-encode JPEG',
        needs: ['quality'],
    }),
    {
        apply: unchanged,
        edit: fixedEdit('Published as a signed image', ACTION.published),
        group: 'Export',
        id: 'publish',
        label: 'Publish',
        mode: 'publish',
        needs: [],
    },
    ai({
        group: 'AI',
        id: 'aiEdit',
        label: 'AI edit',
        needs: ['prompt'],
        request: ({ prompt }) => ({ instruction: prompt, kind: ACTION.edited }),
    }),
    ai({
        group: 'AI',
        id: 'inpaint',
        label: 'AI inpaint selection',
        needs: ['prompt', 'selection'],
        request: ({ prompt, selection }) => ({
            instruction: `${prompt} Change only the region ${selection.x},${selection.y},${selection.width},${selection.height} px of the image; leave everything outside it exactly as it is.`,
            kind: ACTION.inpainting,
            region: selection,
        }),
    }),
    ai({
        group: 'AI',
        id: 'outpaint',
        label: 'AI outpaint',
        needs: ['prompt', 'margin'],
        prepare: (image, { margin }) => pad(image, margin),
        request: ({ margin, prompt }) => ({
            instruction: `Extend the image outward by ${margin} px on every side, continuing the scene naturally. ${prompt}`,
            kind: ACTION.outpainting,
        }),
    }),
    ai({
        group: 'AI',
        id: 'upscale',
        label: 'AI upscale 2×',
        request: () => ({
            instruction:
                'Upscale this image to twice its width and height, adding plausible fine detail without changing the content.',
            kind: ACTION.upscaled,
        }),
    }),
];

export const VIDEO_TOOLS = [
    {
        edit: () => ({ description: 'Transcoded the video to H.264', kind: ACTION.transcoded }),
        id: 'transcodeVideo',
        label: 'Transcode video',
        mode: 'video',
        needs: [],
    },
    {
        edit: ({ width }) => ({ description: `Resized the video to ${width}px wide`, kind: ACTION.resized }),
        id: 'resizeVideo',
        label: 'Resize video',
        mode: 'video',
        needs: ['width'],
    },
];

export const TOOL_BY_ID = new Map([...TOOLS, ...VIDEO_TOOLS].map((tool) => [tool.id, tool]));
