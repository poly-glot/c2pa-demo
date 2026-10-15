import { escape } from '../dom.mjs';

const EMPTY_OPTION = '<option value="">Choose an image</option>';

const layerLabel = (source, index) => `${source.title} · ${index ? `Edit ${index}` : 'Original'}`;

const layerOptions = (sources) =>
    sources
        .flatMap((source) =>
            source.layers.map(
                (layer, index) => `<option value="${layer.id}">${escape(layerLabel(source, index))}</option>`,
            ),
        )
        .join('');

export const layerSelect = (attributes) => `<select ${attributes}>${EMPTY_OPTION}</select>`;

export function refillLayerSelect(select, sources) {
    const { value } = select;
    select.innerHTML = EMPTY_OPTION + layerOptions(sources);
    select.value = value;
}
