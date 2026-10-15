import { escape, plural } from '../dom.mjs';

const OPEN_DEPTH = 2;

const normaliseQuery = (query) => query.trim().toLowerCase();

const matches = (text, query) => Boolean(query) && text.toLowerCase().includes(query);

function highlight(text, query) {
    if (!matches(text, query)) return escape(text);

    const lower = text.toLowerCase();
    let html = '';
    let from = 0;
    let at = lower.indexOf(query);

    while (at !== -1) {
        html += `${escape(text.slice(from, at))}<mark>${escape(text.slice(at, at + query.length))}</mark>`;
        from = at + query.length;
        at = lower.indexOf(query, from);
    }

    return html + escape(text.slice(from));
}

const isBranch = (value) => value !== null && typeof value === 'object';

const typeOf = (value) => (value === null ? 'null' : typeof value);

const entriesOf = (value) =>
    Array.isArray(value)
        ? value.map((item, index) => [String(index), item, ''])
        : Object.entries(value).map(([key, item]) => [key, item, key]);

const sizeOf = (value) => (Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`);

const keyHtml = (label, query) => `<span class="tree__key">${highlight(label, query)}</span>`;

function leaf(label, value, searchKey, query) {
    const text = JSON.stringify(value);
    const hits = Number(matches(searchKey, query)) + Number(matches(text, query));
    const html = `<li class="tree__row">${keyHtml(label, query)}: <span class="tree__value is-${typeOf(value)}">${highlight(text, query)}</span></li>`;

    return { hits, html };
}

function branch(label, value, searchKey, query, depth) {
    const children = entriesOf(value).map(([childLabel, child, childKey]) =>
        node(childLabel, child, childKey, query, depth + 1),
    );
    const hits = Number(matches(searchKey, query)) + children.reduce((sum, child) => sum + child.hits, 0);
    const open = query ? hits > 0 : depth < OPEN_DEPTH;
    const html = `
        <li class="tree__node">
            <details class="tree__branch" ${open ? 'open' : ''}>
                <summary class="tree__row">${keyHtml(label, query)} <span class="tree__size">${sizeOf(value)}</span></summary>
                <ul class="tree">${children.map((child) => child.html).join('')}</ul>
            </details>
        </li>`;

    return { hits, html };
}

function node(label, value, searchKey, query, depth) {
    const result =
        isBranch(value) && Object.keys(value).length
            ? branch(label, value, searchKey, query, depth)
            : leaf(label, value, searchKey, query);
    if (query && !result.hits) return { hits: 0, html: '' };

    return result;
}

export function jsonTree(value, rawQuery = '') {
    const query = normaliseQuery(rawQuery);
    const nodes = entriesOf(value).map(([label, item, key]) => node(label, item, key, query, 0));
    const hits = nodes.reduce((sum, item) => sum + item.hits, 0);
    const status = query ? `<p class="tree__status muted">${hits ? plural(hits, 'hit') : 'No hits'}</p>` : '';

    return `${status}<ul class="tree is-root">${nodes.map((item) => item.html).join('')}</ul>`;
}
