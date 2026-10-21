use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const PHOTO: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../samples/Mountain-Lake_Photo_Unsplash_1600x1067.jpg"
);
const AI_IMAGE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../samples/NOVA-SPK-500ML_Hero_Studio_2400x2400_AI-Generated_DAT-Create.jpg"
);
const AI_CLIP: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../samples/Reference-Clip_AI-Generated_DAT-Create.mp4"
);
const ROOT_CA: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../cert/root-ca.pem");
const AI_MANIPULATED: &str = "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia";

fn provenance(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_provenance"))
        .args(args)
        .arg("--json")
        .env_remove("C2PA_CERT")
        .env_remove("C2PA_KEY")
        .output()
        .unwrap()
}

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("provenance-{name}-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn path(dir: &Path, name: &str) -> String {
    dir.join(name).to_string_lossy().into_owned()
}

fn report(output: &Output) -> Value {
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

fn action_names(report: &Value) -> Vec<&str> {
    report["actions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|action| action["action"].as_str().unwrap())
        .collect()
}

fn action<'a>(report: &'a Value, name: &str) -> &'a Value {
    report["actions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|action| action["action"] == name)
        .unwrap()
}

fn raw_actions(report: &Value) -> Vec<&Value> {
    report["store"]["manifests"]
        .as_object()
        .unwrap()
        .values()
        .flat_map(|manifest| manifest["assertions"].as_array().unwrap())
        .filter(|assertion| assertion["label"].as_str().unwrap().starts_with("c2pa.actions"))
        .flat_map(|assertion| assertion["data"]["actions"].as_array().unwrap())
        .collect()
}

fn exit_code(output: &Output) -> Option<i32> {
    output.status.code()
}

#[test]
fn created_image_inspects_as_valid_ai_generated_without_thumbnails() {
    let dir = workdir("create");
    let signed = path(&dir, "created.jpg");
    let created = report(&provenance(&["create", PHOTO, "-o", &signed]));
    assert_eq!(created["isValid"], true);
    assert_eq!(created["signerTrust"], "user");
    assert_eq!(created["aiDeclaration"], "AI generated");
    assert_eq!(action_names(&created), ["c2pa.created"]);
    assert!(created["parent"].is_null());
    assert!(!created["store"].to_string().contains("\"thumbnail\""));

    let inspected = report(&provenance(&["inspect", &signed]));
    assert_eq!(inspected["manifestId"], created["manifestId"]);
}

#[test]
fn ai_edit_carries_its_parent_manifest_and_no_description() {
    let dir = workdir("edit");
    let original = path(&dir, "original.jpg");
    let derived = path(&dir, "derived.jpg");
    report(&provenance(&["create", PHOTO, "-o", &original]));

    let report = report(&provenance(&["edit", &original, AI_IMAGE, "--ai", "-o", &derived]));
    assert_eq!(report["isValid"], true);
    assert_eq!(report["parent"]["carriesManifest"], true);
    assert_eq!(action_names(&report), ["c2pa.opened", "c2pa.edited"]);
    assert!(action(&report, "c2pa.edited")["description"].is_null());
    assert!(report["summary"]
        .as_str()
        .unwrap()
        .ends_with("parent original.jpg with its manifest"));
}

#[test]
fn ai_edit_on_a_plain_photo_is_signed_with_its_region() {
    let dir = workdir("ai-photo");
    let report = report(&provenance(&[
        "edit",
        PHOTO,
        PHOTO,
        "--ai",
        "--action",
        "c2pa.inpainting",
        "--region",
        "10,20,30,40",
        "-o",
        &path(&dir, "out.jpg"),
    ]));
    assert_eq!(report["isValid"], true);
    let inpainting = action(&report, "c2pa.inpainting");
    assert_eq!(inpainting["kind"], "AI manipulated");
    assert_eq!(inpainting["digitalSourceType"], AI_MANIPULATED);
    assert_eq!(inpainting["region"]["width"], 30.0);
    assert_eq!(report["aiActions"].as_array().unwrap().len(), 1);
}

#[test]
fn manual_edit_on_an_ai_parent_is_signed_and_links_transcodes_to_the_parent() {
    let dir = workdir("manual");
    let cropped = report(&provenance(&[
        "edit",
        AI_IMAGE,
        PHOTO,
        "--action",
        "c2pa.cropped",
        "--description",
        "Cropped",
        "--region",
        "10,20,30,40",
        "-o",
        &path(&dir, "cropped.jpg"),
    ]));
    assert_eq!(cropped["isValid"], true);
    assert_eq!(cropped["aiDeclaration"], "AI generated");
    let crop = action(&cropped, "c2pa.cropped");
    assert_eq!(crop["kind"], "not AI");
    assert_eq!(crop["description"], "Cropped");
    assert_eq!(crop["region"]["x"], 10.0);
    assert_eq!(
        cropped["timeline"].as_array().unwrap().last().unwrap()["kind"],
        "AI generated"
    );

    let transcoded = report(&provenance(&[
        "edit",
        AI_CLIP,
        AI_CLIP,
        "--action",
        "c2pa.transcoded",
        "-o",
        &path(&dir, "clip.mp4"),
    ]));
    assert_eq!(transcoded["isValid"], true);
    assert_eq!(transcoded["parent"]["carriesManifest"], true);
    let linked = raw_actions(&transcoded)
        .into_iter()
        .find(|action| action["action"] == "c2pa.transcoded")
        .unwrap();
    assert!(linked["parameters"]["ingredients"]
        .as_array()
        .is_some_and(|links| !links.is_empty()));
    assert!(transcoded["store"].to_string().contains("c2pa.hash.bmff"));
}

#[test]
fn manual_edit_without_ai_lineage_is_copied_unsigned() {
    let dir = workdir("unsigned");
    let output = path(&dir, "copy.jpg");
    let result = provenance(&["edit", PHOTO, AI_IMAGE, "--action", "c2pa.cropped", "-o", &output]);
    assert_eq!(report(&result), Value::Null);
    assert_eq!(fs::read(&output).unwrap(), fs::read(AI_IMAGE).unwrap());
    assert_eq!(report(&provenance(&["inspect", PHOTO])), Value::Null);
}

#[test]
fn placing_an_ai_image_onto_a_photo_is_signed_with_the_component() {
    let dir = workdir("placed");
    let report = report(&provenance(&[
        "edit",
        PHOTO,
        PHOTO,
        "--action",
        "c2pa.placed",
        "--placed",
        &format!("overlay={AI_IMAGE}"),
        "-o",
        &path(&dir, "placed.jpg"),
    ]));
    assert_eq!(report["isValid"], true);
    assert_eq!(report["aiDeclaration"], "AI generated");
    assert_eq!(report["components"][0]["slot"], "overlay");
    assert_eq!(report["components"][0]["carriesManifest"], true);
}

#[test]
fn invalid_edits_exit_with_code_two() {
    let dir = workdir("invalid");
    let out = path(&dir, "out.jpg");
    let bogus = provenance(&["edit", AI_IMAGE, PHOTO, "--action", "c2pa.bogus", "-o", &out]);
    assert_eq!(exit_code(&bogus), Some(2));
    assert!(String::from_utf8_lossy(&bogus.stderr).contains("unsupported manual edit"));

    let manual_as_ai = provenance(&["edit", AI_IMAGE, PHOTO, "--ai", "--action", "c2pa.cropped", "-o", &out]);
    assert_eq!(exit_code(&manual_as_ai), Some(2));

    let placed_without_image = provenance(&["edit", AI_IMAGE, PHOTO, "--action", "c2pa.placed", "-o", &out]);
    assert_eq!(exit_code(&placed_without_image), Some(2));

    for region in ["1", "10,20,0,40", "-1,20,30,40"] {
        let bad = provenance(&[
            "edit",
            AI_IMAGE,
            PHOTO,
            "--action",
            "c2pa.cropped",
            "--region",
            region,
            "-o",
            &out,
        ]);
        assert_eq!(exit_code(&bad), Some(2), "region {region}");
    }
}

#[test]
fn composite_places_each_component_and_keeps_their_manifests() {
    let dir = workdir("compose");
    let output = path(&dir, "two-up.jpg");
    let report = report(&provenance(&[
        "compose",
        PHOTO,
        "--agent",
        "test renderer",
        "--component",
        &format!("left={AI_IMAGE}"),
        "--component",
        &format!("right={PHOTO}"),
        "--edit",
        "left=c2pa.cropped=Cropped to the slot",
        "-o",
        &output,
    ]));
    assert_eq!(report["isValid"], true);
    assert_eq!(action(&report, "c2pa.created")["digitalSourceType"], AI_MANIPULATED);
    assert_eq!(
        action_names(&report),
        ["c2pa.created", "c2pa.placed", "c2pa.cropped", "c2pa.placed"]
    );
    let carried: Vec<bool> = report["components"]
        .as_array()
        .unwrap()
        .iter()
        .map(|component| component["carriesManifest"].as_bool().unwrap())
        .collect();
    assert_eq!(carried, [true, false]);
    assert!(fs::metadata(&output).unwrap().len() > 0);

    let unknown_slot = provenance(&[
        "compose",
        PHOTO,
        "--component",
        &format!("left={AI_IMAGE}"),
        "--edit",
        "top=c2pa.cropped=Cropped",
        "-o",
        &output,
    ]);
    assert_eq!(exit_code(&unknown_slot), Some(2));
}

#[test]
fn composite_of_plain_photos_is_copied_unsigned() {
    let dir = workdir("compose-plain");
    let output = path(&dir, "plain.jpg");
    let result = provenance(&[
        "compose",
        PHOTO,
        "--component",
        &format!("left={PHOTO}"),
        "--component",
        &format!("right={PHOTO}"),
        "-o",
        &output,
    ]);
    assert_eq!(report(&result), Value::Null);
    assert_eq!(fs::read(&output).unwrap(), fs::read(PHOTO).unwrap());
}

#[test]
fn certificate_that_does_not_match_the_embedded_key_is_rejected() {
    let dir = workdir("mismatch");
    let output = provenance(&["create", PHOTO, "--cert", ROOT_CA, "-o", &path(&dir, "bad.jpg")]);
    assert_eq!(exit_code(&output), Some(1));
}
