import { ACTION } from '../actions.mjs';

const NOT_AI = 'not AI';
export const NO_AI = 'No AI content';

const AI_VERBS = {
    [ACTION.created]: 'Generated with AI',
    [`${ACTION.created}:AI manipulated`]: 'Composed with AI content',
    [ACTION.edited]: 'Edited with AI',
    [ACTION.inpainting]: 'Inpainted with AI',
    [ACTION.outpainting]: 'Outpainted with AI',
    [ACTION.upscaled]: 'Upscaled with AI',
};

const humanise = (action) => {
    const words = action.replace(/^c2pa\./, '').replaceAll('_', ' ');
    return words[0].toUpperCase() + words.slice(1);
};

export const isAi = (view) => view.kind !== NOT_AI;

export const sourceTypeOf = (view) => view.digitalSourceType?.replace(/^.*\//, '') ?? 'manual';

export function describe(view) {
    if (view.action === ACTION.opened) return 'Opened previous version';

    if (isAi(view)) {
        return AI_VERBS[`${view.action}:${view.kind}`] ?? AI_VERBS[view.action] ?? `${humanise(view.action)} with AI`;
    }

    if (view.action === ACTION.created) return `Created in ${view.agent}`;

    return view.description ?? humanise(view.action);
}

export const newestFirst = (timeline) =>
    [...Map.groupBy(timeline, (view) => view.manifestId).values()].flatMap((views) => views.toReversed());

export function markerOf(view, manifestId) {
    if (isAi(view)) return 'ai';

    return view.manifestId === manifestId ? 'current' : 'earlier';
}

export function credentialStatus(provenance) {
    if (!provenance) return { label: 'No credentials', tone: 'none' };

    if (provenance.aiDeclaration) return { label: provenance.aiDeclaration, tone: 'ai' };

    return { label: provenance.signerTrust === 'c2pa' ? 'Camera signed' : 'Signed', tone: 'ok' };
}
