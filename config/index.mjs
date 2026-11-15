import { fileURLToPath } from 'node:url';

const DEFAULT_BINARY = fileURLToPath(new URL('../cli/target/release/provenance', import.meta.url));

export function loadConfig(env = process.env) {
    return Object.freeze({
        defaultInstruction: 'Change the sparkling water bottle and its label to orange.',
        modal: {
            createUrl: 'https://junaidart--c2pa-demo-create.us-east.modal.run',
            editUrl: 'https://junaidart--c2pa-demo-edit.us-east.modal.run',
            key: env.MODAL_KEY ?? '',
            secret: env.MODAL_SECRET ?? '',
        },
        port: Number(env.PORT) || 8787,
        provenanceBinary: env.PROVENANCE_BIN || DEFAULT_BINARY,
        selfCheck: env.SELFCHECK === '1',
    });
}
