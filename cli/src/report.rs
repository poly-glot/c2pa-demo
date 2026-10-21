use crate::credentials::USER_TRUST_URI;
use crate::manifest::{AI_GENERATED, AI_MANIPULATED};
use anyhow::Result;
use c2pa::{Context, Reader};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;
use std::io::Cursor;
use std::sync::Arc;

const ACTIONS_LABEL: &str = "c2pa.actions";
const IPTC_LABEL: &str = "stds.iptc";
const IPTC_SOURCE_TYPE_FIELD: &str = "Iptc4xmpExt:DigitalSourceType";
const TRUSTED_SIGNER: &str = "signingCredential.trusted";
const UNTRUSTED_SIGNER: &str = "signingCredential.untrusted";
const VALID_STATES: [&str; 2] = ["Trusted", "Valid"];
const AI_SOURCE_TYPE_NAMES: [&str; 3] = [
    "trainedAlgorithmicMedia",
    "compositeWithTrainedAlgorithmicMedia",
    "compositeSynthetic",
];
const NOT_AI: &str = "not AI";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionView {
    pub action: String,
    pub agent: String,
    pub description: Option<String>,
    pub digital_source_type: Option<String>,
    pub kind: String,
    pub manifest_id: String,
    pub region: Option<RegionView>,
    pub title: Option<String>,
    pub when: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegionView {
    pub height: f64,
    pub width: f64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientView {
    pub carries_manifest: bool,
    pub slot: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaimGenerator {
    pub name: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub actions: Vec<ActionView>,
    pub ai_actions: Vec<ActionView>,
    pub ai_declaration: Option<String>,
    pub claim_generator: Option<ClaimGenerator>,
    pub components: Vec<IngredientView>,
    pub failures: Vec<String>,
    pub instance_id: Option<String>,
    pub is_valid: bool,
    pub manifest_id: String,
    pub parent: Option<IngredientView>,
    pub parent_manifest_id: Option<String>,
    pub signer: String,
    pub signer_trust: String,
    pub store: Value,
    pub summary: String,
    pub timeline: Vec<ActionView>,
}

impl Report {
    pub fn read(format: &str, bytes: &[u8], context: &Arc<Context>) -> Result<Option<Self>> {
        let reader = Reader::from_shared_context(context).with_stream(format, Cursor::new(bytes));
        match reader {
            Ok(reader) => Ok(Some(Self::from_store(serde_json::from_str(&reader.json())?))),
            Err(c2pa::Error::JumbfNotFound) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    fn from_store(store: Value) -> Self {
        let manifest_id = text(&store["active_manifest"]).unwrap_or_default();
        let manifests = &store["manifests"];
        let active = &manifests[&manifest_id];
        let parent_ingredient = parent_ingredient_of(active);

        let actions = views_of(&manifest_id, active);
        let timeline = timeline_of(manifests, &manifest_id);
        let parent = parent_ingredient.map(describe_ingredient);
        let signer = signer_of(active);
        let summary = summarise(&signer, &actions, &parent);

        Self {
            ai_actions: timeline.iter().filter(|view| view.kind != NOT_AI).cloned().collect(),
            ai_declaration: ai_declaration_of(manifests),
            claim_generator: claim_generator_of(active),
            components: components_of(active),
            failures: failures_of(&store),
            instance_id: text(&active["instance_id"]),
            is_valid: text(&store["validation_state"]).is_some_and(|state| VALID_STATES.contains(&state.as_str())),
            parent_manifest_id: parent_ingredient.and_then(|ingredient| text(&ingredient["active_manifest"])),
            signer_trust: signer_trust_of(&store),
            actions,
            manifest_id,
            parent,
            signer,
            store,
            summary,
            timeline,
        }
    }
}

fn text(value: &Value) -> Option<String> {
    value.as_str().map(str::to_string)
}

fn array(value: &Value) -> impl Iterator<Item = &Value> {
    value.as_array().into_iter().flatten()
}

fn assertions_labelled<'a>(manifest: &'a Value, prefix: &'a str) -> impl Iterator<Item = &'a Value> {
    array(&manifest["assertions"])
        .filter(move |assertion| text(&assertion["label"]).is_some_and(|l| l.starts_with(prefix)))
}

fn actions_of(manifest: &Value) -> impl Iterator<Item = &Value> {
    assertions_labelled(manifest, ACTIONS_LABEL).flat_map(|assertion| array(&assertion["data"]["actions"]))
}

fn parent_ingredient_of(manifest: &Value) -> Option<&Value> {
    array(&manifest["ingredients"]).find(|ingredient| ingredient["relationship"] == "parentOf")
}

fn agent_name(agent: &Value) -> String {
    agent
        .as_str()
        .map(str::to_string)
        .or_else(|| text(&agent["name"]))
        .unwrap_or_else(|| "unknown".to_string())
}

fn region_of(action: &Value) -> Option<RegionView> {
    let shape = array(&action["changes"])
        .flat_map(|change| array(&change["region"]))
        .find(|range| range["type"] == "spatial" && range["shape"]["type"] == "rectangle")
        .map(|range| &range["shape"])?;
    Some(RegionView {
        height: shape["height"].as_f64()?,
        width: shape["width"].as_f64()?,
        x: shape["origin"]["x"].as_f64()?,
        y: shape["origin"]["y"].as_f64()?,
    })
}

fn ai_kind(source_type: Option<&str>) -> &'static str {
    match source_type {
        Some(AI_GENERATED) => "AI generated",
        Some(AI_MANIPULATED) => "AI manipulated",
        Some(name) if name.ends_with("compositeSynthetic") => "AI manipulated",
        _ => NOT_AI,
    }
}

fn views_of(manifest_id: &str, manifest: &Value) -> Vec<ActionView> {
    actions_of(manifest)
        .map(|action| ActionView {
            action: text(&action["action"]).unwrap_or_default(),
            agent: agent_name(&action["softwareAgent"]),
            description: text(&action["parameters"]["description"]),
            digital_source_type: text(&action["digitalSourceType"]),
            kind: ai_kind(action["digitalSourceType"].as_str()).to_string(),
            manifest_id: manifest_id.to_string(),
            region: region_of(action),
            title: text(&manifest["title"]),
            when: text(&action["when"]),
        })
        .collect()
}

fn parent_chain(manifests: &Value, active_id: &str) -> Vec<String> {
    let mut chain: Vec<String> = Vec::new();
    let mut id = active_id.to_string();
    while manifests.get(&id).is_some() && !chain.contains(&id) {
        chain.push(id.clone());
        match parent_ingredient_of(&manifests[&id]).and_then(|ingredient| text(&ingredient["active_manifest"])) {
            Some(next) => id = next,
            None => break,
        }
    }
    chain
}

fn timeline_of(manifests: &Value, active_id: &str) -> Vec<ActionView> {
    let mut ordered = parent_chain(manifests, active_id);
    let listed: BTreeSet<String> = ordered.iter().cloned().collect();
    ordered.extend(
        manifests
            .as_object()
            .into_iter()
            .flat_map(|map| map.keys())
            .filter(|id| !listed.contains(*id))
            .cloned(),
    );
    ordered.iter().flat_map(|id| views_of(id, &manifests[id])).collect()
}

fn describe_ingredient(ingredient: &Value) -> IngredientView {
    IngredientView {
        carries_manifest: !ingredient["manifest_data"].is_null(),
        slot: None,
        title: text(&ingredient["title"]),
    }
}

fn components_of(manifest: &Value) -> Vec<IngredientView> {
    array(&manifest["ingredients"])
        .filter(|ingredient| ingredient["relationship"] == "componentOf")
        .map(|ingredient| IngredientView {
            slot: text(&ingredient["instance_id"]),
            ..describe_ingredient(ingredient)
        })
        .collect()
}

fn declared_source_types_of(manifest: &Value) -> Vec<String> {
    let iptc = assertions_labelled(manifest, IPTC_LABEL).filter_map(|a| text(&a["data"][IPTC_SOURCE_TYPE_FIELD]));
    let actions = actions_of(manifest).filter_map(|action| text(&action["digitalSourceType"]));
    iptc.chain(actions).collect()
}

fn ai_declaration_of(manifests: &Value) -> Option<String> {
    let declared: BTreeSet<String> = manifests
        .as_object()
        .into_iter()
        .flat_map(|map| map.values())
        .flat_map(declared_source_types_of)
        .filter_map(|source_type| source_type.rsplit('/').next().map(str::to_string))
        .filter(|name| AI_SOURCE_TYPE_NAMES.contains(&name.as_str()))
        .collect();
    if declared.is_empty() {
        return None;
    }
    Some(
        if declared.contains("trainedAlgorithmicMedia") {
            "AI generated"
        } else {
            "AI edited"
        }
        .to_string(),
    )
}

fn signer_of(manifest: &Value) -> String {
    let info = &manifest["signature_info"];
    let name = text(&info["common_name"]).unwrap_or_else(|| "unknown".to_string());
    let issuer = text(&info["issuer"]).unwrap_or_else(|| "unknown".to_string());
    format!("{name} ({issuer})")
}

fn signer_trust_of(store: &Value) -> String {
    let trusted = array(&store["validation_results"]["activeManifest"]["success"])
        .find(|status| status["code"] == TRUSTED_SIGNER)
        .and_then(|status| text(&status["explanation"]));
    match trusted {
        None => "none",
        Some(explanation) if explanation.contains(USER_TRUST_URI) => "user",
        Some(_) => "c2pa",
    }
    .to_string()
}

fn failures_of(store: &Value) -> Vec<String> {
    array(&store["validation_status"])
        .filter(|status| status["code"] != UNTRUSTED_SIGNER)
        .map(|status| {
            format!(
                "{}: {}",
                text(&status["code"]).unwrap_or_default(),
                text(&status["explanation"]).unwrap_or_default()
            )
        })
        .collect()
}

fn claim_generator_of(manifest: &Value) -> Option<ClaimGenerator> {
    let generator = array(&manifest["claim_generator_info"]).next()?;
    Some(ClaimGenerator {
        name: text(&generator["name"]),
        version: text(&generator["version"]),
    })
}

fn summarise(signer: &str, actions: &[ActionView], parent: &Option<IngredientView>) -> String {
    let kinds: Vec<&str> = actions.iter().map(|view| view.action.as_str()).collect();
    let parent = match parent {
        None => "no parent".to_string(),
        Some(IngredientView {
            carries_manifest: true,
            title,
            ..
        }) => {
            format!("parent {} with its manifest", title.as_deref().unwrap_or("untitled"))
        }
        Some(IngredientView { title, .. }) => format!("parent {}", title.as_deref().unwrap_or("untitled")),
    };
    format!("signed by {signer}, actions {}, {parent}", kinds.join(", "))
}
