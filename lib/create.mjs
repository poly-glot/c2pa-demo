import { GeneratedManifest } from './c2pa/manifest.mjs';
import { Provenance } from './c2pa/provenance.mjs';

export async function createWithProvenance({ claimGenerator, context, signer }, { agent, generated }) {
    const signed = await new GeneratedManifest(claimGenerator, context, agent).signOnto(generated, signer);
    return { image: signed, provenance: await Provenance.of(signed, context) };
}
