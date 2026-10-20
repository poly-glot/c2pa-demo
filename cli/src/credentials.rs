use anyhow::{bail, Context as _, Result};
use c2pa::Context;
use serde_json::{json, Value};
use std::path::PathBuf;

const CHAIN: &str = include_str!("../../cert/claim-signer.pem");
const KEY: &str = include_str!(concat!(env!("OUT_DIR"), "/claim-signer.key"));
const ROOT_CA: &str = include_str!("../../cert/root-ca.pem");
const TEST_INTERMEDIATE_CA: &str = include_str!("../../cert/trust/test-intermediate-ca.pem");
const C2PA_ANCHORS: &str = include_str!("../../cert/trust/anchors.pem");
const C2PA_ALLOWED_LIST: &str = include_str!("../../cert/trust/allowed.sha256.txt");
const C2PA_TRUST_CONFIG: &str = include_str!("../../cert/trust/store.cfg");

const C2PA_TRUST_URI: &str = "https://contentcredentials.org/trust";
pub const USER_TRUST_URI: &str = "urn:c2pa-demo:test-anchors";

#[derive(Debug, Default, Clone, clap::Args)]
pub struct Overrides {
    /// PEM certificate chain, signing certificate first; overrides the embedded chain
    #[arg(long, global = true, env = "C2PA_CERT", value_name = "PEM")]
    pub cert: Option<PathBuf>,
    /// PKCS#8 PEM private key for the signing certificate; overrides the embedded key
    #[arg(long, global = true, env = "C2PA_KEY", value_name = "PEM")]
    pub key: Option<PathBuf>,
    #[arg(long, global = true, env = "C2PA_KEY_PEM", hide = true)]
    pub key_pem: Option<String>,
    /// RFC 3161 timestamp authority URL
    #[arg(long, global = true, env = "C2PA_TSA", value_name = "URL")]
    pub tsa: Option<String>,
}

pub fn reader_context() -> Result<Context> {
    context(Value::Null)
}

pub fn signing_context(overrides: &Overrides) -> Result<Context> {
    let chain = match &overrides.cert {
        Some(path) => std::fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?,
        None => CHAIN.to_string(),
    };
    let key = match (&overrides.key, &overrides.key_pem) {
        (Some(path), _) => std::fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?,
        (None, Some(pem)) => pem.clone(),
        (None, None) if KEY.is_empty() => bail!("no signing key: pass --key or set C2PA_KEY_PEM"),
        (None, None) => KEY.to_string(),
    };

    context(json!({
        "local": { "alg": "es256", "private_key": key, "sign_cert": chain, "tsa_url": overrides.tsa },
    }))
}

fn context(signer: Value) -> Result<Context> {
    let anchors = json!([
        {
            "allowed_list": C2PA_ALLOWED_LIST,
            "trust_anchors": C2PA_ANCHORS,
            "trust_config": C2PA_TRUST_CONFIG,
            "trust_kind": "manifest",
            "trust_uri": C2PA_TRUST_URI,
        },
        {
            "trust_anchors": format!("{ROOT_CA}\n{TEST_INTERMEDIATE_CA}"),
            "trust_config": C2PA_TRUST_CONFIG,
            "trust_kind": "manifest",
            "trust_uri": USER_TRUST_URI,
        },
    ]);
    let settings = json!({
        "builder": { "thumbnail": { "enabled": false } },
        "signer": signer,
        "trust": { "anchors": anchors },
        "verify": { "verify_trust": true },
    });

    Ok(Context::new().with_settings(settings)?)
}
