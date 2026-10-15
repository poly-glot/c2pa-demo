import { chip, escape, plural } from '../dom.mjs';
import { countIngredients, nodeAt, provenanceGraph, ROOT_PATH } from './provenance-graph.mjs';

const ROOT_NOTE = "This file's own manifest. Everything below is what it declares it was made from.";
const SIGNED_NOTE = 'Carries its own signed manifest, so its declared history was verified when this file was read.';
const UNSIGNED_NOTE = 'No embedded manifest, so nothing machine-readable says how this ingredient was made.';
const NO_CREDENTIALS = '<p class="muted">No credentials, so there is no provenance chain to show.</p>';

const status = (node) => (node.signer ? chip('Signed', 'ok') : chip('No credentials', 'none'));

function thumb(node, srcOf, className) {
    const src = srcOf(node);

    return src ? `<img class="${className}" src="${src}" alt="" />` : `<span class="${className}"></span>`;
}

const card = (node, path, srcOf) => `
    <button class="chain__card" type="button" data-node="${path}" aria-pressed="${path === ROOT_PATH}">
        ${thumb(node, srcOf, 'chain__thumb')}
        <span class="chain__text">
            <span class="label chain__kind">${node.kind}</span>
            ${status(node)}
            <span class="chain__title">${escape(node.title)}</span>
            ${node.signer ? `<span class="chain__signer">${escape(node.signer)}</span>` : ''}
        </span>
    </button>`;

const branch = (node, path, srcOf) => `
    <li class="chain__node">
        ${card(node, path, srcOf)}
        ${node.children.length ? `<ul class="chain__children">${node.children.map((child, index) => branch(child, `${path}.${index}`, srcOf)).join('')}</ul>` : ''}
    </li>`;

const noteOf = (node, path) => {
    if (path === ROOT_PATH) return ROOT_NOTE;

    return node.signer ? SIGNED_NOTE : UNSIGNED_NOTE;
};

export const selectedNode = (graph, path, srcOf) => {
    const node = nodeAt(graph, path);

    return `
    <h3 class="label">Selected node</h3>
    <div class="chain__selected">
        ${thumb(node, srcOf, 'chain__preview')}
        <div class="chain__selected-text">
            <span class="chain__kind-row"><span class="label">${node.kind}</span>${status(node)}</span>
            <span class="chain__selected-title">${escape(node.title)}</span>
            <span class="muted">${node.signer ? `Signed by ${escape(node.signer)}` : 'No embedded signer or manifest'}</span>
            ${node.format ? `<span class="mono muted">${escape(node.format)}</span>` : ''}
        </div>
    </div>
    <p class="muted chain__note">${noteOf(node, path)}</p>`;
};

const headline = (count) =>
    count ? `${plural(count, 'ingredient')} in the provenance chain` : 'No ingredients declared';

export function provenanceView(provenance, srcOf) {
    if (!provenance) return NO_CREDENTIALS;

    const graph = provenanceGraph(provenance.store);

    return `
    <section class="credentials__section chain">
        <div class="chain__head">
            <h3 class="label">Provenance</h3>
            <span class="muted">${headline(countIngredients(graph))}</span>
        </div>
        <div class="chain__scroll"><ul class="chain__tree">${branch(graph, ROOT_PATH, srcOf)}</ul></div>
        <div class="chain__detail" data-node-detail>${selectedNode(graph, ROOT_PATH, srcOf)}</div>
    </section>`;
}
