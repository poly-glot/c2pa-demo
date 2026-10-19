import { Builder } from '@contentauth/c2pa-node';
import { ActionKind, AI_ACTIONS, DigitalSourceType, Intent, MANUAL_ACTIONS, Relationship } from './vocabulary.mjs';

const PARENT_SLOT = 'parent';
const PARENT_LINKED_ACTIONS = new Set([ActionKind.CONVERTED, ActionKind.TRANSCODED]);
const REGION_KEYS = ['height', 'width', 'x', 'y'];

const isRectangle = (region) =>
    REGION_KEYS.every((key) => Number.isFinite(region[key])) &&
    region.width > 0 &&
    region.height > 0 &&
    region.x >= 0 &&
    region.y >= 0;

function regionChanges(region) {
    if (!region) return undefined;
    if (!isRectangle(region)) throw new RangeError('a region needs x, y ≥ 0 and a positive width and height');

    const { height, width, x, y } = region;
    const shape = { height, origin: { x, y }, type: 'rectangle', unit: 'pixel', width };
    return [{ region: [{ shape, type: 'spatial' }] }];
}

const actionOf = ({ agent, changes, kind }, digitalSourceType, parameters) => ({
    action: kind,
    changes,
    digitalSourceType,
    parameters,
    softwareAgent: agent,
});

export class AiEdit {
    constructor({ agent, kind = ActionKind.EDITED, region }) {
        if (!AI_ACTIONS.has(kind)) throw new RangeError(`unsupported AI edit: ${kind}`);

        this.agent = agent;
        this.changes = regionChanges(region);
        this.kind = kind;
        Object.freeze(this);
    }

    toAction() {
        return actionOf(this, AI_ACTIONS.get(this.kind));
    }
}

export class ManualEdit {
    constructor({ agent, description, kind, region }) {
        if (!MANUAL_ACTIONS.has(kind)) throw new RangeError(`unsupported manual edit: ${kind}`);

        this.agent = agent;
        this.changes = regionChanges(region);
        this.description = description;
        this.kind = kind;
        Object.freeze(this);
    }

    toAction() {
        return actionOf(this, undefined, { description: this.description });
    }
}

const componentIngredient = (asset, slot) => ({
    format: asset.mimeType,
    instance_id: slot,
    relationship: Relationship.COMPONENT_OF,
    title: asset.title,
});

const linkedTo = (action, slot) => ({ ...action, parameters: { ...action.parameters, ingredientIds: [slot] } });

function addComponent(builder, { asset, slot }) {
    if (!slot) throw new RangeError('a placed component needs a slot');

    return builder.addIngredient(JSON.stringify(componentIngredient(asset, slot)), asset);
}

function signWith(builder, result, signer) {
    const output = { buffer: null };
    builder.sign(signer, result, output);
    return result.withBuffer(output.buffer);
}

const newBuilder = (claimGenerator, context, title) =>
    Builder.withJsonAsync({ claim_generator_info: [claimGenerator], title }, context);

export class DerivedManifest {
    #claimGenerator;
    #context;
    #parent;
    #component;
    #actions = [];

    constructor(claimGenerator, context) {
        this.#claimGenerator = claimGenerator;
        this.#context = context;
    }

    derivedFrom(parent) {
        this.#parent = parent;
        return this;
    }

    placing(asset, slot) {
        this.#component = { asset, slot };
        return this;
    }

    recording(edit) {
        this.#actions.push(edit.toAction());
        return this;
    }

    async signOnto(result, signer) {
        const builder = await newBuilder(this.#claimGenerator, this.#context, result.title);
        builder.setIntent(Intent.EDIT);

        await builder.addIngredient(JSON.stringify(this.#parentIngredient()), this.#parent);
        if (this.#component) await addComponent(builder, this.#component);
        for (const action of this.#actions) builder.addAction(JSON.stringify(this.#linked(action)));

        return signWith(builder, result, signer);
    }

    #parentIngredient() {
        return {
            format: this.#parent.mimeType,
            instance_id: PARENT_SLOT,
            relationship: Relationship.PARENT_OF,
            title: this.#parent.title,
        };
    }

    #linked(action) {
        if (PARENT_LINKED_ACTIONS.has(action.action)) return linkedTo(action, PARENT_SLOT);
        if (action.action !== ActionKind.PLACED) return action;
        if (!this.#component) throw new RangeError('a placed edit needs the placed image');

        return linkedTo(action, this.#component.slot);
    }
}

export class CompositeManifest {
    #claimGenerator;
    #context;
    #agent;
    #components = [];

    constructor(claimGenerator, context, agent) {
        this.#claimGenerator = claimGenerator;
        this.#context = context;
        this.#agent = agent;
    }

    placing(asset, slot, edits = []) {
        this.#components.push({ asset, edits, slot });
        return this;
    }

    async signOnto(result, signer) {
        const builder = await newBuilder(this.#claimGenerator, this.#context, result.title);
        builder.setIntent(Intent.create(DigitalSourceType.AI_MANIPULATED));
        builder.addAction(JSON.stringify(this.#createdAction()));

        for (const component of this.#components) {
            await addComponent(builder, component);

            const { edits, slot } = component;
            for (const edit of [this.#placedEdit(slot), ...edits]) {
                builder.addAction(JSON.stringify(linkedTo(edit.toAction(), slot)));
            }
        }

        return signWith(builder, result, signer);
    }

    #createdAction() {
        return {
            action: ActionKind.CREATED,
            digitalSourceType: DigitalSourceType.AI_MANIPULATED,
            softwareAgent: this.#agent,
        };
    }

    #placedEdit(slot) {
        return new ManualEdit({
            agent: this.#agent,
            description: `Placed in the ${slot} slot`,
            kind: ActionKind.PLACED,
        });
    }
}

export class GeneratedManifest {
    #agent;
    #claimGenerator;
    #context;

    constructor(claimGenerator, context, agent) {
        this.#agent = agent;
        this.#claimGenerator = claimGenerator;
        this.#context = context;
    }

    async signOnto(result, signer) {
        const builder = await newBuilder(this.#claimGenerator, this.#context, result.title);
        builder.setIntent(Intent.create(DigitalSourceType.AI_GENERATED));
        builder.addAction(JSON.stringify(this.#createdAction()));

        return signWith(builder, result, signer);
    }

    #createdAction() {
        return {
            action: ActionKind.CREATED,
            digitalSourceType: DigitalSourceType.AI_GENERATED,
            softwareAgent: this.#agent,
        };
    }
}
