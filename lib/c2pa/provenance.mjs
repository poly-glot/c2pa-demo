import { Reader } from '@contentauth/c2pa-node';
import { AI_ACTIONS, AI_SOURCE_TYPES, DigitalSourceType, Relationship } from './vocabulary.mjs';

const ACTIONS_LABEL = 'c2pa.actions';
const UNTRUSTED_SIGNER = 'signingCredential.untrusted';
const TRUSTED_SIGNER = 'signingCredential.trusted';
const USER_ANCHORS = 'manifest_user_anchors';
const NOT_AI = 'not AI';
const VALID_STATES = new Set(['Trusted', 'Valid']);
const IPTC_LABEL = 'stds.iptc';
const IPTC_SOURCE_TYPE_FIELD = 'Iptc4xmpExt:DigitalSourceType';
const sourceTypeName = (sourceType) => sourceType.split('/').pop();
const AI_SOURCE_TYPE_NAMES = new Set([...AI_SOURCE_TYPES].map(sourceTypeName));
const AI_GENERATED_NAME = sourceTypeName(DigitalSourceType.AI_GENERATED);
const AI_KIND_BY_SOURCE_TYPE = new Map([
    [DigitalSourceType.AI_GENERATED, 'AI generated'],
    [DigitalSourceType.AI_MANIPULATED, 'AI manipulated'],
    [DigitalSourceType.COMPOSITE_SYNTHETIC, 'AI manipulated'],
]);

const actionsOf = (manifest) =>
    manifest.assertions
        .filter((assertion) => assertion.label.startsWith(ACTIONS_LABEL))
        .flatMap((assertion) => assertion.data.actions);

const parentIngredientOf = (manifest) =>
    manifest.ingredients?.find((ingredient) => ingredient.relationship === Relationship.PARENT_OF);

const agentName = (agent) => (typeof agent === 'string' ? agent : agent?.name) ?? 'unknown';

function regionOf(action) {
    const shape = action.changes
        ?.flatMap((change) => change.region ?? [])
        .find((range) => range.type === 'spatial' && range.shape?.type === 'rectangle')?.shape;
    if (!shape) return null;

    return { height: shape.height, width: shape.width, x: shape.origin.x, y: shape.origin.y };
}

const viewsOf = (manifestId, manifest) =>
    actionsOf(manifest).map((action) => ({
        action: action.action,
        agent: agentName(action.softwareAgent),
        description: action.parameters?.description ?? null,
        digitalSourceType: action.digitalSourceType ?? null,
        kind: AI_KIND_BY_SOURCE_TYPE.get(action.digitalSourceType) ?? NOT_AI,
        manifestId,
        region: regionOf(action),
        title: manifest.title,
        when: action.when ?? null,
    }));

function parentChain(manifests, activeId) {
    const chain = new Set();
    let id = activeId;
    while (manifests[id] && !chain.has(id)) {
        chain.add(id);
        id = parentIngredientOf(manifests[id])?.active_manifest;
    }

    return chain;
}

const declaresAi = (view) => view.digitalSourceType !== null && AI_ACTIONS.get(view.action) === view.digitalSourceType;

const describeIngredient = (ingredient) => ({
    carriesManifest: Boolean(ingredient.manifest_data),
    title: ingredient.title,
});

function describeParent(parent) {
    if (!parent) return 'no parent';

    return parent.carriesManifest ? `parent ${parent.title} with its manifest` : `parent ${parent.title}`;
}

const declaredSourceTypesOf = (manifest) =>
    manifest.assertions.flatMap((assertion) => {
        if (assertion.label.startsWith(IPTC_LABEL)) return [assertion.data?.[IPTC_SOURCE_TYPE_FIELD]];
        if (assertion.label.startsWith(ACTIONS_LABEL))
            return assertion.data.actions.map((action) => action.digitalSourceType);

        return [];
    });

export class Provenance {
    #store;
    #active;

    constructor(reader) {
        this.#store = reader.json();
        this.#active = reader.getActive();
    }

    static async of(image, context) {
        const reader = await Reader.fromAsset({ buffer: image.buffer, mimeType: image.mimeType }, context);
        return reader && new Provenance(reader);
    }

    get store() {
        return this.#store;
    }

    get isValid() {
        return VALID_STATES.has(this.#store.validation_state);
    }

    get signerTrust() {
        const trusted = this.#store.validation_results?.activeManifest?.success?.find(
            (status) => status.code === TRUSTED_SIGNER,
        );
        if (!trusted) return 'none';

        return trusted.explanation.includes(USER_ANCHORS) ? 'user' : 'c2pa';
    }

    get failures() {
        return (this.#store.validation_status ?? [])
            .filter((status) => status.code !== UNTRUSTED_SIGNER)
            .map((status) => `${status.code}: ${status.explanation}`);
    }

    get signer() {
        const { common_name: name, issuer } = this.#active.signature_info;
        return `${name} (${issuer})`;
    }

    get claimGenerator() {
        const generator = this.#active.claim_generator_info?.[0];
        return generator ? { name: generator.name, version: generator.version ?? null } : null;
    }

    get manifestId() {
        return this.#store.active_manifest;
    }

    get instanceId() {
        return this.#active.instance_id ?? null;
    }

    get parentManifestId() {
        return parentIngredientOf(this.#active)?.active_manifest ?? null;
    }

    get actions() {
        return viewsOf(this.manifestId, this.#active);
    }

    get timeline() {
        const { manifests } = this.#store;
        const ordered = new Set([...parentChain(manifests, this.manifestId), ...Object.keys(manifests)]);

        return [...ordered].flatMap((id) => viewsOf(id, manifests[id]));
    }

    get parent() {
        const parent = parentIngredientOf(this.#active);
        return parent && describeIngredient(parent);
    }

    get components() {
        return (this.#active.ingredients ?? [])
            .filter((ingredient) => ingredient.relationship === Relationship.COMPONENT_OF)
            .map((ingredient) => ({ ...describeIngredient(ingredient), slot: ingredient.instance_id ?? null }));
    }

    get declaresAiManipulation() {
        return this.actions.some(declaresAi);
    }

    get aiActions() {
        return this.timeline.filter((view) => view.kind !== NOT_AI);
    }

    get aiDeclaration() {
        const declared = new Set(
            Object.values(this.#store.manifests)
                .flatMap(declaredSourceTypesOf)
                .filter(Boolean)
                .map(sourceTypeName)
                .filter((name) => AI_SOURCE_TYPE_NAMES.has(name)),
        );
        if (declared.size === 0) return null;

        return declared.has(AI_GENERATED_NAME) ? 'AI generated' : 'AI edited';
    }

    describe() {
        const actions = this.actions.map((action) => action.action).join(', ');
        return `signed by ${this.signer}, actions ${actions}, ${describeParent(this.parent)}`;
    }

    toJSON() {
        return {
            actions: this.actions,
            aiActions: this.aiActions,
            aiDeclaration: this.aiDeclaration,
            claimGenerator: this.claimGenerator,
            components: this.components,
            failures: this.failures,
            instanceId: this.instanceId,
            isValid: this.isValid,
            manifestId: this.manifestId,
            parent: this.parent ?? null,
            parentManifestId: this.parentManifestId,
            signer: this.signer,
            signerTrust: this.signerTrust,
            store: this.store,
            timeline: this.timeline,
        };
    }
}
