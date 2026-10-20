use std::{env, fs, path::Path};

const KEY: &str = "../cert/claim-signer.key";

fn main() {
    println!("cargo:rerun-if-changed={KEY}");

    let embedded = fs::read(KEY).unwrap_or_default();
    let out = Path::new(&env::var("OUT_DIR").unwrap()).join("claim-signer.key");
    fs::write(out, embedded).unwrap();
}
