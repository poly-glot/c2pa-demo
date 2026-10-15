import { DerivedManifest } from './c2pa/manifest.mjs';
import { Provenance } from './c2pa/provenance.mjs';

export async function deriveWithProvenance({ claimGenerator, context, signer }, { edit, edited, original, placed }) {
    const manifest = new DerivedManifest(claimGenerator).derivedFrom(original).recording(edit);
    if (placed) manifest.placing(placed.asset, placed.slot);

    const signed = await manifest.signOnto(edited, signer);
    return { image: signed, provenance: await Provenance.of(signed, context) };
}
