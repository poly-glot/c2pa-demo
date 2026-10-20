use crate::report::Report;
use anyhow::{bail, Context as _, Result};
use c2pa::{Builder, Context, DigitalSourceType};
use serde_json::{json, Value};
use std::fmt;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const CLAIM_GENERATOR: &str = "provenance";
const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const AI_GENERATED: &str = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
pub const AI_MANIPULATED: &str = "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia";
const CREATED: &str = "c2pa.created";
pub const EDITED: &str = "c2pa.edited";
const PLACED: &str = "c2pa.placed";
const AI_ACTIONS: [&str; 4] = [EDITED, "c2pa.inpainting", "c2pa.outpainting", "c2pa.upscaled"];
const MANUAL_ACTIONS: [&str; 11] = [
    "c2pa.color_adjustments",
    "c2pa.converted",
    "c2pa.cropped",
    "c2pa.drawing",
    EDITED,
    "c2pa.filtered",
    "c2pa.orientation",
    PLACED,
    "c2pa.published",
    "c2pa.resized",
    "c2pa.transcoded",
];
const PARENT_LINKED_ACTIONS: [&str; 2] = ["c2pa.converted", "c2pa.transcoded"];
const PARENT_SLOT: &str = "parent";

#[derive(Debug)]
pub struct InvalidInput(pub String);

impl fmt::Display for InvalidInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for InvalidInput {}

fn invalid(message: impl Into<String>) -> anyhow::Error {
    InvalidInput(message.into()).into()
}

#[derive(Debug, Clone)]
pub struct Asset(PathBuf);

impl Asset {
    pub fn from_path(path: &Path) -> Self {
        Self(path.to_path_buf())
    }

    fn title(&self) -> String {
        self.0.file_name().unwrap_or_default().to_string_lossy().into_owned()
    }

    pub fn format(&self) -> Result<String> {
        c2pa::format_from_path(&self.0).ok_or_else(|| invalid(format!("unsupported asset type: {}", self.0.display())))
    }

    pub fn bytes(&self) -> Result<Vec<u8>> {
        std::fs::read(&self.0).with_context(|| format!("reading {}", self.0.display()))
    }

    fn declares_ai(&self, context: &Arc<Context>) -> Result<bool> {
        let report = Report::read(&self.format()?, &self.bytes()?, context)?;
        Ok(report.is_some_and(|report| report.ai_declaration.is_some()))
    }
}

#[derive(Debug)]
#[allow(clippy::large_enum_variant)]
pub enum Manifest {
    Generated {
        agent: String,
    },
    Derived {
        parent: Asset,
        placed: Option<Placed>,
        edit: Edit,
    },
    Composite {
        agent: String,
        components: Vec<Component>,
    },
}

#[derive(Debug, Clone)]
pub struct Placed {
    pub asset: Asset,
    pub slot: String,
}

#[derive(Debug, Clone)]
pub struct Component {
    pub asset: Asset,
    pub slot: String,
    pub edits: Vec<Edit>,
}

#[derive(Debug, Clone)]
pub struct Edit {
    pub action: String,
    pub agent: String,
    pub ai: bool,
    pub description: Option<String>,
    pub region: Option<Region>,
}

#[derive(Debug, Clone, Copy)]
pub struct Region {
    pub height: f64,
    pub width: f64,
    pub x: f64,
    pub y: f64,
}

impl Region {
    fn validate(&self) -> Result<()> {
        let finite = [self.height, self.width, self.x, self.y]
            .iter()
            .all(|value| value.is_finite());
        let positive = self.width > 0.0 && self.height > 0.0 && self.x >= 0.0 && self.y >= 0.0;
        if !(finite && positive) {
            return Err(invalid("a region needs x, y ≥ 0 and a positive width and height"));
        }
        Ok(())
    }

    fn changes(&self) -> Value {
        let shape = json!({
            "height": self.height,
            "origin": { "x": self.x, "y": self.y },
            "type": "rectangle",
            "unit": "pixel",
            "width": self.width,
        });
        json!([{ "region": [{ "shape": shape, "type": "spatial" }] }])
    }
}

impl Edit {
    pub fn validate(&self) -> Result<()> {
        let accepted: &[&str] = if self.ai { &AI_ACTIONS } else { &MANUAL_ACTIONS };
        if !accepted.contains(&self.action.as_str()) {
            let kind = if self.ai { "AI" } else { "manual" };
            return Err(invalid(format!("unsupported {kind} edit: {}", self.action)));
        }
        self.region.as_ref().map_or(Ok(()), Region::validate)
    }

    fn to_action(&self, linked_slot: Option<&str>) -> Value {
        let mut parameters = serde_json::Map::new();
        if let Some(description) = &self.description {
            parameters.insert("description".into(), json!(description));
        }
        if let Some(slot) = linked_slot {
            parameters.insert("ingredientIds".into(), json!([slot]));
        }

        let mut action = json!({ "action": self.action, "softwareAgent": { "name": self.agent } });
        if self.ai {
            action["digitalSourceType"] = json!(AI_MANIPULATED);
        }
        if let Some(region) = &self.region {
            action["changes"] = region.changes();
        }
        if !parameters.is_empty() {
            action["parameters"] = Value::Object(parameters);
        }
        action
    }
}

impl Manifest {
    pub fn validate(&self) -> Result<()> {
        match self {
            Manifest::Generated { .. } => Ok(()),
            Manifest::Derived { placed, edit, .. } => {
                edit.validate()?;
                if edit.action == PLACED && placed.is_none() {
                    return Err(invalid("a placed edit needs the placed image"));
                }
                Ok(())
            }
            Manifest::Composite { components, .. } => components
                .iter()
                .flat_map(|component| &component.edits)
                .try_for_each(Edit::validate),
        }
    }

    pub fn sign(&self, asset: &Asset, output: &Path, context: &Arc<Context>) -> Result<Option<Report>> {
        self.validate()?;
        if !self.has_ai_lineage(context)? {
            if output != asset.0 {
                std::fs::copy(&asset.0, output).with_context(|| format!("writing {}", output.display()))?;
            }
            return Ok(None);
        }

        let format = asset.format()?;
        let definition = json!({
            "claim_generator_info": [{ "name": CLAIM_GENERATOR, "version": VERSION }],
            "title": asset.title(),
        });
        let mut builder = Builder::from_shared_context(context).with_definition(definition)?;
        self.apply(&mut builder)?;

        let mut source = Cursor::new(asset.bytes()?);
        let mut signed = Cursor::new(Vec::new());
        builder.sign(context.signer()?, &format, &mut source, &mut signed)?;

        let bytes = signed.into_inner();
        let report = Report::read(&format, &bytes, context)?.context("the signed asset carries no manifest")?;
        if !report.is_valid {
            bail!("the signed output did not validate: {}", report.failures.join("; "));
        }
        std::fs::write(output, &bytes).with_context(|| format!("writing {}", output.display()))?;
        Ok(Some(report))
    }

    fn has_ai_lineage(&self, context: &Arc<Context>) -> Result<bool> {
        let ingredients: Vec<&Asset> = match self {
            Manifest::Generated { .. } => return Ok(true),
            Manifest::Derived { edit, .. } if edit.ai => return Ok(true),
            Manifest::Derived { parent, placed, .. } => std::iter::once(parent)
                .chain(placed.iter().map(|placed| &placed.asset))
                .collect(),
            Manifest::Composite { components, .. } => components.iter().map(|component| &component.asset).collect(),
        };
        for asset in ingredients {
            if asset.declares_ai(context)? {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn apply(&self, builder: &mut Builder) -> Result<()> {
        match self {
            Manifest::Generated { agent } => {
                builder.set_intent(c2pa::BuilderIntent::Create(DigitalSourceType::TrainedAlgorithmicMedia));
                builder.add_action(created(agent, AI_GENERATED))?;
            }
            Manifest::Derived { parent, placed, edit } => {
                builder.set_intent(c2pa::BuilderIntent::Edit);
                add_ingredient(builder, parent, "parentOf", PARENT_SLOT)?;
                if let Some(placed) = placed {
                    add_ingredient(builder, &placed.asset, "componentOf", &placed.slot)?;
                }
                builder.add_action(edit.to_action(derived_link(edit, placed)))?;
            }
            Manifest::Composite { agent, components } => {
                builder.set_intent(c2pa::BuilderIntent::Create(
                    DigitalSourceType::CompositeWithTrainedAlgorithmicMedia,
                ));
                builder.add_action(created(agent, AI_MANIPULATED))?;
                for component in components {
                    add_ingredient(builder, &component.asset, "componentOf", &component.slot)?;
                    builder.add_action(placement(agent, &component.slot).to_action(Some(&component.slot)))?;
                    for edit in &component.edits {
                        builder.add_action(edit.to_action(Some(&component.slot)))?;
                    }
                }
            }
        }
        Ok(())
    }
}

fn created(agent: &str, source_type: &str) -> Value {
    json!({ "action": CREATED, "digitalSourceType": source_type, "softwareAgent": { "name": agent } })
}

fn placement(agent: &str, slot: &str) -> Edit {
    Edit {
        action: PLACED.into(),
        agent: agent.into(),
        ai: false,
        description: Some(format!("Placed in the {slot} slot")),
        region: None,
    }
}

fn derived_link<'a>(edit: &Edit, placed: &'a Option<Placed>) -> Option<&'a str> {
    if PARENT_LINKED_ACTIONS.contains(&edit.action.as_str()) {
        return Some(PARENT_SLOT);
    }
    if edit.action == PLACED {
        return placed.as_ref().map(|placed| placed.slot.as_str());
    }
    None
}

fn add_ingredient(builder: &mut Builder, asset: &Asset, relationship: &str, slot: &str) -> Result<()> {
    let ingredient = json!({
        "format": asset.format()?,
        "instance_id": slot,
        "relationship": relationship,
        "title": asset.title(),
    });
    builder.add_ingredient_from_stream(
        ingredient.to_string(),
        &asset.format()?,
        &mut Cursor::new(asset.bytes()?),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn edit(action: &str, ai: bool, region: Option<Region>) -> Edit {
        Edit {
            action: action.into(),
            agent: "test".into(),
            ai,
            description: None,
            region,
        }
    }

    #[test]
    fn unknown_kinds_are_rejected() {
        assert!(edit("c2pa.bogus", false, None).validate().is_err());
        assert!(edit("c2pa.cropped", true, None).validate().is_err());
        assert!(edit("c2pa.cropped", false, None).validate().is_ok());
        assert!(edit("c2pa.upscaled", true, None).validate().is_ok());
    }

    #[test]
    fn malformed_regions_are_rejected() {
        let good = Region {
            height: 40.0,
            width: 30.0,
            x: 10.0,
            y: 20.0,
        };
        assert!(edit("c2pa.cropped", false, Some(good)).validate().is_ok());
        for bad in [
            Region { width: 0.0, ..good },
            Region { x: -1.0, ..good },
            Region {
                height: f64::NAN,
                ..good
            },
        ] {
            assert!(edit("c2pa.cropped", false, Some(bad)).validate().is_err());
        }
    }
}
