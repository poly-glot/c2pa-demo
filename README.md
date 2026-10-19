# ai-provenance

Edits or generates an image with an AI image model, and signs the result with a C2PA manifest that records the edit, the model that
made it, and the original image it was derived from.

The result is a JPEG, PNG, WebP or MP4 file that any C2PA reader can open to see who signed it, what was done to it, and what it
was made from.

## Requirements

- Node.js 22.9 or later (the scripts use `--env-file-if-exists`)
- OpenSSL, only if you want to generate your own test certificate
- FFmpeg on the `PATH`, only for the video tools and `npm run reference-clip`
- An API key for the LLM gateway, only for real AI edits (the self-check runs without one)

## Installation

```sh
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable            | Purpose                                                                      | Default                                      |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `APP_PASSWORD`      | Password every request must carry; unset leaves the demo open                | unset, open                                  |
| `LLM_API_KEY`       | Bearer token for the gateway                                                 | none, required for real edits                |
| `LLM_GATEWAY_URL`   | OpenAI-compatible chat completions endpoint                                  | none, required for real edits                |
| `LLM_IMAGE_MODEL`   | Image model to request                                                       | `gemini-3.1-flash-image`                     |
| `PORT`              | Port the browser demo listens on                                             | `8787`                                       |
| `C2PA_CERT`         | PEM certificate chain used to sign manifests                                 | `cert/claim-signer.pem`                      |
| `C2PA_KEY`          | PEM private key (ES256) for that certificate                                 | `cert/claim-signer.key`                      |
| `C2PA_KEY_PEM`      | The same key as PEM text, for a Secret Manager env var; wins over `C2PA_KEY` | unset                                        |
| `C2PA_TSA`          | Timestamp authority URL, optional                                            | none                                         |
| `C2PA_USER_ANCHORS` | Comma-separated PEM files of extra CA certificates to trust                  | `cert/root-ca.pem` and the test intermediate |
| `SELFCHECK`         | Set to `1` to skip the model and copy the image through unchanged            | unset                                        |

### Trust list

The reader validates signers against the official C2PA trust list published by the Content Authenticity Initiative: `cert/trust/anchors.pem` (trust anchors), `cert/trust/allowed.sha256.txt` (individually allowed certificates) and `cert/trust/store.cfg` (permitted extended key usages). Refresh them with:

```sh
npm run trust
```

A signer whose chain ends at one of those anchors shows as trusted. Anything else shows as untrusted, however well formed its certificate is. To trust additional signers of your own choosing, set `C2PA_USER_ANCHORS` to a comma-separated list of PEM files holding CA certificates. The default trusts `cert/root-ca.pem`, so manifests this project signs show as trusted, and `cert/trust/test-intermediate-ca.pem`, the intermediate CA that signed the previous NOVA sample. The NOVA sample is now signed by the project's own test chain, so that intermediate is kept only until it is retired.

Open item: the Confluence test root from Scenario 6 is not yet trusted. When its PEM is available, add it to `C2PA_USER_ANCHORS` and to the default list in `config/index.mjs`, so the Scenario 6 assets verify as trusted.

### Signing certificate

The repository ships a test certificate (`cert/claim-signer.pem`) issued by a private root CA. It is for development
only. Readers outside this project will show the signer as untrusted because the root is not on any trust list.

The private keys are not committed. Generate a fresh test pair with:

```sh
npm run certs
```

This writes `cert/root-ca.key`, `cert/root-ca.pem`, `cert/claim-signer.key` and `cert/claim-signer.pem`. For production,
point `C2PA_CERT` and `C2PA_KEY` at a certificate issued by a CA on the C2PA trust list.

## Usage

```sh
npm start -- <input image> <output image> [instruction]
```

The instruction is free text passed to the model. When omitted it defaults to "Change the sparkling water bottle and its
label to orange."

### Editing the original image with AI

The NOVA sample in `samples/` carries a clean `c2pa.created` manifest (see Samples). To recolour it and sign the result:

```sh
npm start -- \
  ./samples/NOVA-SPK-500ML_Hero_Studio_2400x2400_AI-Generated_DAT-Create.jpg \
  ./assets/NOVA-SPK-500ML_Hero_Studio_orange.jpg \
  "Change the sparkling water bottle and its label to orange."
```

What happens:

1. The input is read and its MIME type taken from the file extension.
2. The image and instruction are sent to the gateway as a chat completion with image output. The model is told to keep
   the aspect ratio and framing.
3. The returned image is wrapped in a new manifest that:
    - names the input as its `parentOf` ingredient, carrying the input's own manifest forward;
    - records a `c2pa.edited` action with digital source type `compositeWithTrainedAlgorithmicMedia`, the model name as
      `softwareAgent`. The action has no parameters, so the instruction is not written into the manifest;
    - is signed with the configured certificate.
4. The signed bytes are written to the output path.
5. The output is read back and checked: the manifest validates, it declares an AI manipulation, and the parent manifest
   is present. The script exits non-zero if any of these fail.

On success it prints a one-line summary, for example:

```
./assets/NOVA-SPK-500ML_Hero_Studio_orange.jpg: signed by <<signer>>, actions c2pa.opened, c2pa.edited, parent NOVA-SPK-500ML_Hero_Studio_2400x2400_AI-Generated_DAT-Create.jpg with its manifest
```

The `assets/` directory is for output and is ignored by git.

### Running without the model

The self-check replaces the model with a pass-through editor, so the output is the input with a new manifest attached.
Use it to test signing and verification without an API key:

```sh
npm run selfcheck -- <input image> <output image>
```

`npm run check` runs ESLint, Prettier, the unit tests and the self-check against the sample asset in one go.

## Browser demo

```sh
npm run serve
```

Open http://localhost:8787. The port can be changed with the `PORT` environment variable.

### Password

Set `APP_PASSWORD` to protect the demo. Every request, static files and API alike, is then refused until the password is presented: the browser shows a sign-in page and keeps a `__session` cookie (HttpOnly, SameSite=Strict, Secure behind HTTPS, a keyed hash that every instance derives from the same password) once the password is accepted, and scripts can send the `x-app-password` header instead. Log out in the status bar clears the cookie. The cookie never carries the password itself. It is named `__session` because Firebase Hosting forwards no other cookie to Cloud Run, and every response is sent with `Cache-Control: private, no-store` so the Hosting CDN never caches a signed-in page. `GET /api/health` answers without a password for the Cloud Run probes. With `APP_PASSWORD` unset the demo is open.

### Samples

Four samples are included, and a reference clip for the video tools. The NOVA bottle was generated by an AI tool. It was re-signed locally with a clean create manifest (one `c2pa.created` action, digital source type `trainedAlgorithmicMedia`, no prompt and no thumbnail) using the project's own test certificate. The mountain lake is a photograph from Unsplash (Alexey Topolyanskiy) with no manifest at all, which is how most photographs arrive today. The library photograph is `truepic-20230212-library.jpg` from the C2PA public test files, captured and signed in 2023 by the Truepic Lens camera SDK with a certificate on the official trust list, so it shows as a trusted signer with no AI content. Its manifest follows the 2023 version of the specification and hashes the image with the whole JPEG header excluded, which the current library no longer accepts, so the panel reports the data hash mismatch while the reference report shipped alongside the file marks it valid. `Reference-Clip_AI-Generated_DAT-Create.mp4` is a three-second test-pattern clip made with FFmpeg and signed as an AI-generated `c2pa.created` asset; `npm run reference-clip` regenerates it.

### Screens

**First run.** Shown until a source is open. It has a headline, four numbered steps, a drop zone ("Drop a JPEG, PNG or WebP here") with a Choose a file button, and three sample cards, each with a status chip: No credentials, AI generated or Camera signed. The credentials pane reads "Nothing to verify yet". A Generate image bar, also shown in the sources strip, takes a prompt and creates a new AI image (see Generate image below).

**Editor.** Shown once a source is selected, from top to bottom:

- the status bar: the file name in mono, with the version suffix for edited layers (for example `· v2`), a signature chip ("Signature valid" or "Signature NOT valid"), an AI chip ("No AI content", "AI edited" or "AI generated"), and the buttons Reset demo, Log out (only when a password is set), New from template and Download (labelled "Download signed JPEG/PNG/WebP/MP4" when the layer is signed, "Download JPEG/…" when it is not; disabled until a source is open);
- the sources strip: Upload image and a thumbnail for each source, with its credential status after the name;
- the canvas: version tabs (Original, v2, v3 …), the pixel dimensions with the number of placed ingredients, and the preview. Dragging over the preview makes a selection of at least 8 px in width and height; Brush turns dragging into strokes;
- the tool groups and the AI prompt bar, with a note line beneath that shows the last edit or an error;
- the credentials pane on the right.

**After an edit.** The new layer becomes the selected version. The canvas shows "Edit applied and signed" with a "See what changed" link to the credentials pane, the new timeline entry is marked New, and the note line reads "Last edit: “…” · recorded as …" (for AI edits the quoted caption is the tool name, never the prompt). When the scope rule leaves the edit unsigned, the canvas shows "Edit applied, not signed" and the note says no manifest was written. Before and After switch the canvas between the parent layer and the new layer, and Compare with previous version is enabled.

### Edit tools

An edit signs its output as a new layer whose manifest carries the parent as a `parentOf` ingredient, subject to the AI scope rule below: AI edits always sign, and other edits sign only when the image is AI-declared. Manual tools name the browser canvas editor as the software agent; AI tools name the gateway model; video tools name ffmpeg.

The Adjust row holds the four everyday tools (Black & white, Sharpen, Resize with its width inline, Crop selection) and the AI edit bar. Every other tool sits under Advanced filters, a collapsed section that opens downwards.

| Tool                 | Recorded action          | Digital source type                    | Needs                                                                               | Manifest records                                                                                                                                            |
| -------------------- | ------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Black & white        | `c2pa.color_adjustments` | none                                   | nothing                                                                             | “Converted to black and white”                                                                                                                              |
| Colour (Apply)       | `c2pa.color_adjustments` | none                                   | sliders: Brightness, Contrast, Saturation (0–200 %, default 100), applied on commit | “Adjusted Brightness 120%, …”, or “Adjusted colour” when no slider moved                                                                                    |
| Sharpen              | `c2pa.filtered`          | none                                   | nothing                                                                             | “Sharpened with a 3×3 kernel”                                                                                                                               |
| Blur                 | `c2pa.filtered`          | none                                   | nothing                                                                             | “Blurred with a 4px radius”                                                                                                                                 |
| Sepia                | `c2pa.filtered`          | none                                   | nothing                                                                             | “Applied a sepia tone”                                                                                                                                      |
| Invert               | `c2pa.filtered`          | none                                   | nothing                                                                             | “Inverted the colours”                                                                                                                                      |
| Rotate left          | `c2pa.orientation`       | none                                   | nothing                                                                             | “Rotated 90° anticlockwise”                                                                                                                                 |
| Rotate right         | `c2pa.orientation`       | none                                   | nothing                                                                             | “Rotated 90° clockwise”                                                                                                                                     |
| Flip horizontal      | `c2pa.orientation`       | none                                   | nothing                                                                             | “Flipped horizontally”                                                                                                                                      |
| Flip vertical        | `c2pa.orientation`       | none                                   | nothing                                                                             | “Flipped vertically”                                                                                                                                        |
| Resize               | `c2pa.resized`           | none                                   | width in px (defaults to the open layer's width)                                    | “Resized to N px wide”                                                                                                                                      |
| Crop selection       | `c2pa.cropped`           | none                                   | a selection                                                                         | “Cropped to W×H at x,y”, with the selection as `changes`                                                                                                    |
| Draw                 | `c2pa.drawing`           | none                                   | brush strokes                                                                       | “Drew over W×H at x,y”, with the strokes' bounding box as `changes`                                                                                         |
| Erase selection      | `c2pa.edited`            | none                                   | a selection                                                                         | “Erased W×H at x,y”, with the selection as `changes`; the area is filled with the mean colour of its surround                                               |
| Place image          | `c2pa.placed`            | none                                   | a selection and a layer chosen in the Layer list                                    | “Placed an image at x,y W×H”, with the selection as `changes` and a `componentOf` ingredient (slot `overlay`)                                               |
| Export as PNG        | `c2pa.converted`         | none                                   | nothing                                                                             | “Converted to PNG”; the new layer is a PNG                                                                                                                  |
| Export as WebP       | `c2pa.converted`         | none                                   | nothing                                                                             | “Converted to WebP”; the new layer is a WebP                                                                                                                |
| Re-encode JPEG       | `c2pa.transcoded`        | none                                   | quality slider, 1–100 (default 80)                                                  | “Re-encoded as JPEG at quality N”                                                                                                                           |
| Publish              | `c2pa.published`         | none                                   | nothing                                                                             | “Published as a signed image” when signed; the final layer is signed in the parent format only when the AI scope rule applies, and is downloaded either way |
| AI edit              | `c2pa.edited`            | `compositeWithTrainedAlgorithmicMedia` | a prompt                                                                            | no parameters                                                                                                                                               |
| AI inpaint selection | `c2pa.inpainting`        | `compositeWithTrainedAlgorithmicMedia` | a prompt and a selection                                                            | no parameters, with the selection as `changes`                                                                                                              |
| AI outpaint          | `c2pa.outpainting`       | `compositeWithTrainedAlgorithmicMedia` | a prompt and a margin in px (8–1024, default 128)                                   | no parameters                                                                                                                                               |
| AI upscale 2×        | `c2pa.upscaled`          | `compositeWithTrainedAlgorithmicMedia` | nothing                                                                             | no parameters                                                                                                                                               |

Notes on the table:

- Erase is recorded as `c2pa.edited` because `c2pa.removed` is reserved by the spec for removing an ingredient. Erasing pixels removes no ingredient, so the action is an edit.
- `c2pa.repackaged` is for containers such as MP4 to MOV and does not apply to still images, so no tool records it.
- `c2pa.opened` is added automatically to every derived manifest.
- `c2pa.converted` (Export) and `c2pa.transcoded` (Re-encode and Transcode video) reference the parent ingredient through `ingredientIds`, as `c2pa.placed` references its component.
- `c2pa.inpainting`, `c2pa.outpainting` and `c2pa.upscaled` follow the C2PA 2.x generative action labels, and the library signs and validates them.
- Export tools change the container of the new layer. The action records only the description, not the format.
- Manual actions carry no digital source type, so the credentials show them as manual in the timeline.

### AI edits

- **AI edit** sends the open layer and the prompt to the gateway model. The returned image is signed as `c2pa.edited` with `compositeWithTrainedAlgorithmicMedia`. The prompt goes to the model only and is not recorded.
- **AI inpaint selection** sends the whole image with an instruction scoped to the selection: the prompt, then "Change only the region x,y,width,height px of the image; leave everything outside it exactly as it is." The rectangle is recorded in the manifest as `changes`. The prompt and the scoped instruction go to the model only.
- **AI outpaint** pads the open layer with a white margin in the browser. The padded image is sent to the model as its input. The signed parent ingredient is still the real previous version, so the chain is unbroken and the padding never becomes a parent.
- **AI upscale 2×** asks the model for twice the width and height and signs the result with `compositeWithTrainedAlgorithmicMedia`. Generative upscaling creates new pixels, so it is AI. The IPTC value `algorithmicallyEnhanced` covers non-generative clean-up and is not treated as AI.

Every gateway request also carries the fixed rules "Keep the image's aspect ratio and framing; change only what is asked."

### AI scope

A file is AI-declared when any manifest in its history declares one of three IPTC digital source types: `trainedAlgorithmicMedia`, `compositeWithTrainedAlgorithmicMedia` or `compositeSynthetic`. The declaration is read from the `digitalSourceType` of every action and from the `Iptc4xmpExt:DigitalSourceType` field of the `stds.iptc` assertion, across every manifest in the store.

- An AI edit (AI edit, inpaint, outpaint or upscale) always signs its output.
- A manual edit, a video edit or a template render signs its output only when an input is AI-declared. A placed image counts as an input, so placing an AI-declared image on a non-AI image signs the result. Otherwise the output is returned unsigned, with no manifest, and the credentials pane shows "No credentials".
- The header chip reads "AI generated" when any manifest declares `trainedAlgorithmicMedia`, "AI edited" when any declares one of the other two types, and "No AI content" otherwise.

### Generate image

The Generate image bar takes a prompt and sends it to the gateway model with no input image. `POST /api/create` signs the result as the first manifest of a new asset: one `c2pa.created` action with digital source type `trainedAlgorithmicMedia`, the model as `softwareAgent`, no parent and no parameters. The prompt is not recorded. The image is added as a source titled `AI-Generated_YYYYMMDD-HHMMSS`.

### Video

MP4 files are read and validated like images, and can be uploaded from the sources strip. Two tools apply to a selected video:

- **Transcode video** re-encodes the clip as H.264 (`libx264`, `yuv420p`, CRF 28, audio removed) and records `c2pa.transcoded` with the parent linked through `ingredientIds`.
- **Resize video** scales the width to an even number of pixels between 16 and 7680 and records `c2pa.resized`.

Both run `ffmpeg` on the server through `POST /api/edits/video`, with the ffmpeg agent as the software agent, and follow the AI scope rule above. Composites with a video input are not built: template slots take images only.

### Templates

Templates are HTML files in `templates/`. The `<body>` declares its pixel size with `data-width` and `data-height`, each image placeholder is `<img data-slot="name">`, and each editable text is an element with `data-text="name"`.

| Template             | Size (px)   | Image slots         | Text slots        |
| -------------------- | ----------- | ------------------- | ----------------- |
| `two-up.html`        | 1600 × 900  | left, right         | none              |
| `three-up.html`      | 1800 × 800  | left, centre, right | none              |
| `hero-caption.html`  | 1600 × 1000 | hero                | headline, caption |
| `social-square.html` | 1080 × 1080 | photo, logo         | headline          |

The composer works as follows:

- Each slot has a layer dropdown listing every source and edit in the library, an Upload link that adds a file to the library and selects it, and an Adjust dropdown. Adjust offers the manual tools that need no input: Black & white, Sharpen, Blur, Sepia, Invert, Rotate left, Rotate right, Flip horizontal and Flip vertical. Export tools are left out because the render is always a JPEG.
- The chosen adjustment is applied to the slot's pixels in the preview and in the render, and it is recorded as an action linked to that slot's ingredient (`parameters.ingredientIds`).
- The ingredient is always the layer as chosen, with its own manifest, so its credentials travel with it. The adjusted pixels are not sent as the ingredient.
- Text values are rendered into the image and are not recorded in the manifest.
- The `c2pa.created` action has digital source type `compositeWithTrainedAlgorithmicMedia` and no parameters. The render is signed only when at least one ingredient is AI-declared, and is returned unsigned otherwise. Each slot adds a `c2pa.placed` action pointing at its ingredient.
- Render rasterises the SVG preview to a JPEG at quality 92 and signs it under the AI scope rule. The result is added as a new source with the caption "Template {name}" and is titled `{template}_{count}`.
- New from template opens the composer with the open layer preselected in the first slot.

### Credentials pane

The pane has three tabs: Summary, Provenance and Raw manifest.

The **Summary** tab shows, from top to bottom:

- **Signature block.** A green tick or red cross with "Signature valid" or "Signature NOT valid", the signer and issuer, and a trust note: green "On the C2PA trust list", amber for a signer trusted only by this project's own anchors, red "Untrusted signer" otherwise. Validation failures other than an untrusted signer are listed beneath.
- **AI content.** "N AI actions declared" counts every action in the chain with an AI kind, or "None declared". The header chip follows the AI scope rule across the whole history. **Produced with** shows the claim generator's name and version.
- **What happened to this image.** The actions of the current version and its parent, newest first. Each entry shows its action, its digital source type (or `manual`), and for `c2pa.opened` the parent and whether it carries credentials. Older versions are collapsed under "Earlier: N actions in M earlier versions".
- **Ingredients.** The parent (`parentOf`) and each placed component (`componentOf`), with a preview of the library image where one is held, and a Signed or No credentials chip.
- **Technical details.** The manifest, parent and instance identifiers.

An unsigned image shows "No credentials" with the note "Nothing machine-readable says how this image was made or changed."

The **Provenance** tab draws the ingredient chain as a tree. The root card is the open layer; below it sit its ingredients, labelled "Placed ingredient" for `componentOf` and "Edited from" for `parentOf`, each with a preview of its library image, a Signed or No credentials chip and its signer. An ingredient that carries its own manifest is expanded in turn, so a placed image that was itself edited shows the whole edit chain beneath it. The heading counts the ingredients in the chain. Clicking a card shows it under "Selected node" with its title, signer, format and a note on what its status means. An unsigned image has no chain to show.

The **Raw manifest** tab shows the reader's JSON as a collapsible tree, open two levels deep. The search box narrows the tree to keys and values containing the text and highlights the hits. Expand all, Collapse all and Copy JSON sit above the tree.

**Compare with previous version** opens a full-screen split view of the parent's manifest and the current layer's manifest, with changed lines paired row by row. It is disabled on the original, where the footer says "Make an edit to compare manifests side by side." Escape or Close returns to the page.

### Uploading your own image

The sources strip and the first-run drop zone accept JPEG, PNG, WebP and MP4. The file is read for an existing manifest and appears as a new source. Edits then work exactly as for the samples.

### Between reloads

Sources, layers and the current selection are kept in the browser's IndexedDB, so a reload brings back where you were and the history is not capped at a few edits. If a save fails, a red note appears below the status bar. Reset demo clears the stored state and reloads the samples.

### API

The browser talks to these routes. Each request and response body is JSON. Image and video fields are data URIs. `parent` needs an `image` (a data URI) and a `title`.

| Route                      | Request body                                                                                                     | Response                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `GET /api/samples`         | none                                                                                                             | array of sample file names               |
| `GET /api/samples/:name`   | none                                                                                                             | the sample file                          |
| `GET /api/templates`       | none                                                                                                             | array of template file names             |
| `GET /api/templates/:name` | none                                                                                                             | the template HTML                        |
| `POST /api/create`         | `{ prompt, title }`                                                                                              | `{ image, provenance }`                  |
| `POST /api/provenance`     | `{ image, title }`                                                                                               | provenance JSON, or `null` if unreadable |
| `POST /api/edits/manual`   | `{ edited, parent, title, description, kind, region?, placed? }`; `placed` is `{ image, title, slot }`           | `{ image, provenance }`                  |
| `POST /api/edits/ai`       | `{ input?, parent, title, instruction, kind, region? }`; `input` is the padded image for outpaint                | `{ image, provenance }`                  |
| `POST /api/edits/template` | `{ components, rendered, title }`; each component is `{ image, title, slot, edits: [{ description, kind }] }`    | `{ image, provenance }`                  |
| `POST /api/edits/video`    | `{ kind, parent, title, width }`; `kind` is `c2pa.transcoded` or `c2pa.resized`, and `width` is in px for resize | `{ image, provenance }`                  |

`kind` is one of the manual actions for `/api/edits/manual` and one of `c2pa.edited`, `c2pa.inpainting`, `c2pa.outpainting` or `c2pa.upscaled` for `/api/edits/ai`. `region` is `{ x, y, width, height }` in pixels and becomes the `changes` rectangle. Each edit route returns `{ image, provenance }`, and `provenance` is `null` when the output is unsigned under the AI scope rule. `/api/create` always signs, so its `provenance` is never `null`.

Errors return `{ "error": "message" }`. A `RangeError`, `SyntaxError` or `URIError` (for example a bad region, an unsupported action or a malformed file name) gives status 400, and anything else gives 500.

`/api/provenance` returns `Provenance.toJSON()`, with these keys:

| Key                | Contents                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| `actions`          | the active manifest's actions as views                                                  |
| `aiActions`        | the timeline views whose kind is not `not AI`                                           |
| `aiDeclaration`    | `'AI generated'`, `'AI edited'` or `null`, from the AI scope rule across every manifest |
| `claimGenerator`   | `{ name, version }` of the active manifest, or `null`                                   |
| `components`       | `componentOf` ingredients: `{ carriesManifest, title, slot }`                           |
| `failures`         | validation failures other than an untrusted signer                                      |
| `instanceId`       | the active manifest's instance identifier, or `null`                                    |
| `isValid`          | whether the validation state is `Valid` or `Trusted`                                    |
| `manifestId`       | the active manifest label                                                               |
| `parent`           | the `parentOf` ingredient as `{ carriesManifest, title }`, or `null`                    |
| `parentManifestId` | the parent's manifest label, or `null`                                                  |
| `signer`           | the certificate's common name and issuer                                                |
| `signerTrust`      | `c2pa`, `user` or `none`                                                                |
| `store`            | the reader's full JSON                                                                  |
| `timeline`         | every action in the chain, newest manifest first                                        |

Each action view has the keys `action`, `agent`, `description`, `digitalSourceType`, `kind` (`AI generated`, `AI manipulated` or `not AI`), `manifestId`, `region` (`{ x, y, width, height }` or `null`), `title` and `when`.

### Notes

- Prompts and template text are never written into a manifest. They go to the model, or into the rendered image, and are then dropped. AI actions carry no `parameters`, and manual actions carry only their fixed description.
- Manifests carry no thumbnails. Signing turns preview thumbnails off, and the reader neither loads nor ships them.
- Chrome never resolves `image.decode()` in a hidden tab, so the image loader in `web/dom.mjs` waits for `onload` instead.
- The gateway model may refuse some inputs, or return no image. The error text appears in the toolbar note, and nothing is added to the library.

## Deployment

The demo runs on Cloud Run behind Firebase Hosting in the shared `firebase-cloud-491613` project. Infrastructure lives in the `poly-glot/firebase-cloud` repository (`terraform/apps/c2pa-demo.tf`): the service account, the Workload Identity provider pinned to this repository, the `c2pa-demo` Hosting site, the Cloud Run service and three Secret Manager secrets (`c2pa-demo-app-password`, `c2pa-demo-llm-api-key`, `c2pa-demo-signer-key`) that reach the container as `APP_PASSWORD`, `LLM_API_KEY` and `C2PA_KEY_PEM`.

`firebase.json` rewrites every path on https://c2pa-demo.web.app to the Cloud Run service, so the sign-in page, the app and the API all come from one server. The `Dockerfile` builds a Node 22 image that also installs FFmpeg for the video tools; the test certificate chain ships in the image and the private key arrives from Secret Manager.

GitHub Actions:

| Workflow | Trigger        | What it does                                                                                                                                                                                |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI       | pull requests  | `npm ci`, a throwaway certificate, `npm run check`                                                                                                                                          |
| CD       | push to `main` | CI, then builds and pushes the image to Artifact Registry, deploys Cloud Run, deploys Hosting, smoke-tests `/api/health` (200) and `/` (401), retrying while the Hosting release propagates |

The repository secrets `WIF_PROVIDER` and `GCP_SA_EMAIL` come from the Terraform outputs `c2pa_demo_wif_provider` and `c2pa_demo_gcp_sa_email`.

## Verifying the manifest

### With this project

The script verifies its own output before exiting. To inspect any signed image in more detail, use the reader from the
library:

```sh
node -e "
import('@contentauth/c2pa-node').then(async ({ Reader }) => {
  const { readFileSync } = await import('node:fs');
  const reader = await Reader.fromAsset({ buffer: readFileSync(process.argv[1]), mimeType: 'image/jpeg' });
  console.log(JSON.stringify(reader.json(), null, 2));
});
" ./assets/NOVA-SPK-500ML_Hero_Studio_orange.jpg
```

Look for `validation_state: "Valid"`, the `c2pa.actions` assertion on the active manifest, and an ingredient with
`relationship: "parentOf"` that has its own `manifest_data`.

### With c2patool

`c2patool` is the reference command-line reader from the Content Authenticity Initiative. Install it from the releases
page at https://github.com/contentauth/c2pa-rs/releases, or with `cargo install c2patool`, then:

```sh
c2patool ./assets/NOVA-SPK-500ML_Hero_Studio_orange.jpg
c2patool ./assets/NOVA-SPK-500ML_Hero_Studio_orange.jpg --detailed
```

The first form prints the manifest store. The detailed form adds the validation results. With the bundled test
certificate, expect `signingCredential.untrusted` alongside otherwise valid checks.

### In a browser

Upload the file to https://contentcredentials.org/verify. The site shows the chain of edits and the signer. The test
certificate will be reported as not on the trust list for the same reason as above.

## Project layout

```
.env.example                  environment variables, copy to .env
.gitignore                    ignores node_modules, .env, private keys and assets/
.prettierignore               files Prettier leaves alone: images, lock file, local tool state
.prettierrc                   Prettier options
eslint.config.mjs             ESLint configuration
package.json                  scripts and dependencies
package-lock.json             locked dependency versions
main.mjs                      command-line entry point
server.mjs                    HTTP server for the browser demo: static files and a JSON API
config/index.mjs              reads .env and supplies defaults
lib/compose.mjs               signs a template render with its placed images as ingredients, unsigned unless one is AI-declared
lib/create.mjs                signs a generated image as the first manifest of a new asset
lib/derive.mjs                signs an edited image against its parent and reads the result back, or returns it unsigned under the AI scope rule
lib/image-asset.mjs           immutable image value: bytes, MIME type, title
lib/image-editors.mjs         GatewayImageEditor (calls the model) and IdentityImageEditor (self-check)
lib/video.mjs                 ffmpeg transcode and resize for MP4 files
lib/http/access.mjs           password gate: session cookie, password header, login and logout
lib/c2pa/context.mjs         reader context: trust anchors, allowed list, user anchors and the builder setting that turns thumbnails off
lib/c2pa/manifest.mjs         AiEdit, ManualEdit, DerivedManifest, CompositeManifest and GeneratedManifest builders
lib/c2pa/provenance.mjs       reads a signed image back and summarises its chain
lib/c2pa/signer.mjs          loads the certificate and key into a local signer
lib/c2pa/vocabulary.mjs      C2PA and IPTC constants: action kinds, digital source types, relationships
web/index.html                page shell: masthead, status bar, first run, editor, credentials pane, dialogs
web/login.html                sign-in page served while the password gate is closed
web/app.css                   styles for the whole page
web/actions.mjs               C2PA action labels for the browser, mirrored from lib/c2pa/vocabulary.mjs
web/app.mjs                   starts the store and mounts each feature
web/api.mjs                   client for the JSON API
web/dom.mjs                   DOM helpers: image loading, data URIs, download, chips, tabs
web/diff.mjs                  line diff used by the manifest comparison
web/persistence.mjs           IndexedDB load, save and clear of the state
web/store.mjs                 the only browser state holder: sources, layers, selection, view
web/edits/registry.mjs        TOOLS: every edit tool with its group, needs, mode and action
web/edits/canvas-ops.mjs      pure canvas operations used by the manual tools
web/features/canvas-markup.mjs version tabs, size label, notice and preview markup
web/features/canvas.mjs       preview, version tabs, Before/After, selection and brush
web/features/compare.mjs      full-screen manifest comparison dialog
web/features/compose-form.mjs form reads and slot choices for the composer
web/features/compose.mjs      template composer: load a template, preview, render and sign
web/features/compose-markup.mjs  markup for the composer
web/features/compose.css      styles for the composer
web/features/credentials.mjs  credentials pane: Summary, Provenance and Raw manifest tabs, Compare button
web/features/credentials-markup.mjs  markup for the summary, timeline, ingredients and technical details
web/features/json-tree.mjs    collapsible, searchable tree for the raw manifest
web/features/provenance-graph.mjs  builds the ingredient tree from the manifest store
web/features/provenance-markup.mjs  markup for the provenance tree and the selected node
web/features/first-run.mjs    first-run cards for the samples and the file input
web/features/generate.mjs     Generate image bar: prompt, request and the new source
web/features/header.mjs       status bar: file name, signature and AI chips, download button
web/features/layer-select.mjs   the "Choose an image" select and its refill, shared by the toolbar and the composer
web/features/manifest-diff.mjs  pretty-printed manifest and side-by-side pairing
web/features/sources.mjs      sources strip, upload and source status
web/features/stage.mjs       the preview surface: marquee selection, brush strokes and pointer capture
web/features/template-render.mjs  parses templates, fills slots and text, rasterises the render
web/features/timeline.mjs     action descriptions, AI status and credential status
web/features/edit-signing.mjs missing-input hints, version titles, manual and AI signing through the API
web/features/toolbar-markup.mjs tool groups, parameter controls and the AI prompt bar
web/features/toolbar.mjs      reads tool parameters from the controls and runs a tool
templates/two-up.html         two image slots, 1600 × 900
templates/three-up.html       three image slots, 1800 × 800
templates/hero-caption.html   one image slot and two text slots, 1600 × 1000
templates/social-square.html  one image slot, one logo slot and one text slot, 1080 × 1080
test/access.test.mjs          password gate: cookies, login, logout
test/compose.test.mjs         composed manifests, per-slot edits and text
test/diff.test.mjs            line diff
test/edit-signing.test.mjs    missing-input hints and version titles
test/edits.test.mjs           edit registry, canvas operations and AI request scoping
test/provenance.test.mjs    manifest builders and provenance reading
test/template.test.mjs      template parsing, slot form, filling and per-slot components
test/timeline.test.mjs      timeline descriptions, markers and credential statuses
test/header.test.mjs        status bar chips and file name
test/signing.test.mjs       signing without thumbnails, AI scope and unsigned outputs
test/video.test.mjs         video transcode and resize, with the BMFF hard binding
cert/claim-signer.cnf         OpenSSL configuration for the signing certificate
cert/claim-signer.pem         test signing certificate chain
cert/generate.sh              makes a fresh test CA and signing pair
cert/root-ca.cnf              OpenSSL configuration for the test root CA
cert/root-ca.pem              test root CA certificate
cert/trust/allowed.sha256.txt individually allowed certificates, from the C2PA trust list
cert/trust/anchors.pem        trust anchors, from the C2PA trust list
cert/trust/store.cfg          permitted extended key usages, from the C2PA trust list
cert/trust/test-intermediate-ca.pem  intermediate CA of the previous NOVA sample, kept until it is retired
scripts/reference-clip.mjs    makes and signs the reference MP4 clip
samples/                      demo inputs: NOVA bottle, mountain lake, library photograph, reference clip
tasks/plan.md                 workstream plan and contracts
tasks/lessons.md              lessons learned
assets/                       output, ignored by git
```

## Supported formats

JPEG, PNG and WebP for stills and MP4 for video, chosen by file extension. The output keeps the MIME type the model returns, so give the output file
an extension that matches the input. Video is hashed with a box-based hard binding (`c2pa.hash.bmff.v3`), written by the library.
