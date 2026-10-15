import { openCompare } from './compare.mjs';
import { emptyPane, pane, raw, summary } from './credentials-markup.mjs';
import { jsonTree } from './json-tree.mjs';
import { pretty } from './manifest-diff.mjs';
import { provenanceGraph } from './provenance-graph.mjs';
import { provenanceView, selectedNode } from './provenance-markup.mjs';

const imagesByTitle = (sources) =>
    new Map(sources.flatMap((source) => source.layers.map((layer) => [layer.title, layer.image])));

const thumbnailSource = (provenance, imageByTitle) => (node) =>
    provenance.thumbnails?.[node.thumbnail] ?? imageByTitle.get(node.title) ?? null;

function body(tab, provenance, sources, fresh) {
    if (tab === 'raw') return raw(provenance);

    const imageByTitle = imagesByTitle(sources);
    if (tab === 'provenance') return provenanceView(provenance, thumbnailSource(provenance, imageByTitle));

    return summary(provenance, { fresh, imageByTitle });
}

function render({ selectedLayer, sources, view }) {
    if (!selectedLayer) return emptyPane();

    const fresh = view.fresh?.layerId === selectedLayer.id;

    return pane({
        body: body(view.tab, selectedLayer.provenance, sources, fresh),
        canCompare: Boolean(selectedLayer.parentId),
        tab: view.tab,
    });
}

function selectNode(root, store, path) {
    root.querySelectorAll('[data-node]').forEach((card) =>
        card.setAttribute('aria-pressed', String(card.dataset.node === path)),
    );

    const { provenance } = store.selectedLayer;
    const srcOf = thumbnailSource(provenance, imagesByTitle(store.sources));
    root.querySelector('[data-node-detail]').innerHTML = selectedNode(provenanceGraph(provenance.store), path, srcOf);
}

const COPIED_FOR_MS = 1500;

async function copyManifest(button, manifest) {
    await navigator.clipboard.writeText(pretty(manifest));

    const label = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = label), COPIED_FOR_MS);
}

const setAllOpen = (root, open) => root.querySelectorAll('.tree__branch').forEach((branch) => (branch.open = open));

export function mountCredentials(root, store, compareDialog) {
    store.subscribe((state) => {
        root.innerHTML = render(state);
    });

    root.addEventListener('input', ({ target }) => {
        if (!target.matches('[data-raw-search]')) return;

        root.querySelector('[data-raw-tree]').innerHTML = jsonTree(store.selectedLayer.provenance.store, target.value);
    });

    root.addEventListener('click', ({ target }) => {
        const tab = target.closest('[data-tab]');
        if (tab) store.setView({ tab: tab.dataset.tab });

        const node = target.closest('[data-node]');
        if (node) selectNode(root, store, node.dataset.node);

        if (target.closest('[data-raw-expand]')) setAllOpen(root, true);
        if (target.closest('[data-raw-collapse]')) setAllOpen(root, false);

        const copy = target.closest('[data-raw-copy]');
        if (copy) copyManifest(copy, store.selectedLayer.provenance.store);

        if (!target.closest('[data-compare]')) return;

        const layer = store.selectedLayer;
        openCompare(compareDialog, store.layer(layer.parentId), layer);
    });
}
