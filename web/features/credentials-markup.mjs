import { ACTION } from '../actions.mjs';
import { chip, escape, plural, tab } from '../dom.mjs';
import { pretty } from './manifest-diff.mjs';
import { describe, isAi, markerOf, newestFirst, sourceTypeOf } from './timeline.mjs';

const CHECK = '<path d="M5 12l5 5 9-10"></path>';
const CROSS = '<path d="M6 6l12 12M18 6L6 18"></path>';

const TRUST = {
    c2pa: { text: 'On the C2PA trust list', tone: 'ok' },
    none: { text: 'Untrusted signer', tone: 'bad' },
    user: {
        text: "Test certificate: trusted by this demo's own anchors, not on the C2PA trust list.",
        tone: 'caution',
    },
};

const HEADING = '<h2 class="label credentials__title">Content credentials</h2>';

const icon = (path) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

export const emptyPane = () => `
    <div class="credentials__head">${HEADING}</div>
    <div class="credentials__empty">
        <svg class="credentials__empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"></path></svg>
        <span class="credentials__headline">Nothing to verify yet</span>
        <span class="muted">Open an image and its signature, history and ingredients will appear here.</span>
    </div>`;

function signature({ failures, isValid, signer, signerTrust }) {
    const trust = TRUST[signerTrust];
    const failureList = failures.length
        ? `<ul class="signature__failures">${failures.map((failure) => `<li>${escape(failure)}</li>`).join('')}</ul>`
        : '';

    return `
        <section class="signature">
            <div class="signature__row">
                <span class="signature__mark ${isValid ? 'is-ok' : 'is-bad'}">${icon(isValid ? CHECK : CROSS)}</span>
                <div class="signature__text">
                    <span class="signature__title">${isValid ? 'Signature valid' : 'Signature NOT valid'}</span>
                    <span class="muted">Signed by ${escape(signer)}</span>
                </div>
            </div>
            <p class="signature__note is-${trust.tone}">${trust.text}</p>
            ${failureList}
        </section>`;
}

const unsigned = () => `
    <section class="signature">
        <div class="signature__row">
            <span class="signature__mark is-none">${icon(CROSS)}</span>
            <div class="signature__text">
                <span class="signature__title">No credentials</span>
                <span class="muted">Nothing machine-readable says how this image was made or changed.</span>
            </div>
        </div>
    </section>`;

function facts({ claimGenerator, timeline }) {
    const aiCount = timeline.filter(isAi).length;
    const ai = aiCount
        ? `<dd class="facts__value is-ai">${plural(aiCount, 'AI action')} declared</dd>`
        : '<dd class="facts__value">None declared</dd>';
    const generator = claimGenerator
        ? `${escape(claimGenerator.name)} <span class="mono muted">${escape(claimGenerator.version ?? '')}</span>`
        : 'Unknown';

    return `
        <dl class="facts">
            <div class="facts__item"><dt class="label">AI content</dt>${ai}</div>
            <div class="facts__item"><dt class="label">Produced with</dt><dd class="facts__value">${generator}</dd></div>
        </dl>`;
}

function noteOf(view, { manifestId, parent }) {
    if (view.action !== ACTION.opened || view.manifestId !== manifestId || !parent) return '';

    return ` · parent ${escape(parent.title)}, ${parent.carriesManifest ? 'signed' : 'no credentials'}`;
}

const entry = (view, provenance, isNew) => `
    <li class="timeline__item">
        <span class="timeline__rail"><span class="timeline__marker is-${markerOf(view, provenance.manifestId)}"></span></span>
        <span class="timeline__text">
            <span class="timeline__title">${escape(describe(view))}${isNew ? ' <span class="label timeline__new">New</span>' : ''}</span>
            <span class="timeline__meta"><span class="mono">${escape(view.action)}</span> · <span class="mono">${escape(sourceTypeOf(view))}</span>${noteOf(view, provenance)}</span>
        </span>
    </li>`;

function earlier(views, provenance) {
    if (!views.length) return '';

    const versions = new Set(views.map((view) => view.manifestId)).size;
    return `
        <details class="timeline__earlier">
            <summary class="label">Earlier: ${plural(views.length, 'action')} in ${plural(versions, 'earlier version')}</summary>
            <ol class="timeline">${views.map((view) => entry(view, provenance, false)).join('')}</ol>
        </details>`;
}

function timeline(provenance, fresh) {
    const views = newestFirst(provenance.timeline);
    const recent = new Set([provenance.manifestId, provenance.parentManifestId]);
    const shown = views.filter((view) => recent.has(view.manifestId));
    const older = views.filter((view) => !recent.has(view.manifestId));
    const isNew = (view, index) => fresh && index === 0 && view.manifestId === provenance.manifestId;

    return `
        <section class="credentials__section">
            <h3 class="label">What happened to this image</h3>
            <ol class="timeline">${shown.map((view, index) => entry(view, provenance, isNew(view, index))).join('')}</ol>
            ${earlier(older, provenance)}
        </section>`;
}

function ingredient({ carriesManifest, relationship, title }, imageByTitle) {
    const image = imageByTitle.get(title);
    const thumb = image
        ? `<img class="ingredient__thumb" src="${image}" alt="" />`
        : '<span class="ingredient__thumb"></span>';

    return `
        <li class="ingredient">
            ${thumb}
            <span class="ingredient__text">
                <span class="ingredient__name">${escape(title)}</span>
                <span class="ingredient__meta">${relationship}</span>
            </span>
            ${carriesManifest ? chip('Signed', 'ok') : chip('No credentials', 'none')}
        </li>`;
}

function ingredients({ components, parent }, imageByTitle) {
    const all = [
        ...(parent ? [{ ...parent, relationship: 'parentOf' }] : []),
        ...components.map((component) => ({ ...component, relationship: 'componentOf' })),
    ];
    if (!all.length) return '';

    return `
        <section class="credentials__section">
            <h3 class="label">Ingredients · ${all.length}</h3>
            <ul class="ingredients">${all.map((item) => ingredient(item, imageByTitle)).join('')}</ul>
        </section>`;
}

const technical = ({ instanceId, manifestId, parentManifestId }) => `
    <details class="technical">
        <summary class="label technical__summary">Technical details</summary>
        <dl class="technical__list mono">
            <dt>manifest</dt><dd>${escape(manifestId ?? '—')}</dd>
            <dt>parent</dt><dd>${escape(parentManifestId ?? '—')}</dd>
            <dt>instance</dt><dd>${escape(instanceId ?? '—')}</dd>
        </dl>
    </details>`;

export function summary(provenance, { fresh, imageByTitle }) {
    if (!provenance) return unsigned();

    return [
        signature(provenance),
        facts(provenance),
        timeline(provenance, fresh),
        ingredients(provenance, imageByTitle),
        technical(provenance),
    ].join('');
}

export const raw = (provenance) => `<pre class="raw">${escape(pretty(provenance?.store))}</pre>`;

const viewTab = (id, label, active) => tab(label, id === active, 'tab', id);

const COMPARE_HINT = '<span class="hint">Make an edit to compare manifests side by side.</span>';

export const pane = ({ body, canCompare, tab: active }) => `
    <div class="credentials__head is-tabbed">
        ${HEADING}
        <div class="tabs" role="tablist" aria-label="Credentials view">
            ${viewTab('summary', 'Summary', active)}${viewTab('raw', 'Raw manifest', active)}
        </div>
    </div>
    <div class="credentials__body" role="tabpanel">${body}</div>
    <div class="credentials__foot">
        <button class="is-outline" type="button" data-compare ${canCompare ? '' : 'disabled'}>Compare with previous version</button>
        ${canCompare ? '' : COMPARE_HINT}
    </div>`;
