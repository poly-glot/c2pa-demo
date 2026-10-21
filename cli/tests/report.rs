use c2pa::Builder;
use provenance::credentials::{self, Overrides};
use provenance::report::Report;
use serde_json::json;
use std::io::Cursor;
use std::sync::Arc;

const PHOTO: &[u8] = include_bytes!("../../samples/Mountain-Lake_Photo_Unsplash_1600x1067.jpg");
const IPTC: &str = "http://cv.iptc.org/newscodes/digitalsourcetype/";

fn fixture(action_source_type: &str, iptc_source_type: Option<&str>) -> Report {
    let context = Arc::new(credentials::signing_context(&Overrides::default()).unwrap());
    let definition = json!({ "claim_generator_info": [{ "name": "fixture", "version": "1" }], "title": "fixture.jpg" });
    let mut builder = Builder::from_shared_context(&context)
        .with_definition(definition)
        .unwrap();
    let created = json!({ "action": "c2pa.created", "digitalSourceType": format!("{IPTC}{action_source_type}") });
    builder
        .add_assertion("c2pa.actions.v2", &json!({ "actions": [created] }))
        .unwrap();
    if let Some(source_type) = iptc_source_type {
        let iptc = json!({ "Iptc4xmpExt:DigitalSourceType": format!("{IPTC}{source_type}") });
        builder.add_assertion("stds.iptc", &iptc).unwrap();
    }

    let mut signed = Cursor::new(Vec::new());
    builder
        .sign(
            context.signer().unwrap(),
            "image/jpeg",
            &mut Cursor::new(PHOTO),
            &mut signed,
        )
        .unwrap();
    Report::read("image/jpeg", &signed.into_inner(), &context)
        .unwrap()
        .unwrap()
}

#[test]
fn an_action_declaring_composite_synthetic_is_ai_edited() {
    let report = fixture("compositeSynthetic", None);
    assert_eq!(report.ai_declaration.as_deref(), Some("AI edited"));
    assert_eq!(report.actions[0].kind, "AI manipulated");
}

#[test]
fn an_iptc_trained_algorithmic_media_declaration_wins_over_a_digital_creation_action() {
    let report = fixture("digitalCreation", Some("trainedAlgorithmicMedia"));
    assert_eq!(report.actions[0].kind, "not AI");
    assert_eq!(report.ai_declaration.as_deref(), Some("AI generated"));
}

#[test]
fn a_non_ai_signed_file_has_no_ai_declaration() {
    let report = fixture("digitalCreation", None);
    assert_eq!(report.ai_declaration, None);
    assert!(report.is_valid);
    assert!(report.ai_actions.is_empty());
}

#[test]
fn an_unsigned_file_reads_as_none() {
    let context = Arc::new(credentials::reader_context().unwrap());
    assert!(Report::read("image/jpeg", PHOTO, &context).unwrap().is_none());
}
