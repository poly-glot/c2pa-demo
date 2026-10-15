import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carriedChoices } from '../web/features/compose-form.mjs';
import { adjustOptions, slotForm } from '../web/features/compose-markup.mjs';
import { componentFor, composeTitle, fillTemplate } from '../web/features/template-render.mjs';

const element = (dataset) => ({ dataset, src: undefined, textContent: 'placeholder' });

test('slotForm renders a layer, adjust and text field per slot', () => {
    const template = { placeholders: new Map([['headline', 'Say <it>']]), slots: ['hero'], texts: ['headline'] };
    const markup = slotForm(template, adjustOptions([{ id: 'sepia', label: 'Sepia' }]));

    assert.match(markup, /data-slot="hero"/);
    assert.match(markup, /data-adjust="hero"[^>]*>.*No adjustment.*value="sepia"/s);
    assert.match(markup, /data-text="headline" value="Say &lt;it&gt;"/);
});

test('componentFor records the tool edit only when an adjustment is chosen', () => {
    const layer = { image: 'data:a', title: 'lake.jpg' };
    const tool = { edit: () => ({ description: 'Sepia', kind: 'c2pa.filtered' }) };

    assert.deepEqual(componentFor('left', layer, tool), {
        edits: [{ description: 'Sepia', kind: 'c2pa.filtered' }],
        image: 'data:a',
        slot: 'left',
        title: 'lake.jpg',
    });
    assert.deepEqual(componentFor('left', layer, undefined).edits, []);
});

test('composeTitle strips the extension and numbers the result', () => {
    assert.equal(composeTitle('two-up.html', 3), 'two-up_3');
});

test('fillTemplate fills image and text slots and keeps unset text', () => {
    const image = element({ slot: 'hero' });
    const headline = element({ text: 'headline' });
    const caption = element({ text: 'caption' });
    const body = {
        cloneNode: () => body,
        querySelectorAll: (selector) => (selector === '[data-slot]' ? [image] : [headline, caption]),
    };

    fillTemplate(body, new Map([['hero', 'data:x']]), new Map([['headline', 'Hello']]));

    assert.equal(image.src, 'data:x');
    assert.equal(headline.textContent, 'Hello');
    assert.equal(caption.textContent, 'placeholder');
});

test('carriedChoices keeps any choice by slot name and falls back to the first chosen slot', () => {
    const none = { adjust: '', layer: '' };
    const sepiaLeft = { adjust: 'sepia', layer: '4' };
    const plainRight = { adjust: '', layer: '5' };
    const previous = [
        ['left', sepiaLeft],
        ['right', plainRight],
    ];

    assert.deepEqual(carriedChoices(['left', 'centre'], previous), [
        ['left', sepiaLeft],
        ['centre', none],
    ]);
    assert.deepEqual(carriedChoices(['hero'], previous), [['hero', sepiaLeft]]);
    assert.deepEqual(carriedChoices(['left'], previous, 9), [['left', { adjust: 'sepia', layer: 9 }]]);
    const blurOnly = { adjust: 'blur', layer: '' };
    assert.deepEqual(carriedChoices(['left'], [['left', blurOnly], ...previous.slice(1)]), [['left', blurOnly]]);
    assert.deepEqual(carriedChoices(['left'], [['left', none], ...previous.slice(1)]), [['left', plainRight]]);
});
