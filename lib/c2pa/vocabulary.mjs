const IPTC_SOURCE = 'http://cv.iptc.org/newscodes/digitalsourcetype/';

export const DigitalSourceType = Object.freeze({
    AI_GENERATED: `${IPTC_SOURCE}trainedAlgorithmicMedia`,
    AI_MANIPULATED: `${IPTC_SOURCE}compositeWithTrainedAlgorithmicMedia`,
    COMPOSITE_SYNTHETIC: `${IPTC_SOURCE}compositeSynthetic`,
});

export const AI_SOURCE_TYPES = new Set([
    DigitalSourceType.AI_GENERATED,
    DigitalSourceType.AI_MANIPULATED,
    DigitalSourceType.COMPOSITE_SYNTHETIC,
]);

export const ActionKind = Object.freeze({
    COLOUR_ADJUSTED: 'c2pa.color_adjustments',
    CONVERTED: 'c2pa.converted',
    CREATED: 'c2pa.created',
    CROPPED: 'c2pa.cropped',
    DRAWING: 'c2pa.drawing',
    EDITED: 'c2pa.edited',
    FILTERED: 'c2pa.filtered',
    INPAINTING: 'c2pa.inpainting',
    OPENED: 'c2pa.opened',
    ORIENTATION: 'c2pa.orientation',
    OUTPAINTING: 'c2pa.outpainting',
    PLACED: 'c2pa.placed',
    PUBLISHED: 'c2pa.published',
    RESIZED: 'c2pa.resized',
    TRANSCODED: 'c2pa.transcoded',
    UPSCALED: 'c2pa.upscaled',
});

export const MANUAL_ACTIONS = new Set([
    ActionKind.COLOUR_ADJUSTED,
    ActionKind.CONVERTED,
    ActionKind.CROPPED,
    ActionKind.DRAWING,
    ActionKind.EDITED,
    ActionKind.FILTERED,
    ActionKind.ORIENTATION,
    ActionKind.PLACED,
    ActionKind.PUBLISHED,
    ActionKind.RESIZED,
    ActionKind.TRANSCODED,
]);

export const AI_ACTIONS = new Map([
    [ActionKind.EDITED, DigitalSourceType.AI_MANIPULATED],
    [ActionKind.INPAINTING, DigitalSourceType.AI_MANIPULATED],
    [ActionKind.OUTPAINTING, DigitalSourceType.AI_MANIPULATED],
    [ActionKind.UPSCALED, DigitalSourceType.AI_MANIPULATED],
]);

export const Relationship = Object.freeze({
    COMPONENT_OF: 'componentOf',
    PARENT_OF: 'parentOf',
});

export const Intent = Object.freeze({
    EDIT: 'edit',
    create: (digitalSourceType) => ({ create: digitalSourceType }),
});
