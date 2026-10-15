import { refillLayerSelect } from './layer-select.mjs';
import { adjustImage } from './template-render.mjs';

const NO_CHOICE = { adjust: '', layer: '' };

const hasChoice = ({ adjust, layer }) => Boolean(layer || adjust);

const slotSelects = (form) => [...form.querySelectorAll('[data-slot]')];

export const selectBy = (form, attribute, slot) => form.querySelector(`[data-${attribute}="${slot}"]`);

export const refillLayerSelects = (form, sources) =>
    slotSelects(form).forEach((select) => refillLayerSelect(select, sources));

export const chosenLayers = (form, store) =>
    slotSelects(form)
        .map((select) => [select.dataset.slot, store.layer(Number(select.value))])
        .filter(([, layer]) => layer);

export const toolFor = (form, slot, toolById) => toolById.get(selectBy(form, 'adjust', slot).value);

export const textByName = (form) =>
    new Map([...form.querySelectorAll('[data-text]')].map((input) => [input.dataset.text, input.value]));

export const adjustedBySlot = async (picked, toolOf) =>
    new Map(
        await Promise.all(picked.map(async ([slot, layer]) => [slot, await adjustImage(layer.image, toolOf(slot))])),
    );

export const slotChoices = (form) =>
    slotSelects(form).map(({ dataset: { slot }, value }) => [
        slot,
        { adjust: selectBy(form, 'adjust', slot).value, layer: value },
    ]);

export function carriedChoices(slots, previous, firstLayerId) {
    const kept = new Map(previous);
    const firstChosen = previous.map(([, choice]) => choice).find((choice) => choice.layer) ?? NO_CHOICE;
    const choiceFor = (slot, index) => {
        const matched = kept.get(slot);
        if (matched && hasChoice(matched)) return matched;

        return index === 0 ? firstChosen : NO_CHOICE;
    };

    return slots.map((slot, index) => {
        const choice = choiceFor(slot, index);

        return [slot, index === 0 && firstLayerId ? { ...choice, layer: firstLayerId } : choice];
    });
}

export const applySlotChoices = (form, choices) =>
    choices.forEach(([slot, { adjust, layer }]) => {
        selectBy(form, 'slot', slot).value = layer;
        selectBy(form, 'adjust', slot).value = adjust;
    });
