import { fileURLToPath } from 'node:url';

const DEFAULT_BINARY = fileURLToPath(new URL('../cli/target/release/provenance', import.meta.url));

export function loadConfig(env = process.env) {
    return Object.freeze({
        access: { password: env.APP_PASSWORD ?? '' },
        defaultInstruction: 'Change the sparkling water bottle and its label to orange.',
        port: Number(env.PORT) || 8787,
        provenanceBinary: env.PROVENANCE_BIN || DEFAULT_BINARY,
        selfCheck: env.SELFCHECK === '1',
        zeroGpu: { token: env.HF_TOKEN ?? '' },
    });
}
