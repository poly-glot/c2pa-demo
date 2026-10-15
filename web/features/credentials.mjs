import { openCompare } from './compare.mjs';
import { emptyPane, pane, raw, summary } from './credentials-markup.mjs';

const imagesByTitle = (sources) =>
    new Map(sources.flatMap((source) => source.layers.map((layer) => [layer.title, layer.image])));

function render({ selectedLayer, sources, view }) {
    if (!selectedLayer) return emptyPane();

    const { provenance } = selectedLayer;
    const fresh = view.fresh?.layerId === selectedLayer.id;
    const body =
        view.tab === 'raw' ? raw(provenance) : summary(provenance, { fresh, imageByTitle: imagesByTitle(sources) });

    return pane({ body, canCompare: Boolean(selectedLayer.parentId), tab: view.tab });
}

export function mountCredentials(root, store, compareDialog) {
    store.subscribe((state) => {
        root.innerHTML = render(state);
    });

    root.addEventListener('click', ({ target }) => {
        const tab = target.closest('[data-tab]');
        if (tab) store.setView({ tab: tab.dataset.tab });

        if (!target.closest('[data-compare]')) return;

        const layer = store.selectedLayer;
        openCompare(compareDialog, store.layer(layer.parentId), layer);
    });
}
