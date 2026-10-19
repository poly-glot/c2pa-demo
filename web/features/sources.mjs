import { api } from '../api.mjs';
import { ACCEPTED_MEDIA, escape, fileStem, mediaMarkup, toDataUri } from '../dom.mjs';
import { generateMarkup, mountGenerate } from './generate.mjs';
import { credentialStatus } from './timeline.mjs';

const SAMPLE_NAMES = {
    'Mountain-Lake_Photo_Unsplash_1600x1067.jpg': 'Mountain lake',
    'NOVA-SPK-500ML_Hero_Studio_2400x2400_AI-Generated_DAT-Create.jpg': 'NOVA sparkling water',
    'Reference-Clip_AI-Generated_DAT-Create.mp4': 'Reference AI clip',
    'truepic-20230212-library.jpg': 'Library interior',
};

const SHORT_STATUS = { 'AI edited': 'AI edit', 'AI generated': 'AI', 'Camera signed': 'camera', Signed: 'signed' };

export const displayName = (source) => SAMPLE_NAMES[source.title] ?? fileStem(source.title);

export const layerFor = async (title, image) => ({ image, provenance: await api.provenance(image, title), title });

export async function addSource(store, title, image) {
    store.addSource(title, await layerFor(title, image));
}

export async function addChosenFile(store, { files }) {
    const [file] = files ?? [];
    if (file) await addSource(store, file.name, await toDataUri(file));
}

function thumb(source, active) {
    const status = SHORT_STATUS[credentialStatus(source.layers.at(-1).provenance).label];
    const label = status ? `${displayName(source)} · ${status}` : displayName(source);

    return `
        <button class="thumb ${active ? 'is-active' : ''}" type="button" data-source="${source.id}" ${active ? 'aria-current="true"' : ''}>
            ${mediaMarkup(source.layers[0].image, 'thumb__image')}
            <span class="label thumb__label">${escape(label)}</span>
        </button>`;
}

const render = ({ selectedSource, sources }) => `
    <div class="sources__bar">
        <h2 class="label">Sources</h2>
        <button class="is-compact" type="button" data-upload>Upload file</button>
        <input type="file" accept="${ACCEPTED_MEDIA}" aria-label="Upload file" hidden data-file />
    </div>
    ${generateMarkup()}
    <nav class="sources__list" aria-label="Source images">
        ${sources.map((source) => thumb(source, source === selectedSource)).join('')}
    </nav>`;

export function mountSources(root, store) {
    store.subscribe((state) => {
        root.innerHTML = render(state);
    });

    mountGenerate(root, store);

    root.addEventListener('click', ({ target }) => {
        if (target.closest('[data-upload]')) root.querySelector('[data-file]').click();

        const source = target.closest('[data-source]');
        if (source) store.select(Number(source.dataset.source));
    });

    root.addEventListener('change', ({ target }) => addChosenFile(store, target));
}
