# Lessons

## 2026-10-20: "based on the Rust implementation" means the official c2pa crate

- Correction: the CLI was hand-rolling JUMBF, COSE and the JPEG hard binding. The user meant "build on c2pa-rs, the
  official Rust implementation", and "no c2pa libraries in the codebase" meant the JavaScript side must not depend on
  `@contentauth/c2pa-node`; it shells out to the CLI instead.
- Rule: when an instruction names an ecosystem's reference implementation ("Rust implementation", "Go implementation"),
  read it as "use that library", not "rewrite it". If the two readings differ by days of work, ask one question first.
- Rule: a "move X to the CLI" request is about dependency direction. Check afterwards that the app code only calls the
  CLI, and measure the remaining lines; "the CLI exists" is not done.

## 2026-10-20: "call the CLI with arguments" means no job files and no client library

- Correction: the Node side still had a `ProvenanceCli` class, asset staging, a JSON job schema and three
  create/derive/compose modules in front of the binary. The user wanted `execFile(binary, [...args])` and nothing else.
- Rule: when a CLI is the integration boundary, push every decision (validation, the AI scope rule, defaults) into the
  CLI and make its arguments carry the request. If the caller needs a schema or a client class to use the CLI, the CLI's
  interface is wrong, not the caller.
- Rule: tests that exercise the CLI through JavaScript duplicate the Rust integration tests; keep behaviour tests next to
  the binary and leave JavaScript tests for JavaScript behaviour only.

## 2026-11-14: infrastructure changes follow the firebase-cloud pattern, end to end

- Correction: after swapping the gateway for ZeroGPU I left the Terraform edit uncommitted and offered a hand-run list of
  `terraform apply -target` and `gcloud secrets versions add` steps. The user wanted the repo's own pattern: a PR, the
  value in GitHub secrets, and a Secret Manager copy, because a GitHub secret cannot be read back.
- Rule: a new app secret goes GitHub secret → `TF_VAR_*` in `terraform.yml` → sensitive variable → a
  `google_secret_manager_secret_version` in the app's `.tf`. Read an existing app (openguessr, the shared
  `gemini_api_key`) before proposing anything.
- Rule: never destroy a Secret Manager secret as a side effect; `moved` it out of a `for_each` and keep it.
- Rule: deliver infrastructure as a PR from a worktree on `origin/main`; the local checkout may hold the user's work in
  progress.

## 2026-11-14: "working" means verified in the running app, with the model's real output

- Correction: a 402/quota failure and a "Failed to parse URL" in production reached the user before I had run the app
  myself. The AI inpaint built a prompt with pixel coordinates the model cannot follow.
- Rule: run the app locally and drive every AI path in the browser (create, edit, region edit) before calling it done.
  Surface the provider's own error text; a bare "null" hides the cause.
- Rule: a region edit is crop-with-context, edit, paste the selection back with a feathered edge. Never ask a diffusion
  model to respect coordinates in the prompt.
- Rule: free ZeroGPU reserves about 90 s per call against 5 minutes a day; budget test runs accordingly.

## 2026-11-15: stage files by name; tools leave build output behind

- Correction: `gpu/__pycache__/flux.cpython-314.pyc` reached main in the Modal commit. `modal deploy` imports the app
  module locally, so Python wrote bytecode next to it, and `git add -A` staged it; `commit -a` then kept updating it.
- Rule: stage the files the change touches by name and read `git status -s` before every commit. Never `git add -A`
  after running a tool that may write caches or artefacts.
- Rule: when a change adds a new language or tool to a repo, add its build and cache output to `.gitignore` in the same
  commit (`__pycache__/` for Python, `target/` for Rust).
