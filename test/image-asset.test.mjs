import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImageAsset } from '../lib/image-asset.mjs';

test('data URIs that are not base64 JPEG, PNG, WebP or MP4 are rejected', async () => {
    const photo = await ImageAsset.fromFile('samples/Mountain-Lake_Photo_Unsplash_1600x1067.jpg');
    assert.equal(ImageAsset.fromDataUri(photo.toDataUri(), 'lake.jpg').buffer.equals(photo.buffer), true);
    assert.equal(ImageAsset.fromDataUri(photo.toDataUri(), 'lake').retitledAs('lake').title, 'lake.jpg');

    for (const uri of [undefined, 'data:,', 'data:text/html;base64,PGI+', 'data:image/png,raw']) {
        assert.throws(() => ImageAsset.fromDataUri(uri), RangeError, String(uri));
    }
});
