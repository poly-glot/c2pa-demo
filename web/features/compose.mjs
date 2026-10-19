import { api } from '../api.mjs';
import { TOOLS } from '../edits/registry.mjs';
import { toDataUri } from '../dom.mjs';
import { adjustOptions, shell, slotForm } from './compose-markup.mjs';
import {
    adjustedBySlot,
    applySlotChoices,
    carriedChoices,
    chosenLayers,
    refillLayerSelects,
    selectBy,
    slotChoices,
    textByName,
    toolFor,
} from './compose-form.mjs';
import { addSource } from './sources.mjs';
import {
    componentFor,
    composeTitle,
    parseTemplate,
    rasterize,
    svgToDataUri,
    templateToSvg,
} from './template-render.mjs';

const isSlotAdjustment = (tool) => tool.mode === 'manual' && tool.needs.length === 0 && tool.group !== 'Export';
const SLOT_TOOLS = TOOLS.filter(isSlotAdjustment);
const TOOL_BY_ID = new Map(SLOT_TOOLS.map((tool) => [tool.id, tool]));

export const openComposeWith = (dialog, layerId) =>
    dialog.dispatchEvent(new CustomEvent('open', { detail: { layerId } }));

async function signComposition(store, { images, picked, template, templateName, text, toolOf }) {
    const components = picked.map(([slot, layer]) => componentFor(slot, layer, toolOf(slot)));
    const rendered = await rasterize(templateToSvg(template, images, text), template);
    const title = composeTitle(templateName, store.sources.length + 1);
    const { image, provenance } = await api.templateEdit(components, rendered, title);
    store.addSource(image.title, { ...image, caption: `Template ${templateName}`, provenance });
}

export async function mountCompose(dialog, store) {
    dialog.innerHTML = shell(await api.templates());
    const form = dialog.querySelector('[data-form]');
    const preview = dialog.querySelector('.compose__image');
    const templateSelect = dialog.querySelector('[data-template]');
    let template = null;
    let renderToken = 0;
    const remembered = new Map();

    const toolOf = (slot) => toolFor(form, slot, TOOL_BY_ID);
    const adjusted = () => adjustedBySlot(chosenLayers(form, store), toolOf);

    const refreshPreview = async () => {
        const token = ++renderToken;
        const images = await adjusted();
        if (token === renderToken) preview.src = svgToDataUri(templateToSvg(template, images, textByName(form)));
    };

    const loadTemplate = async ({ detail }) => {
        const leaving = slotChoices(form);
        for (const [slot, choice] of leaving) remembered.set(slot, choice);

        template = parseTemplate(await api.template(templateSelect.value));
        form.innerHTML = slotForm(template, adjustOptions(SLOT_TOOLS));
        refillLayerSelects(form, store.sources);
        applySlotChoices(form, carriedChoices(template.slots, [...leaving, ...remembered], detail?.layerId));
        refreshPreview();
    };

    const upload = async (input) => {
        await addSource(store, input.files[0].name, await toDataUri(input.files[0]));
        refillLayerSelects(form, store.sources);
        selectBy(form, 'slot', input.dataset.upload).value = store.selectedLayer.id;
    };

    const submit = async () => {
        const status = form.querySelector('.compose__status');
        const button = form.querySelector('button');
        const picked = chosenLayers(form, store);
        if (picked.length < template.slots.length) {
            status.textContent = 'Fill every slot first.';
            return;
        }

        button.disabled = true;
        status.textContent = 'Rendering, then signing…';
        try {
            const images = await adjusted();
            const text = textByName(form);
            await signComposition(store, {
                images,
                picked,
                template,
                templateName: templateSelect.value,
                text,
                toolOf,
            });
            status.textContent = '';
            dialog.close();
        } catch (error) {
            status.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    };

    dialog.addEventListener('open', loadTemplate);
    templateSelect.addEventListener('change', loadTemplate);
    form.addEventListener('input', refreshPreview);
    form.addEventListener('change', async ({ target }) => {
        if (target.files?.length) await upload(target);
        refreshPreview();
    });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit();
    });
    dialog.addEventListener('click', ({ target }) => {
        if (target.closest('[data-close]')) dialog.close();
    });
}
