import { escape } from '../dom.mjs';
import { splitView } from './manifest-diff.mjs';

export function openCompare(dialog, parent, layer) {
    dialog.innerHTML = `
        <div class="manifest__bar">
            <span>Parent: ${escape(parent.title)}</span>
            <span>This layer: ${escape(layer.title)}</span>
            <form method="dialog"><button class="is-outline is-compact" type="submit">Close</button></form>
        </div>
        <div class="manifest__split">${splitView(parent.provenance?.store, layer.provenance?.store)}</div>`;
    dialog.showModal();
}
