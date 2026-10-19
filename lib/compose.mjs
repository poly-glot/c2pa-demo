import { CompositeManifest } from './c2pa/manifest.mjs';
import { Provenance } from './c2pa/provenance.mjs';
import { isAiDeclared } from './derive.mjs';

export async function composeWithProvenance({ agent, claimGenerator, context, signer }, { components, rendered }) {
    const aiFlags = await Promise.all(components.map(({ asset }) => isAiDeclared(asset, context)));
    if (!aiFlags.includes(true)) return { image: rendered, provenance: null };

    const manifest = new CompositeManifest(claimGenerator, context, agent);
    for (const { asset, edits, slot } of components) manifest.placing(asset, slot, edits);

    const signed = await manifest.signOnto(rendered, signer);
    return { image: signed, provenance: await Provenance.of(signed, context) };
}
