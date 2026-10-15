import { CompositeManifest } from './c2pa/manifest.mjs';
import { Provenance } from './c2pa/provenance.mjs';

const carriesAi = async (asset, context) => ((await Provenance.of(asset, context))?.aiActions.length ?? 0) > 0;

export async function composeWithProvenance(
    { agent, claimGenerator, context, signer },
    { components, rendered, text },
) {
    const aiFlags = await Promise.all(components.map(({ asset }) => carriesAi(asset, context)));
    const manifest = new CompositeManifest(claimGenerator, agent, { containsAi: aiFlags.includes(true), text });
    for (const { asset, edits, slot } of components) manifest.placing(asset, slot, edits);

    const signed = await manifest.signOnto(rendered, signer);
    return { image: signed, provenance: await Provenance.of(signed, context) };
}
