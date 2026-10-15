# Production workstream: Content Credentials demo

Target design: version 2 artboards of the canvas "Content Credentials demo — redesign"
(`Empty-v2`, `Main-v2`, `AfterEdit-v2`). Local copies:
`/private/tmp/claude-507/-Users-junaidahmed-Desktop-eu-investigations-example/c9a17722-5aee-4ffc-8206-56c6e52e1ab3/scratchpad/artifact-files/6813dd12-12f4-4d27-b4c3-d7b61c8590ee/project/*.dc.html`

## Days

| Day | Phase                            | Owner       | Outcome                                                                   |
| --- | -------------------------------- | ----------- | ------------------------------------------------------------------------- |
| 1   | 0 Plan and contract              | lead        | this file, API contract below                                             |
| 1   | 1A Provenance core               | opus        | full C2PA action vocabulary, regions, timeline JSON, server routes, tests |
| 1   | 1B Front end to v2 design        | opus        | new shell, status bar, sources strip, canvas, credentials panel           |
| 1   | 1C Edit tools                    | sonnet      | every applicable C2PA action as a browser tool, manual and AI             |
| 1   | 1D Templates                     | sonnet      | text slots, per-slot edits, three more templates, use-in-template         |
| 2   | 2 Integrate and verify in Chrome | lead        | design parity and every tool exercised end to end                         |
| 2   | 3 Docs                           | haiku       | README, lessons                                                           |
| 3   | 4 Review                         | opus + lead | ponytail review with CodeGraph and LSP, SOLID and clean-code pass, fixes  |
| 3   | 5 Commit                         | lead        | one commit per phase, no push                                             |

## Design tokens (from the v2 artboards)

```
ink #1a1a1a · muted #616161 · faint #9e9e9e · hairline #e5e5e5 · tray #f9f9f9 · paper #ffffff
accent (teal) #2193b0, hover #1b7f99 · navy #01189b, hover #000f6b · caution text #8a5a00
font: -apple-system, 'Helvetica Neue', Helvetica, system-ui, sans-serif · body 13px/1.5 · label 11px uppercase .06em
mono: ui-monospace, 'SF Mono', Menlo, monospace
spacing: 3 5 8 13 21 34 55 (golden) · square corners everywhere · hairline borders, no shadows
buttons: 44px high primary, 34px high quiet tools · thumbs 89px square · status dot 8px square
header 64px · status bar min 76px · main split flex 1.618 : 1 · credentials pane on tray background
```

## Screens

1. **First run** (`Empty-v2`): headline, four numbered steps, file input, three sample cards with a status chip each
   (No credentials / AI generated / Camera signed), credentials pane says "Nothing to verify yet".
2. **Editor** (`Main-v2`): header (title, Source link), status bar (file name mono, "Signature valid", "No AI content" or
   "AI edited" chips; Reset demo, New from template, Download signed JPEG), Sources strip with Upload image, canvas with
   version tabs (Original, v2 …), dimensions label, edit tools section, AI edit bar, credentials pane with
   Summary / Raw manifest tabs, signature block with trust caveat, AI content and Produced with, "What happened to this
   image" timeline, Ingredients list, Technical details, Compare button (disabled on the original).
3. **After an edit** (`AfterEdit-v2`): status line "Edit applied and signed", Before/After segmented control, timeline
   entry marked New, Compare manifests enabled.

## API contract (server ↔ browser)

`Provenance.toJSON()` returns, in addition to today's `signer`, `isValid`, `signerTrust`, `failures`, `parent`,
`components`, `aiActions`, `store`:

```js
{
  claimGenerator: { name, version } | null,          // active manifest claim_generator_info[0]
  manifestId: string,                                 // active manifest label (urn:c2pa:…)
  instanceId: string | null,                          // active manifest instance_id
  parentManifestId: string | null,
  actions: [ActionView],                              // active manifest only
  timeline: [ActionView],                             // whole chain, newest manifest first
}
ActionView = {
  action: 'c2pa.edited' | …,                          // raw label
  agent: string,                                      // softwareAgent name or 'unknown'
  description: string | null,                         // parameters.description
  digitalSourceType: string | null,
  kind: 'AI generated' | 'AI manipulated' | 'AI enhanced' | 'not AI',
  manifestId: string,
  region: { height, width, x, y } | null,             // first spatial rectangle in `changes`
  title: string,                                      // manifest title the action came from
  when: string | null,
}
```

Routes:

```
POST /api/edits/manual   { description, edited, kind, parent, region?, title, placed? }
                         kind ∈ ActionKind manual set; region = {x,y,width,height} px;
                         placed = { image, title, slot } component ingredient for c2pa.placed
POST /api/edits/ai       { input?, instruction, kind, parent, region?, title }
                         input = the image the model edits when it differs from the parent (outpaint sends the padded canvas); the parent stays the ingredient
                         kind ∈ { c2pa.edited, c2pa.inpainting, c2pa.outpainting, c2pa.upscaled }
POST /api/edits/template { components: [{ image, slot, title, edits: [{ description, kind }] }], rendered, text: { name: value }, title }
```

Every derived manifest records `c2pa.opened` (Builder adds it under the edit intent) and the action list. Regions
go into `changes: [{ region: [{ type: 'spatial', shape: { type: 'rectangle', unit: 'pixel', origin: {x,y}, width, height } }] }]`.

## Edit tools (every C2PA action a still image can honestly carry)

| Tool                                                      | Action                 | Source type                          | Notes                                                                                                                     |
| --------------------------------------------------------- | ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Black & white, Brightness, Contrast, Saturation           | c2pa.color_adjustments | none                                 | sliders apply on commit                                                                                                   |
| Sharpen, Blur, Sepia, Invert                              | c2pa.filtered          | none                                 |                                                                                                                           |
| Rotate left, Rotate right, Flip horizontal, Flip vertical | c2pa.orientation       | none                                 |                                                                                                                           |
| Resize                                                    | c2pa.resized           | none                                 | width in px                                                                                                               |
| Crop selection                                            | c2pa.cropped           | none                                 | region recorded                                                                                                           |
| Draw                                                      | c2pa.drawing           | none                                 | brush strokes on the preview, bounding box as region                                                                      |
| Erase selection                                           | c2pa.edited            | none                                 | region filled with the surrounding average colour; the signing library reserves `c2pa.removed` for removing an ingredient |
| Place image                                               | c2pa.placed            | none                                 | library layer placed into the selection, componentOf ingredient                                                           |
| Export as PNG / WebP                                      | c2pa.converted         | none                                 | new layer in the new format                                                                                               |
| Re-encode JPEG quality                                    | c2pa.transcoded        | none                                 |                                                                                                                           |
| Publish                                                   | c2pa.published         | none                                 | signs a final layer and downloads it                                                                                      |
| AI edit                                                   | c2pa.edited            | compositeWithTrainedAlgorithmicMedia | existing                                                                                                                  |
| AI inpaint selection                                      | c2pa.inpainting        | compositeWithTrainedAlgorithmicMedia | region recorded, prompt scoped to it                                                                                      |
| AI outpaint                                               | c2pa.outpainting       | compositeWithTrainedAlgorithmicMedia | canvas padded by a chosen margin, model fills it                                                                          |
| AI upscale                                                | c2pa.upscaled          | algorithmicallyEnhanced              | model asked for 2×                                                                                                        |

`c2pa.repackaged` is for containers (MP4 → MOV) and does not apply to still images. `c2pa.created` and `c2pa.placed`
on templates stay as they are. `c2pa.opened` is automatic.

## Module ownership (disjoint, so agents work in one tree at once)

| Agent         | Owns                                                                                                                                   | Must not touch                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1A provenance | `lib/**`, `config/**`, `server.mjs`, `main.mjs`, `test/provenance*.test.mjs`, `test/compose.test.mjs`                                  | `web/**`, `templates/**`                        |
| 1B front end  | `web/index.html`, `web/app.css`, `web/app.mjs`, `web/store.mjs`, `web/features/**` except compose*, `web/dom.mjs`, `web/api.mjs`       | `lib/**`, `web/edits/**`, compose files         |
| 1C edit tools | `web/edits/**` (new), `test/edits*.test.mjs`                                                                                           | everything else                                 |
| 1D templates  | `templates/**`, `web/features/compose*.mjs`, `web/features/compose.css`, `web/features/template-render.mjs`, `test/template*.test.mjs` | `lib/**` (ask 1A via contract), other web files |

Shared contract for 1B ↔ 1C: `web/edits/registry.mjs` exports

```js
export const TOOLS = [{
  id: 'rotateRight',            // stable id used in data-tool
  label: 'Rotate right',
  group: 'Orientation',         // Adjust · Filters · Orientation · Geometry · Paint · Place · Export · AI
  needs: ['selection'] | ['width'] | ['sliders'] | ['prompt'] | ['layer'] | [],   // what the UI must collect
  mode: 'manual' | 'ai' | 'publish',
  apply(image, params) → HTMLCanvasElement,           // manual only; pure, no DOM side effects beyond a canvas
  edit(params) → { description, kind, region? },      // manual only
  request(params) → { instruction, kind, region? },   // ai only
}]
```

The UI (1B) renders groups and collects `params = { selection, width, sliders: {brightness, contrast, saturation}, quality, format, prompt, layer, margin, strokes }`,
then calls `apply`/`edit` or `request` and posts through `web/api.mjs`.

## Quality bar (phase 4 checks)

- `npm run check` green: ESLint, Prettier, node:test, self-check.
- No comments in code; intent through names. Shared constants once. No duplicated structural literals.
- One module, one reason to change: vocabulary, action value objects, manifest builders, provenance reader, HTTP, UI feature each separate.
- Pure functions take their inputs; the store is the only state holder in the browser.
- Chrome verification: every tool produces a signed layer whose manifest shows the expected action, region and source type; screens match the v2 artboards at 1440 wide and stack at phone width.
