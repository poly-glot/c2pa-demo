const highestId = (sources) => Math.max(0, ...sources.flatMap((source) => source.layers.map((layer) => layer.id)));

export function createStore(initial) {
    const listeners = new Set();
    const state = initial ?? { selected: null, sources: [] };
    const view = { before: false, fresh: null, tab: 'summary' };
    let nextId = highestId(state.sources) + 1;

    const notify = () => listeners.forEach((listener) => listener(store));
    const sourceOf = (id) => state.sources.find((source) => source.id === id);

    const pushSource = (title, layer) => {
        const id = nextId++;
        state.sources.push({ id, layers: [{ ...layer, id, parentId: null }], title });
        return id;
    };

    const store = {
        get selectedSource() {
            return state.selected && sourceOf(state.selected.sourceId);
        },
        get selectedLayer() {
            return state.selected && store.layer(state.selected.layerId);
        },
        get sources() {
            return state.sources;
        },
        get state() {
            return state;
        },
        get view() {
            return view;
        },
        addLayer(layer, label) {
            const source = store.selectedSource;
            const id = nextId++;
            source.layers.push({ ...layer, id, parentId: store.selectedLayer.id });
            view.fresh = { label, layerId: id };
            store.select(source.id, id);
        },
        addSample(title, layer) {
            pushSource(title, layer);
            notify();
        },
        addSource(title, layer) {
            store.select(pushSource(title, layer));
        },
        layer(id) {
            return state.sources.flatMap((source) => source.layers).find((layer) => layer.id === id);
        },
        select(sourceId, layerId = sourceOf(sourceId).layers[0].id) {
            state.selected = { layerId, sourceId };
            view.before = false;
            notify();
        },
        setView(patch) {
            Object.assign(view, patch);
            notify();
        },
        subscribe(listener) {
            listeners.add(listener);
            listener(store);
        },
    };

    return store;
}
