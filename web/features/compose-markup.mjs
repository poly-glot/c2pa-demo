import { ACCEPTED_IMAGES, escape } from '../dom.mjs';
import { layerSelect } from './layer-select.mjs';

const NO_ADJUSTMENT = '<option value="">No adjustment</option>';

export const adjustOptions = (tools) =>
    NO_ADJUSTMENT + tools.map((tool) => `<option value="${escape(tool.id)}">${escape(tool.label)}</option>`).join('');

const slotField = (slot, adjustments) => `
    <div class="compose__slot">
        <span class="label">${escape(slot)}</span>
        ${layerSelect(`class="compose__select" data-slot="${escape(slot)}"`)}
        <label class="compose__upload"><a>Upload</a><input type="file" accept="${ACCEPTED_IMAGES}" data-upload="${escape(slot)}" hidden /></label>
        <span class="label">Adjust</span>
        <select class="compose__select" data-adjust="${escape(slot)}">${adjustments}</select>
    </div>`;

const textField = (name, value) => `
    <div class="compose__slot">
        <span class="label">${escape(name)}</span>
        <input class="compose__select" data-text="${escape(name)}" value="${escape(value)}" />
    </div>`;

export const slotForm = ({ placeholders, slots, texts }, adjustments) => `
    ${slots.map((slot) => slotField(slot, adjustments)).join('')}
    ${texts.map((name) => textField(name, placeholders.get(name))).join('')}
    <button class="is-primary" type="submit">Render</button>
    <span class="compose__status" aria-live="polite"></span>`;

export const shell = (templates) => `
    <div class="compose__bar">
        <span class="label">Compose from template</span>
        <select class="compose__select" data-template>${templates.map((name) => `<option>${escape(name)}</option>`).join('')}</select>
        <button type="button" data-close>Close</button>
    </div>
    <div class="compose__body">
        <div class="compose__preview"><img class="compose__image" alt="Template preview" /></div>
        <form class="compose__form" data-form></form>
    </div>`;
