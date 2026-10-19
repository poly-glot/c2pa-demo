import { DEFAULT_BRUSH } from '../edits/canvas-ops.mjs';
import { escape, isVideo, mediaMarkup, plural, tab, versionLabel } from '../dom.mjs';

const versionTab = (layer, index, selected) => tab(versionLabel(index), layer === selected, 'layer', layer.id);

const segment = (label, pressed, before) => `
    <button class="segment ${pressed ? 'is-active' : ''}" type="button" aria-pressed="${pressed}" data-before="${before}">${label}</button>`;

export function sizeLabel(size, components) {
    if (!size) return '';

    const count = components?.length ?? 0;
    const placed = count ? ` · ${plural(count, 'placed ingredient')}` : '';
    return `${size.width} × ${size.height} px${placed}`;
}

export const shellMarkup = () => `
    <div class="canvas__bar" data-bar></div>
    <p class="canvas__notice" role="status" data-notice></p>
    <div class="canvas__stage" data-stage></div>`;

export function barMarkup({ selectedLayer, selectedSource, view }, size) {
    const compare = selectedLayer.parentId
        ? `<div class="segmented" role="group" aria-label="Show version">${segment('Before', view.before, true)}${segment('After', !view.before, false)}</div>`
        : '';

    return `
        <div class="tabs" role="tablist" aria-label="Versions">
            ${selectedSource.layers.map((layer, index) => versionTab(layer, index, selectedLayer)).join('')}
        </div>
        <div class="canvas__meta">
            <span class="label">${escape(sizeLabel(size, selectedLayer.provenance?.components))}</span>
            ${compare}
        </div>`;
}

export function noticeMarkup({ selectedLayer, view }) {
    if (view.fresh?.layerId !== selectedLayer.id) return '';

    if (!selectedLayer.provenance)
        return `
        <span class="chip is-strong">Edit applied, not signed</span>
        <span class="muted">Nothing in this image's history is AI-declared, so no manifest was written.</span>`;

    return `
        <span class="chip is-ok is-strong">Edit applied and signed</span>
        <span class="muted">${escape(view.fresh.label)} is now declared in the credentials.</span>
        <a href="#credentials">See what changed</a>`;
}

const overlayMarkup = () => `
        <svg class="preview__overlay" preserveAspectRatio="none" aria-hidden="true">
            <rect class="preview__marquee" visibility="hidden" />
            <g class="preview__strokes" fill="none" stroke="${DEFAULT_BRUSH.colour}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${DEFAULT_BRUSH.width}"></g>
        </svg>`;

export const stageMarkup = (layer) => `
    <div class="preview">
        ${mediaMarkup(layer.image, 'preview__image', { alt: layer.title, controls: true })}
        ${isVideo(layer.image) ? '' : overlayMarkup()}
    </div>`;

export const polyline = (points) => `<polyline points="${points.map(({ x, y }) => `${x},${y}`).join(' ')}" />`;
