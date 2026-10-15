import { ACCEPTED_IMAGES, chip, escape } from '../dom.mjs';
import { addChosenFile, displayName } from './sources.mjs';
import { credentialStatus } from './timeline.mjs';

function card(source) {
    const { label, tone } = credentialStatus(source.layers[0].provenance);

    return `
        <button class="card" type="button" data-source="${source.id}">
            <img class="card__image" src="${source.layers[0].image}" alt="" />
            <span class="card__body">
                <span class="card__title">${escape(displayName(source))}</span>
                ${chip(label, tone)}
            </span>
        </button>`;
}

export function mountFirstRun(root, store) {
    const samples = root.querySelector('[data-samples]');

    store.subscribe(({ sources }) => {
        samples.innerHTML = sources.map(card).join('');
    });

    samples.addEventListener('click', ({ target }) => {
        const source = target.closest('[data-source]');
        if (source) store.select(Number(source.dataset.source));
    });

    const input = root.querySelector('[data-file]');
    const zone = root.querySelector('[data-dropzone]');
    input.accept = ACCEPTED_IMAGES;
    input.addEventListener('change', () => addChosenFile(store, input));
    root.querySelector('[data-choose]').addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('is-over');
        addChosenFile(store, event.dataTransfer);
    });
}
