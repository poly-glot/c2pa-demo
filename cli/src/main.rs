use anyhow::{Context as _, Result};
use clap::{Args, Parser, Subcommand};
use provenance::credentials::{self, Overrides};
use provenance::manifest::{self, Asset, Component, Edit, InvalidInput, Manifest, Placed, Region};
use provenance::report::Report;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const DEFAULT_AGENT: &str = concat!("provenance/", env!("CARGO_PKG_VERSION"));
const INVALID_INPUT_EXIT: i32 = 2;

#[derive(Parser)]
#[command(version, about = "Sign and inspect C2PA provenance", disable_help_subcommand = true)]
struct Cli {
    #[command(subcommand)]
    command: Command,
    /// Print the provenance report as JSON, or null when the output is unsigned
    #[arg(long, global = true)]
    json: bool,
    #[command(flatten)]
    signing: SigningOptions,
}

#[derive(Subcommand)]
enum Command {
    /// Sign an AI-generated image or video
    Create {
        input: PathBuf,
        #[command(flatten)]
        options: SignOptions,
    },
    /// Sign an edited image or video as derived from the original
    ///
    /// A manual edit is signed only when the original or the placed image already declares AI;
    /// otherwise the output is an unsigned copy of the edited file.
    Edit {
        original: PathBuf,
        edited: PathBuf,
        /// C2PA action recorded for the edit
        #[arg(long, default_value = manifest::EDITED, value_name = "ACTION")]
        action: String,
        /// The edit was made by AI
        #[arg(long)]
        ai: bool,
        /// Description recorded with the action
        #[arg(long, value_name = "TEXT")]
        description: Option<String>,
        /// Pixel rectangle the edit changed
        #[arg(long, value_name = "X,Y,WIDTH,HEIGHT", value_parser = parse_region)]
        region: Option<Region>,
        /// Image placed onto the original and the slot it fills
        #[arg(long, value_name = "SLOT=PATH", value_parser = parse_placed)]
        placed: Option<Placed>,
        #[command(flatten)]
        options: SignOptions,
    },
    /// Sign a render composed from component images
    ///
    /// The composite is signed only when a component already declares AI;
    /// otherwise the output is an unsigned copy of the rendered file.
    Compose {
        rendered: PathBuf,
        /// A component image and the slot it fills
        #[arg(long, required = true, value_name = "SLOT=PATH", value_parser = parse_component)]
        component: Vec<Component>,
        /// A manual adjustment made to a component
        #[arg(long, value_name = "SLOT=ACTION=DESCRIPTION", value_parser = parse_slot_edit)]
        edit: Vec<SlotEdit>,
        #[command(flatten)]
        options: SignOptions,
    },
    /// Show the provenance of an image or video
    Inspect { input: PathBuf },
}

#[derive(Args)]
struct SignOptions {
    /// Signed copy to write [default: <name>.signed.<ext> beside the input]
    #[arg(short, long)]
    output: Option<PathBuf>,
    /// Software recorded as the agent of the signed actions
    #[arg(long, default_value = DEFAULT_AGENT)]
    agent: String,
}

#[derive(Args)]
struct SigningOptions {
    /// PEM certificate chain, signing certificate first; overrides the embedded chain
    #[arg(long, global = true, env = "C2PA_CERT", value_name = "PEM")]
    cert: Option<PathBuf>,
    /// PKCS#8 PEM private key for the signing certificate; overrides the embedded key
    #[arg(long, global = true, env = "C2PA_KEY", value_name = "PEM")]
    key: Option<PathBuf>,
    #[arg(long, global = true, env = "C2PA_KEY_PEM", hide = true)]
    key_pem: Option<String>,
    /// RFC 3161 timestamp authority URL
    #[arg(long, global = true, env = "C2PA_TSA", value_name = "URL")]
    tsa: Option<String>,
}

impl SigningOptions {
    fn overrides(&self) -> Overrides {
        Overrides {
            cert: self.cert.clone(),
            key: self.key.clone(),
            key_pem: self.key_pem.clone(),
            tsa: self.tsa.clone(),
        }
    }
}

#[derive(Debug, Clone)]
struct SlotEdit {
    action: String,
    description: String,
    slot: String,
}

fn parse_region(value: &str) -> Result<Region, String> {
    let numbers: Vec<f64> = value
        .split(',')
        .map(|part| part.trim().parse::<f64>().map_err(|error| format!("{part}: {error}")))
        .collect::<Result<_, _>>()?;
    match numbers[..] {
        [x, y, width, height] => Ok(Region { height, width, x, y }),
        _ => Err("expected x,y,width,height".into()),
    }
}

fn parse_slot_and_path(value: &str) -> Result<(String, Asset), String> {
    let (slot, path) = value.split_once('=').ok_or("expected slot=path")?;
    let asset = Asset::from_path(Path::new(path)).map_err(|error| error.to_string())?;
    Ok((slot.to_string(), asset))
}

fn parse_placed(value: &str) -> Result<Placed, String> {
    let (slot, asset) = parse_slot_and_path(value)?;
    Ok(Placed { asset, slot })
}

fn parse_component(value: &str) -> Result<Component, String> {
    let (slot, asset) = parse_slot_and_path(value)?;
    Ok(Component {
        asset,
        slot,
        edits: Vec::new(),
    })
}

fn parse_slot_edit(value: &str) -> Result<SlotEdit, String> {
    let mut parts = value.splitn(3, '=');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(slot), Some(action), Some(description)) => Ok(SlotEdit {
            action: action.to_string(),
            description: description.to_string(),
            slot: slot.to_string(),
        }),
        _ => Err("expected slot=action=description".into()),
    }
}

fn main() {
    let cli = Cli::parse();
    if let Err(error) = run(cli) {
        eprintln!("provenance: {error:#}");
        let code = if error.downcast_ref::<InvalidInput>().is_some() {
            INVALID_INPUT_EXIT
        } else {
            1
        };
        std::process::exit(code);
    }
}

fn run(cli: Cli) -> Result<()> {
    match &cli.command {
        Command::Create { input, options } => {
            let manifest = Manifest::Generated {
                agent: options.agent.clone(),
            };
            sign(input, manifest, options, &cli)
        }
        Command::Edit {
            original,
            edited,
            action,
            ai,
            description,
            region,
            placed,
            options,
        } => {
            let manifest = Manifest::Derived {
                parent: Asset::from_path(original)?,
                placed: placed.clone(),
                edit: Edit {
                    action: action.clone(),
                    agent: options.agent.clone(),
                    ai: *ai,
                    description: description.clone(),
                    region: *region,
                },
            };
            sign(edited, manifest, options, &cli)
        }
        Command::Compose {
            rendered,
            component,
            edit,
            options,
        } => {
            let manifest = Manifest::Composite {
                agent: options.agent.clone(),
                components: with_slot_edits(component.clone(), edit, &options.agent)?,
            };
            sign(rendered, manifest, options, &cli)
        }
        Command::Inspect { input } => inspect(input, cli.json),
    }
}

fn with_slot_edits(mut components: Vec<Component>, edits: &[SlotEdit], agent: &str) -> Result<Vec<Component>> {
    for edit in edits {
        let component = components
            .iter_mut()
            .find(|component| component.slot == edit.slot)
            .ok_or_else(|| InvalidInput(format!("no component fills the {} slot", edit.slot)))?;
        component.edits.push(Edit {
            action: edit.action.clone(),
            agent: agent.to_string(),
            ai: false,
            description: Some(edit.description.clone()),
            region: None,
        });
    }
    Ok(components)
}

fn sign(input: &Path, manifest: Manifest, options: &SignOptions, cli: &Cli) -> Result<()> {
    let output = options.output.clone().unwrap_or_else(|| signed_name(input));
    let context = Arc::new(credentials::signing_context(&cli.signing.overrides())?);
    let report = manifest.sign(&Asset::from_path(input)?, &output, &context)?;

    match (&report, cli.json) {
        (_, true) => println!("{}", serde_json::to_string(&report)?),
        (Some(report), false) => println!("{}: {}", output.display(), report.summary),
        (None, false) => println!("{}: left unsigned, nothing in its lineage declares AI", output.display()),
    }
    Ok(())
}

fn inspect(input: &Path, json: bool) -> Result<()> {
    let asset = Asset::from_path(input)?;
    let report = Report::read(&asset.format()?, &asset.bytes()?, &Arc::new(credentials::reader_context()?))?;

    if json {
        println!("{}", serde_json::to_string(&report)?);
        return Ok(());
    }
    let report = report.with_context(|| format!("{} carries no C2PA manifest", input.display()))?;
    println!("{}", report.summary);
    report
        .failures
        .iter()
        .for_each(|failure| println!("invalid: {failure}"));
    if !report.is_valid {
        anyhow::bail!("{} did not validate", input.display());
    }
    Ok(())
}

fn signed_name(path: &Path) -> PathBuf {
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let name = match path.extension() {
        Some(extension) => format!("{stem}.signed.{}", extension.to_string_lossy()),
        None => format!("{stem}.signed"),
    };
    path.with_file_name(name)
}
