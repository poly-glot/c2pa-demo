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
