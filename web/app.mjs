import { api } from './api.mjs';
import { mountCanvas } from './features/canvas.mjs';
import { mountCompose, openComposeWith } from './features/compose.mjs';
import { mountCredentials } from './features/credentials.mjs';
import { mountFirstRun } from './features/first-run.mjs';
import { mountHeader } from './features/header.mjs';
import { layerFor, mountSources } from './features/sources.mjs';
import { mountToolbar } from './features/toolbar.mjs';
import { clearState, loadState, saveState } from './persistence.mjs';
import { createStore } from './store.mjs';

const STORAGE_FAILED = 'The latest change could not be saved to browser storage, so it will not survive a reload.';

const store = createStore(await loadState());
const panel = (name) => document.querySelector(`[data-${name}]`);
const storageNote = panel('storage-note');
const composeDialog = panel('compose-dialog');

store.subscribe(async ({ state }) => {
    storageNote.textContent = (await saveState(state)) ? '' : STORAGE_FAILED;
});

store.subscribe(({ selectedLayer }) => {
    panel('first-run').hidden = Boolean(selectedLayer);
    panel('editor').hidden = !selectedLayer;
});

mountHeader(panel('status-bar'), store);
mountFirstRun(panel('first-run'), store);
mountSources(panel('sources'), store);
mountToolbar(panel('toolbar'), store, mountCanvas(panel('canvas'), store));
mountCredentials(panel('credentials'), store, panel('compare-dialog'));
await mountCompose(composeDialog, store);

panel('compose').addEventListener('click', () => {
    composeDialog.showModal();
    openComposeWith(composeDialog, store.selectedLayer?.id);
});

panel('reset').addEventListener('click', async () => {
    await clearState();
    location.reload();
});

panel('logout').hidden = !(await api.session()).required;
panel('logout').addEventListener('click', async () => {
    await api.logout();
    location.reload();
});

const known = new Set(store.sources.map((source) => source.title));
for (const name of await api.samples()) {
    if (!known.has(name)) store.addSample(name, await layerFor(name, await api.sample(name)));
}
