import assert from 'node:assert/strict';
import { test } from 'node:test';
import { downloadName } from '../web/dom.mjs';
import { downloadLabel } from '../web/features/header.mjs';

test('downloadLabel says signed only for a layer with provenance and names its real format', () => {
    assert.equal(downloadLabel(undefined), 'Download');
    assert.equal(
        downloadLabel({ image: 'data:image/jpeg;base64,/9j/', provenance: { aiDeclaration: null } }),
        'Download signed JPEG',
    );
    assert.equal(downloadLabel({ image: 'data:image/png;base64,iVBOR', provenance: null }), 'Download PNG');
    assert.equal(downloadLabel({ image: 'data:image/webp;base64,UklG', provenance: null }), 'Download WebP');
});

test('downloadLabel names MP4', () => {
    assert.equal(downloadLabel({ image: 'data:video/mp4;base64,AAAA', provenance: null }), 'Download MP4');
});

test('downloadName appends the extension of the layer MIME type only when missing', () => {
    assert.equal(downloadName({ image: 'data:image/png;base64,iVBOR', title: 'edit_v2' }), 'edit_v2.png');
    assert.equal(downloadName({ image: 'data:image/jpeg;base64,/9j/', title: 'photo.jpeg' }), 'photo.jpeg');
    assert.equal(downloadName({ image: 'data:video/mp4;base64,AAAA', title: 'clip_v2' }), 'clip_v2.mp4');
});
