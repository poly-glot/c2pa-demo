import { barMarkup, noticeMarkup, shellMarkup } from './canvas-markup.mjs';
import { mountStage } from './stage.mjs';

export function mountCanvas(root, store) {
    root.innerHTML = shellMarkup();
    const bar = root.querySelector('[data-bar]');
    const notice = root.querySelector('[data-notice]');
    let shown = null;
    let size = null;

    const stage = mountStage(root.querySelector('[data-stage]'), () => shown === store.selectedLayer);
    const renderBar = () => {
        bar.innerHTML = barMarkup(store, size);
    };

    const show = (layer) => {
        shown = layer;
        size = null;
        stage.show(layer, (loaded) => {
            size = loaded;
            renderBar();
        });
    };

    store.subscribe(({ selectedLayer, view }) => {
        if (!selectedLayer) return;

        const layer = view.before ? store.layer(selectedLayer.parentId) : selectedLayer;
        if (layer !== shown) show(layer);
        root.querySelector('[data-stage]').classList.toggle('is-static', layer !== selectedLayer);
        renderBar();
        notice.innerHTML = noticeMarkup(store);
    });

    bar.addEventListener('click', ({ target }) => {
        const version = target.closest('[data-layer]');
        if (version) store.select(store.selectedSource.id, Number(version.dataset.layer));

        const before = target.closest('[data-before]');
        if (before) store.setView({ before: before.dataset.before === 'true' });
    });

    return { selection: stage.selection, setBrush: stage.setBrush, strokes: stage.strokes };
}
