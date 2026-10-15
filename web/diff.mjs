export function lineDiff(before, after) {
    const a = before.split('\n');
    const b = after.split('\n');
    const width = b.length + 1;
    const lcs = new Uint32Array((a.length + 1) * width);

    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i * width + j] =
                a[i] === b[j]
                    ? lcs[(i + 1) * width + j + 1] + 1
                    : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
        }
    }

    const lines = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            lines.push({ text: a[i++], type: 'same' });
            j++;
        } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
            lines.push({ text: a[i++], type: 'remove' });
        } else {
            lines.push({ text: b[j++], type: 'add' });
        }
    }
    while (i < a.length) lines.push({ text: a[i++], type: 'remove' });
    while (j < b.length) lines.push({ text: b[j++], type: 'add' });

    return lines;
}
