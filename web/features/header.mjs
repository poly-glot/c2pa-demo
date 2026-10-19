import { chip, download, escape, mimeOf, versionLabel } from '../dom.mjs';
import { NO_AI } from './timeline.mjs';

const READY = '<span class="label">Application is ready to use</span>';

const FORMAT_NAMES = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'video/mp4': 'MP4' };

export function downloadLabel(layer) {
    if (!layer) return 'Download';

    const signed = layer.provenance ? 'signed ' : '';
    return `Download ${signed}${FORMAT_NAMES[mimeOf(layer.image)] ?? 'file'}`;
}

function credentialChips(provenance) {
    if (!provenance) return chip('No credentials', 'none');

    const signature = provenance.isValid ? chip('Signature valid', 'ok') : chip('Signature NOT valid', 'bad');
    const { aiDeclaration } = provenance;
    return signature + (aiDeclaration ? chip(aiDeclaration, 'ai') : chip(NO_AI, 'none'));
}

function stateMarkup(source, layer) {
    const index = source.layers.indexOf(layer);
    const version = index ? ` · ${versionLabel(index)}` : '';

    return `
        <span class="label mono status-bar__file">${escape(source.title + version)}</span>
        ${credentialChips(layer.provenance)}`;
}

export function mountHeader(root, store) {
    const state = root.querySelector('[data-state]');
    const downloadButton = root.querySelector('[data-download]');

    store.subscribe(({ selectedLayer, selectedSource }) => {
        downloadButton.disabled = !selectedLayer;
        downloadButton.textContent = downloadLabel(selectedLayer);
        state.innerHTML = selectedLayer ? stateMarkup(selectedSource, selectedLayer) : READY;
    });

    downloadButton.addEventListener('click', () => download(store.selectedLayer));
}
