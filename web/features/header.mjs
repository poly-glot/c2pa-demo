import { chip, download, escape, versionLabel } from '../dom.mjs';
import { aiStatus, NO_AI } from './timeline.mjs';

const READY = '<span class="label">Application is ready to use</span>';

function credentialChips(provenance) {
    if (!provenance) return chip('No credentials', 'none');

    const ai = aiStatus(provenance.timeline);
    const signature = provenance.isValid ? chip('Signature valid', 'ok') : chip('Signature NOT valid', 'bad');
    return signature + chip(ai, ai === NO_AI ? 'none' : 'ai');
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
        state.innerHTML = selectedLayer ? stateMarkup(selectedSource, selectedLayer) : READY;
    });

    downloadButton.addEventListener('click', () => download(store.selectedLayer));
}
