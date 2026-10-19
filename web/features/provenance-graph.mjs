const KIND_BY_RELATIONSHIP = { componentOf: 'Placed ingredient', parentOf: 'Edited from' };

export const ROOT_PATH = '0';

function nodeOf(manifests, { ingredient, kind, manifestId }, ancestors) {
    const manifest = ancestors.has(manifestId) ? null : manifests[manifestId];
    const lineage = new Set([...ancestors, manifestId]);
    const children = (manifest?.ingredients ?? []).map((child) =>
        nodeOf(
            manifests,
            {
                ingredient: child,
                kind: KIND_BY_RELATIONSHIP[child.relationship] ?? 'Ingredient',
                manifestId: child.active_manifest,
            },
            lineage,
        ),
    );

    return {
        children,
        format: ingredient?.format ?? manifest?.format ?? null,
        kind,
        signer: manifest?.signature_info?.common_name ?? null,
        title: ingredient?.title ?? manifest?.title ?? 'Untitled',
    };
}

export const provenanceGraph = ({ active_manifest: manifestId, manifests }) =>
    nodeOf(manifests, { kind: 'This file', manifestId }, new Set());

export const countIngredients = (node) => node.children.reduce((sum, child) => sum + 1 + countIngredients(child), 0);

export const nodeAt = (root, path) =>
    path
        .split('.')
        .slice(1)
        .reduce((node, index) => node.children[Number(index)], root);
