import { download, loadImage } from '../dom.mjs';
import { SLIDER_LABELS, TOOL_BY_ID } from '../edits/registry.mjs';
import { refillLayerSelect } from './layer-select.mjs';
import { missingInput, nextTitle, signEdit } from './edit-signing.mjs';
import { lastEditNote, PROMPT_TOOL, toolbarMarkup } from './toolbar-markup.mjs';

async function readParams(root, store, canvas, tool) {
    const field = (name) => root.querySelector(`[name="${name}"]`);
    const number = (name) => field(name)?.valueAsNumber;
    const layer = store.layer(Number(field('layer')?.value)) ?? null;
    const needsOverlay = tool.needs.includes('layer') && layer;

    return {
        layer,
        margin: number('margin'),
        overlay: needsOverlay ? await loadImage(layer.image) : null,
        prompt: field('prompt').value.trim(),
        quality: number('quality'),
        selection: canvas.selection(),
        sliders: Object.fromEntries(Object.keys(SLIDER_LABELS).map((name) => [name, number(name)])),
        strokes: canvas.strokes(),
        width: number('width'),
    };
}

function toggleBrush(brush, canvas) {
    const on = brush.getAttribute('aria-pressed') !== 'true';
    brush.setAttribute('aria-pressed', on);
    canvas.setBrush(on);
}

export function mountToolbar(root, store, canvas) {
    root.innerHTML = toolbarMarkup();
    const note = root.querySelector('[data-note]');
    const setBusy = (busy) => root.querySelectorAll('button').forEach((button) => (button.disabled = busy));

    async function run(tool) {
        const parent = store.selectedLayer;
        const params = await readParams(root, store, canvas, tool);
        const missing = missingInput(tool, params);
        if (missing) {
            note.textContent = missing;
            return;
        }

        setBusy(true);
        note.textContent = `${tool.label}: signing…`;
        try {
            const title = nextTitle(store.selectedSource);
            const { caption, image, kind, provenance } = await signEdit(tool, parent, params, title);
            store.addLayer({ ...image, caption, provenance }, tool.label);
            if (tool.mode === 'publish') download(store.selectedLayer);
            note.innerHTML = lastEditNote(caption, kind);
        } catch (error) {
            note.textContent = error.message;
        } finally {
            setBusy(false);
        }
    }

    let widthFor = null;

    store.subscribe(async ({ selectedLayer, sources }) => {
        refillLayerSelect(root.querySelector('[name="layer"]'), sources);

        const width = root.querySelector('[name="width"]');
        if (!selectedLayer || widthFor === selectedLayer) return;

        widthFor = selectedLayer;
        width.value = (await loadImage(selectedLayer.image)).naturalWidth;
    });

    root.addEventListener('click', ({ target }) => {
        const brush = target.closest('[data-brush]');
        if (brush) toggleBrush(brush, canvas);

        const tool = target.closest('[data-tool]');
        if (tool) run(TOOL_BY_ID.get(tool.dataset.tool));
    });

    root.querySelector('[data-ai-bar]').addEventListener('submit', (event) => {
        event.preventDefault();
        run(PROMPT_TOOL);
    });
}
