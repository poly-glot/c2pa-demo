import { readFile } from 'node:fs/promises';
import { Context } from '@contentauth/c2pa-node';

const text = (path) => readFile(path, 'utf8');

export async function loadReaderContext({ allowedList, anchors, config, userAnchors }) {
    const [trustAnchors, allowed, trustConfig, ...user] = await Promise.all([
        text(anchors),
        text(allowedList),
        text(config),
        ...userAnchors.map(text),
    ]);

    return new Context({
        builder: { thumbnail: { enabled: false } },
        trust: { allowedList: allowed, trustAnchors, trustConfig, userAnchors: user.join('\n'), verifyTrustList: true },
        verify: { verifyTrust: true },
    });
}
