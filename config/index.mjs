import { fileURLToPath } from 'node:url';

const CERT_DIR = new URL('../cert/', import.meta.url);

const certPath = (name) => fileURLToPath(new URL(name, CERT_DIR));

export function loadConfig(env = process.env) {
    return Object.freeze({
        access: { password: env.APP_PASSWORD ?? '' },
        claimGenerator: { name: 'e-detailer', version: '0.1.0' },
        defaultInstruction: 'Change the sparkling water bottle and its label to orange.',
        gateway: {
            apiKey: env.LLM_API_KEY ?? '',
            imageModel: env.LLM_IMAGE_MODEL || 'gemini-3.1-flash-image',
            url: env.LLM_GATEWAY_URL ?? '',
        },
        port: Number(env.PORT) || 8787,
        selfCheck: env.SELFCHECK === '1',
        signing: {
            certificate: env.C2PA_CERT || certPath('claim-signer.pem'),
            privateKey: env.C2PA_KEY || certPath('claim-signer.key'),
            privateKeyPem: env.C2PA_KEY_PEM,
            timestampAuthority: env.C2PA_TSA || undefined,
        },
        trust: {
            allowedList: certPath('trust/allowed.sha256.txt'),
            anchors: certPath('trust/anchors.pem'),
            config: certPath('trust/store.cfg'),
            userAnchors: env.C2PA_USER_ANCHORS?.split(',') ?? [
                certPath('root-ca.pem'),
                certPath('trust/test-intermediate-ca.pem'),
            ],
        },
    });
}
