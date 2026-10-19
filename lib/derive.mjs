import { AiEdit, DerivedManifest } from './c2pa/manifest.mjs';
import { Provenance } from './c2pa/provenance.mjs';

export const isAiDeclared = async (asset, context) => Boolean((await Provenance.of(asset, context))?.aiDeclaration);

export async function deriveWithProvenance({ claimGenerator, context, signer }, { edit, edited, original, placed }) {
    const inputs = placed ? [original, placed.asset] : [original];
    const aiFlags = await Promise.all(inputs.map((asset) => isAiDeclared(asset, context)));

    const signsOutput = edit instanceof AiEdit || aiFlags.includes(true);
    if (!signsOutput) return { image: edited, provenance: null };

    const manifest = new DerivedManifest(claimGenerator, context).derivedFrom(original).recording(edit);
    if (placed) manifest.placing(placed.asset, placed.slot);

    const signed = await manifest.signOnto(edited, signer);
    return { image: signed, provenance: await Provenance.of(signed, context) };
}
