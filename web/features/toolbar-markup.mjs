import { escape } from '../dom.mjs';
import { layerSelect } from './layer-select.mjs';
import { SLIDER_LABELS, TOOL_BY_ID, TOOLS, UNCHANGED_PERCENT, VIDEO_TOOLS } from '../edits/registry.mjs';

const AI_NOTE =
    'AI edits are declared in the credentials with an AI <span class="mono">digitalSourceType</span>, so viewers can tell them from manual adjustments.';

const ICON_ATTRIBUTES =
    'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const ICONS = {
    blackAndWhite: `<svg ${ICON_ATTRIBUTES}><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"></path></svg>`,
    chevron: `<svg ${ICON_ATTRIBUTES}><path d="M6 9l6 6 6-6"></path></svg>`,
    crop: `<svg ${ICON_ATTRIBUTES}><path d="M6 2v16h16M2 6h16v16"></path></svg>`,
    resize: `<svg ${ICON_ATTRIBUTES}><path d="M4 14v6h6M20 10V4h-6M20 4l-7 7M4 20l7-7"></path></svg>`,
    sharpen: `<svg ${ICON_ATTRIBUTES}><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"></path></svg>`,
    sparkle: `<svg ${ICON_ATTRIBUTES}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"></path></svg>`,
};

const PRIMARY_IDS = ['blackAndWhite', 'sharpen', 'resize', 'crop'];

const CONTROLS = {
    layer: `<label class="field">Layer ${layerSelect('class="field__input" name="layer"')}</label>`,
    margin: `<label class="field">Margin <input class="field__input is-number" type="number" name="margin" min="8" max="1024" value="128" /> px</label>`,
    quality: `<label class="field">Quality <input class="field__range" type="range" name="quality" min="1" max="100" value="80" /></label>`,
    sliders: Object.entries(SLIDER_LABELS)
        .map(
            ([name, label]) =>
                `<label class="field">${label} <input class="field__range" type="range" name="${name}" min="0" max="200" value="${UNCHANGED_PERCENT}" /></label>`,
        )
        .join(''),
    strokes: `<button class="is-compact" type="button" aria-pressed="false" data-brush>Brush</button>`,
};

export const PROMPT_TOOL = TOOL_BY_ID.get('aiEdit');
const PRIMARY_TOOLS = PRIMARY_IDS.map((id) => TOOL_BY_ID.get(id));
const SURFACED_TOOLS = new Set([PROMPT_TOOL, ...PRIMARY_TOOLS]);
const ADVANCED_TOOLS = TOOLS.filter((tool) => !SURFACED_TOOLS.has(tool));

const toolButton = (tool) =>
    `<button class="is-compact" type="button" data-tool="${tool.id}">${escape(tool.label)}</button>`;

const primaryButton = (tool) =>
    `<button class="tool" type="button" data-tool="${tool.id}">${ICONS[tool.id]}${escape(tool.label)}</button>`;

const resizeControl = (tool) => `
    <span class="tool tool--split">
        <button class="tool__action" type="button" data-tool="${tool.id}">${ICONS.resize}${escape(tool.label)}</button>
        <input class="tool__width mono" type="number" name="width" min="16" step="1" aria-label="Width in pixels" />
        <span class="tool__unit mono">px</span>
    </span>`;

const primaryRow = () => `
    <div class="toolbar__row">
        <span class="label">Adjust</span>
        ${PRIMARY_TOOLS.map((tool) => (tool.id === 'resize' ? resizeControl(tool) : primaryButton(tool))).join('')}
        <span class="hint toolbar__hint">Adjustments are signed as manual edits once the image carries AI</span>
    </div>`;

function groupRows(tools) {
    const rendered = new Set();
    const controlsFor = (group) => {
        const needs = [...new Set(group.flatMap((tool) => tool.needs))].filter(
            (need) => CONTROLS[need] && !rendered.has(need),
        );
        needs.forEach((need) => rendered.add(need));

        return needs.map((need) => CONTROLS[need]).join('');
    };

    return [...Map.groupBy(tools, (tool) => tool.group)].map(
        ([group, members]) => `
            <div class="toolbar__row">
                <span class="label toolbar__group">${escape(group)}</span>
                ${members.map(toolButton).join('')}
                ${controlsFor(members)}
            </div>`,
    );
}

const advancedSection = () => `
    <details class="advanced">
        <summary class="advanced__summary">${ICONS.chevron}Advanced filters</summary>
        <div class="advanced__body">${groupRows(ADVANCED_TOOLS).join('')}</div>
    </details>`;

export const lastEditNote = (caption, kind, signed) =>
    signed
        ? `Last edit: “${escape(caption)}” · recorded as <span class="mono">${escape(kind)}</span>.`
        : `Last edit: “${escape(caption)}” · not signed, nothing in this image's history is AI-declared.`;

const videoRow = () => {
    const [transcode, resize] = VIDEO_TOOLS;

    return `
    <div class="toolbar__row" data-video-tools hidden>
        <span class="label">Video</span>
        <button class="tool" type="button" data-tool="${transcode.id}">${escape(transcode.label)}</button>
        <span class="tool tool--split">
            <button class="tool__action" type="button" data-tool="${resize.id}">${ICONS.resize}${escape(resize.label)}</button>
            <input class="tool__width mono" type="number" name="videoWidth" min="16" step="2" value="640" aria-label="Width in pixels" />
            <span class="tool__unit mono">px</span>
        </span>
        <span class="hint toolbar__hint">Re-encoded on the server; signed with the source as parent when the clip carries AI</span>
    </div>`;
};

export const toolbarMarkup = () => `
    ${videoRow()}
    <div class="toolbar__tools" data-image-tools>
        ${primaryRow()}
        <form class="ai-bar" data-ai-bar>
            <label class="label ai-bar__label" for="ai-prompt">${ICONS.sparkle}${escape(PROMPT_TOOL.label)}</label>
            <input class="ai-bar__input" id="ai-prompt" name="prompt" placeholder="Describe a change, e.g. “Make the sky overcast”" />
            <button class="is-primary" type="submit">Generate edit</button>
        </form>
    </div>
    <p class="hint" aria-live="polite" data-note>${AI_NOTE}</p>
    <div data-image-tools>${advancedSection()}</div>`;
