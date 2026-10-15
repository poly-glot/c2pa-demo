import { escape } from '../dom.mjs';
import { lineDiff } from '../diff.mjs';

export const pretty = (value) => JSON.stringify(value ?? null, null, 2);

const line = (type, text) => `<span class="manifest__line is-${type}">${escape(text)}</span>`;

function pairRows(lines) {
    const rows = [];
    const pendingRemovals = [];
    const flushRemovals = () => {
        while (pendingRemovals.length) rows.push({ left: line('remove', pendingRemovals.shift()), right: '' });
    };

    for (const { text, type } of lines) {
        if (type === 'remove') pendingRemovals.push(text);
        else if (type === 'add')
            rows.push({
                left: pendingRemovals.length ? line('remove', pendingRemovals.shift()) : '',
                right: line('add', text),
            });
        else {
            flushRemovals();
            rows.push({ left: line('same', text), right: line('same', text) });
        }
    }
    flushRemovals();
    return rows;
}

export function splitView(before, after) {
    return pairRows(lineDiff(pretty(before), pretty(after)))
        .map(({ left, right }) => `<div class="manifest__cell">${left}</div><div class="manifest__cell">${right}</div>`)
        .join('');
}
