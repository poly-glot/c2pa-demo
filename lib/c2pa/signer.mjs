import { readFile } from 'node:fs/promises';
import { LocalSigner } from '@contentauth/c2pa-node';

export async function loadLocalSigner({ certificate, privateKey, privateKeyPem, timestampAuthority }) {
    const [certificateChain, key] = await Promise.all([
        readFile(certificate),
        privateKeyPem ? Buffer.from(privateKeyPem) : readFile(privateKey),
    ]);
    return LocalSigner.newSigner(certificateChain, key, 'es256', timestampAuthority);
}
