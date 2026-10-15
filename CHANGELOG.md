# Changelog

All notable changes to ClaudeFoundry are documented here.

## [0.1.0] — Published

- **Published to GitHub**: [rj8b0000/claude-foundary](https://github.com/rj8b0000/claude-foundary). The repo was created with a typo (`claude-foundary`, not `claude-foundry`) — decided to keep that name rather than rename, and updated every manifest/doc reference (`plugin.json`'s `homepage`/`repository`, `marketplace.json`'s own `name`, README's install/update/uninstall commands and troubleshooting text, `CONTRIBUTING.md`'s clone instructions) to match what's actually there. The plugin's own installable name (`foundry-toolkit`) and the "ClaudeFoundry" display name were never tied to the repo's spelling and are unaffected.
- **Real remote-marketplace verification, not just local simulation**: `claude plugin marketplace add rj8b0000/claude-foundary` → `claude plugin install foundry-toolkit@claude-foundary` against the actual live repository. All 5 skills loaded (matching the local token-cost numbers exactly). Inspected Claude Code's real plugin cache directly (`~/.claude/plugins/cache/claude-foundary/foundry-toolkit/0.1.0/`) and confirmed it contains only the `plugins/foundry-toolkit/` subtree — no `tests/`, no root docs — then ran `cli.js detect` directly from that real cache against a fresh temp project and got a correct result, proving the vendored `node_modules` survived the actual git clone. This is the final, real-world confirmation of the Phase 6 architectural fix, closing the one limitation Phase 8's local-only clean-environment test couldn't close. Cleaned up the test install afterward.
- GitHub owner filled in (`rj8b0000`) across `plugin.json`, `marketplace.json`, `LICENSE`, and README, after confirming via a live GitHub API check (not an assumption) that the actual repo name differs from what was initially assumed.

## [Unreleased]

### Added (Phase 2 — plugin foundation)

- Repository scaffolding: `.claude-plugin/marketplace.json` listing the `foundry-toolkit` plugin via a relative `./plugins/foundry-toolkit` source. (Plugin named `foundry-toolkit`, not `claude-foundry`, because Claude Code reserves the `claude-` prefix for official Anthropic plugins — confirmed by `claude plugin validate`.)
- `plugins/foundry-toolkit/.claude-plugin/plugin.json` — plugin manifest (v0.1.0).
- `plugins/foundry-toolkit/skills/setup-project/SKILL.md` — primary interactive setup skill covering repository inspection, profile recommendation (manual until the profile engine lands), preview/approval gates, manifest-based re-run safety, and new-project setup.
- `LICENSE` (MIT, copyright holder placeholder), `README.md`, `.gitignore`.

### Added (Phase 3 — profile schema, composition, manifest)

- `schemas/profile.schema.json` — JSON Schema (draft 2020-12) for base/technology/capability/fullstack/custom profiles, including `extends`, `requires`, `conflictsWith`, advisory `detect` indicators, and `provides` (instructions, steering docs, rules, skills, agents, namespaced commands).
- `schemas/manifest.schema.json` — schema for the per-project `.claude-foundry/manifest.json`.
- `scripts/lib/validate-profile.js` — Ajv-based schema validation with actionable error messages, plus cross-field checks (self-reference in `extends`/`requires`/`conflictsWith`, contradictory `requires`+`conflictsWith`).
- `scripts/lib/compose.js` — composition engine: resolves the `requires` closure, detects `conflictsWith` hard conflicts, resolves `extends` inheritance (with cycle detection), and merges `provides` across profiles — deduping identical content/rules at the same path/id, and surfacing genuine differences as conflicts instead of silently picking a winner. Commands are kept namespaced per profile so same-named commands from different technologies never collide.
- `scripts/lib/manifest.js` — builds the project manifest (profile provenance + per-file SHA-256) and diffs it against the real filesystem (`unchanged` / `user-edited` / `missing`), the basis for never overwriting a user's edits.
- `scripts/cli.js` — `validate-profile` and `compose` commands for manual use.
- `schemas/README.md` — field-by-field documentation of both schemas and the composition algorithm.
- `tests/` — 18 automated tests (`node --test`) covering schema validation, cross-field checks, composition (independent merge, requires, conflictsWith, extends override, path/rule dedupe vs. conflict, command namespacing, extends-cycle and missing-requires errors), and manifest diffing (unchanged/user-edited/missing). All 18 pass (`npm test`).
- Root `package.json` (dev-only, not published) adding `ajv`, `ajv-formats`, `js-yaml`.

### Added (Phase 4 — base, .NET, Next.js, and a full-stack profile)

- `profiles/base/base.yaml` — the `base` profile: one `CLAUDE.md` instruction block covering all 8 required areas (coding conventions, code review, testing expectations, security/privacy, debugging methodology, documentation quality, safe file modification, validation/approval), fully overridable.
- `profiles/technologies/dotnet/dotnet.yaml` — `.NET`/C# profile: advisory detection indicators (`*.sln`, `*.csproj`, ASP.NET Core SDK hint), an architecture-discovery steering doc (discover-and-preserve, not impose), 7 representative coding rules, and `build`/`test`/`format` commands.
- `profiles/technologies/nextjs/nextjs.yaml` — Next.js/React profile: detection indicators (`next` dependency, `next.config.*`, `app/`), an architecture-discovery steering doc (App Router vs. Pages Router, existing data/state patterns), 6 representative coding rules, and `build`/`dev`/`lint` commands.
- `profiles/fullstack/nextjs-dotnet.yaml` — representative full-stack profile: `requires: [nextjs, dotnet]` (auto-included, not duplicated), adds only the frontend/backend integration guidance neither technology profile owns alone (API contracts, CORS, shared types, auth boundary).
- `scripts/lib/load-registry.js` — scans a profile directory, validates every file, and builds a name-keyed registry, reporting invalid/duplicate profiles without throwing.
- `scripts/cli.js` gained `validate-library` and `compose-library` commands; `npm run validate:profiles` validates the whole library.
- `tests/profile-library.test.js` — 5 new tests against the real library: every profile individually schema-valid; base+nextjs+dotnet compose with zero conflicts and correctly namespaced commands; selecting the full-stack profile alone auto-includes both technologies; base is confirmed optional (not a hidden hard dependency); the representative base+fullstack composition has no path/rule duplication. All 23 tests across the whole suite pass (`npm test`).

### Known limitations introduced this phase

- `detect` indicators are declared in each profile but there is still no executor that scans a real project and evaluates them — that's Phase 6 (repository detection) work; today they're schema-valid data only.
- Rule sets for .NET and Next.js are representative, not exhaustive — a deliberate scope choice, documented here rather than claimed as complete coverage.
- No "architecture template" files (actual boilerplate/scaffold code) are generated — only steering-doc guidance. Templates would need a new `provides` field; deferred as a possible future enhancement, not silently dropped.
- Profiles currently have no configurable parameters (e.g., "which test framework") beyond selection/override — the schema has no `options` field yet; not required for this phase's acceptance criteria but noted for later.

### Added (Phase 5 — testing and code-review capabilities, and the Kiro-style workflow)

- `profiles/capabilities/testing/testing.yaml` — cross-stack testing standards (steering doc + 3 rules); deliberately defines no `commands` of its own so it never competes with a technology profile's `test` command.
- `profiles/capabilities/code-review/code-review.yaml` — cross-stack review checklist (steering doc + 2 rules), same no-commands rule.
- `plugins/foundry-toolkit/skills/testing/SKILL.md` — reads the testing steering doc and the in-effect technology profile's conventions before writing/running tests; never reports a test result that wasn't actually produced by running the suite.
- `plugins/foundry-toolkit/skills/code-review/SKILL.md` — explicitly defers to a more specific code-review skill/command/plugin already available in the session for the actual diff-scanning mechanics (this session already has one), and only supplies this project's ClaudeFoundry standards as context, or runs the checklist itself when nothing more specific exists. This avoids building a second, competing review engine.
- `plugins/foundry-toolkit/skills/kiro-workflow/SKILL.md` — the existing `kiro-skill` (requirements → design → tasks → execution, EARS notation, per-phase approval gates) adapted for ClaudeFoundry: specs now live at `.claude-foundry/specs/{feature}/` instead of `.kiro/specs/`, to avoid colliding with the separate Kiro IDE's own `.kiro/` directory found on this machine; the design phase now also checks `.claude-foundry/steering/*.md` when present.
- `tests/profile-library.test.js` gained a test covering both capabilities composed together with the full-stack set: independently selectable (testing composes alone with zero conflicts), five distinct steering docs with nothing duplicated, and confirmation that neither capability ever introduces its own `commands` namespace. Full suite: **24/24 passing**.
- Re-ran `claude plugin validate`, a full local install (`marketplace add` → `install` → `details` → `marketplace remove`) confirming all 4 skills (`setup-project`, `testing`, `code-review`, `kiro-workflow`) load, ~865 tokens always-on total, then cleaned up the test install.

### Deliberate scope decisions

- No dedicated testing or code-review **agent** was added — the skills above are sufficient; an agent needs a distinct benefit to justify its own context cost, and none was found for this phase.
- `configure-profiles` skill is deferred to Phase 6, where it belongs with the safe-write/customization engine it depends on.

### Fixed (Phase 6 — a real architectural bug, found before it shipped)

- **Moved `schemas/`, `scripts/`, and `profiles/` from the repo root into `plugins/foundry-toolkit/`.** A plugin installed from a real git-hosted marketplace only ships the subtree named by its marketplace `source` — sibling top-level folders outside the plugin directory are never fetched. Skills reach their own code via `${CLAUDE_PLUGIN_ROOT}`, which only resolves inside the plugin. Everything built in Phases 3–5 would have silently failed to load for anyone who installed this plugin for real, while still appearing to work in local dev (where Claude Code reads straight off the checkout). Caught and fixed now, before Phase 6 needed to wire skills to this code at runtime, rather than discovered at release.
- **Vendored the npm dependencies (`ajv`, `ajv-formats`, `js-yaml`) inside the plugin** (`plugins/foundry-toolkit/node_modules/`, committed — ~3.7MB) with their own `plugins/foundry-toolkit/package.json` (runtime `dependencies`, not dev). `claude plugin install` has no `npm install` step, so an end user's copy of the plugin would otherwise have no way to resolve these at runtime. The root `package.json` no longer declares any dependencies of its own — Node resolves `ajv`/`js-yaml` from the nearest ancestor `node_modules`, which is now the plugin's, for both the shipped plugin and the dev test suite. `.gitignore` changed from a blanket `node_modules/` to an anchored `/node_modules/` so only the root (if one ever reappears) is ignored, not the vendored one.
- Documented trade-off: vendoring is the pragmatic fix for "no install step at consumption time," not the only possible one (a dependency-free hand-rolled validator, or a build step producing a bundled dependency-free CLI, are both real alternatives) — noted here rather than presented as the only option.

### Added (Phase 6 — detection, safe write engine, configure-profiles)

- `scripts/lib/detect.js` — evaluates each profile's `detect` indicators (`file-exists`/`file-contains`/`package-dependency`) against a real project directory (skipping `node_modules`, `.git`, `bin`, `obj`, `dist`, `build`, `.next`), producing matched/unmatched evidence and a `confidenceTier` per profile. Advisory only, as required — never auto-selects anything.
- `scripts/lib/plan.js` — `computePlan()` classifies every target file as `create`, `update`, `unchanged`, `conflict-pre-existing-file`, `user-edited`, `previously-generated-now-missing`, or `orphaned`, by diffing the composition's resolved output against both the existing manifest and the real filesystem. `applyPlan()` writes only `create`/`update` by default, never touches `blocked` or `orphaned` entries unless a specific path is explicitly force-listed (and **never** deletes an orphan, force or not — deletion isn't implemented), and rewrites `.claude-foundry/manifest.json` afterward, carrying orphaned-but-untouched files forward so they keep being tracked.
- `resolved.rules` (composed, deduped, conflict-checked rule standards) is now actually materialized into a generated file, `.claude-foundry/steering/rules.md` (synthesized by the engine itself, not authored in any one profile) — closing a real gap where rules existed as schema data but were never written anywhere a project would actually see them.
- `cli.js` gained `detect`, `plan`, and `apply` commands (JSON output, meant to be parsed by a skill, not just read by a human).
- `plugins/foundry-toolkit/skills/configure-profiles/SKILL.md` — new skill for changing an already-configured project's profile selection (add/remove a profile, exclude an overridable component, define and validate a custom profile) without repeating full repository inspection; shares the same `plan`/`apply` engine as `setup-project`.
- `setup-project/SKILL.md` rewritten to call the real engine: `detect` in Step 1, `plan` in Step 4, `apply` in Step 5, all via `${CLAUDE_PLUGIN_ROOT}` — replacing the earlier "not wired up yet" placeholder.
- `tests/detect.test.js` (4 tests) and `tests/plan.test.js` (7 tests), plus a full manual end-to-end run against a real temp "fake Next.js project" directory through the actual CLI (not just unit tests): `detect` → `plan` → `apply` → re-`plan` (idempotent, all `unchanged`) → hand-edit `CLAUDE.md` → re-`plan`/`apply` (edit correctly protected, untouched) → drop a profile (its file correctly orphaned, not deleted, still tracked). Full suite: **35/35 passing**.
- Full plugin install/uninstall cycle re-verified with all 5 skills present (`setup-project`, `testing`, `code-review`, `kiro-workflow`, `configure-profiles`), ~1,034 tokens always-on total; test install cleaned up afterward.

### Known limitations introduced this phase

- `detect`'s file matching is a depth-limited heuristic directory walk with simple glob support, not a full project indexer — documented, not hidden.
- `file-contains` patterns are literal substrings, not regular expressions, for safety and simplicity.
- Remote/GitHub-hosted marketplace installation of the corrected layout hasn't been verified against an actual published repository yet (none exists to publish to) — only the local relative-path install path has been exercised. The fix is based on documented Claude Code plugin-fetch behavior, not yet an end-to-end proof against a real remote install; worth re-confirming once a GitHub repo exists (Phase 8).
- No deletion capability exists for orphaned files, even with explicit force — a deliberate scope boundary, not an oversight; a future `prune` command would need its own explicit design and approval gate.

### Added (Phase 7 — closing test-scenario gaps, documentation, install/update validation)

- `tests/scenarios.test.js` — the section-11 scenarios not yet covered by earlier unit tests, against real profiles: fresh .NET, existing .NET with a pre-existing architecture doc (flagged, never overwritten), fresh Next.js, existing Next.js with a hand-written `CLAUDE.md` (flagged, overwritable only with explicit `--force`), full-stack Next.js+.NET (zero conflicts), and repeated setup producing no duplicate writes.
- `tests/custom-profile.test.js` — a genuine user-defined profile (`tests/fixtures/profiles/custom-company-standards.yaml`, `kind: custom`, `extends: [base]`) validated against the same schema as built-in profiles, an invalid custom profile (bad `kind`) rejected with an actionable error, the override replacing only the targeted instruction while still inheriting the rest of `base`, and the custom profile composing alongside a technology profile end to end through `apply`.
- `tests/skills.test.js` — every skill's frontmatter has a `name` matching its directory and a non-empty `description`; every skill that invokes `cli.js` does so via `${CLAUDE_PLUGIN_ROOT}`, never a hardcoded path (manifest/skill validity, automated).
- `tests/plugin-cli.test.js` — shells out to the real `claude` CLI: `claude plugin validate` passes for both the plugin and the marketplace (an automated proxy for "plugin loads from a clean environment"); plus CLI-level error-handling checks (invalid profile, unknown command).
- **Fixed a real error-handling gap found while writing that last test**: a missing profile reference (or any other thrown engine error) crashed `cli.js` with a raw Node stack trace instead of a clean message. Wrapped the CLI's command dispatch in a `try/catch` so every failure now reports the same actionable, single-line way the rest of the CLI already does.
- `CONTRIBUTING.md` — development setup, how to add a profile or skill, engine conventions, testing expectations.
- README gained a real "Example setup session" (actual, unedited CLI output from a genuine run — not a mockup), an expanded "Customization" section reflecting what `configure-profiles` and custom profiles actually support now, and a "Troubleshooting" section for the failure modes the engine actually produces (reserved plugin name, validation errors, composition conflicts, blocked/orphaned files).
- `schemas/README.md` updated to point at the real profile library as worked examples, plus the custom-profile fixture, instead of only a minimal fixture.
- **Installation/update instructions validated for real**, not just described: fresh `marketplace add` → `install` → `claude plugin update` (reports "already at the latest version", confirming it inspects correctly) → `claude plugin uninstall` (exact command from the README, not the `marketplace remove` shortcut used for cleanup in earlier phases) → confirmed gone via `claude plugin list`, then marketplace removed to leave no trace.
- Security/hygiene audit: grepped the full repo (including vendored `node_modules`) for secret-like patterns (API key prefixes, private-key headers, hardcoded passwords) and the local machine username — zero matches. Checked for accidentally committed `.env`/credential/secret files — none found.
- Full suite now **51/51 passing** (35 carried over + 16 new).

### Known limitations

- `tests/plugin-cli.test.js` depends on the `claude` CLI being on PATH; it's the one test in the suite that isn't purely self-contained Node. Documented in `CONTRIBUTING.md`.
- The remote/GitHub-hosted marketplace install path still hasn't been exercised against a real published repository (none exists yet) — only local relative-path install, update, and uninstall have been verified for real.

### Added (Phase 8 — GitHub release readiness)

- `RELEASE_CHECKLIST.md` — the concrete gap between "the code works" and "this is published," including a naming/trademark finding below.
- **Clean-environment install, run for real**: copied *only* `plugins/foundry-toolkit/` (no sibling repo files) into an isolated temp directory, wrapped it in a throwaway marketplace, and ran `claude plugin validate` → `marketplace add` → `install` → `details` (all 5 skills loaded) → a full `detect`/`apply` cycle against a fake project, all from that isolated copy alone. This is the strongest possible local proof that the Phase 6 architectural fix (engine inside the plugin, not beside it) actually holds — a real git-hosted marketplace fetch delivers exactly this subtree and nothing else. Cleaned up afterward.
- License audit of vendored runtime dependencies: `ajv`, `ajv-formats`, `js-yaml`, `fast-deep-equal`, `json-schema-traverse`, `fast-uri` are MIT; `argparse` (transitive, via `js-yaml`) is Python-2.0 — all permissive and compatible with this project's MIT license. Confirmed every vendored package still carries its own `LICENSE` file.
- Placeholder audit: grepped the whole repo for every placeholder value (`<github-owner-placeholder>`, `<copyright-holder-placeholder>`, etc.) and confirmed they're consistent across `plugin.json`, `marketplace.json`, `LICENSE`, and `README.md` — no stale or guessed values anywhere.
- Re-ran the full secrets/credentials/machine-path grep from Phase 7 — still zero matches.

### Naming/trademark finding — decided

- **Naming/trademark risk, confirmed rather than theoretical.** A different, unrelated project already exists on GitHub under the exact name `claude-foundry` (a skills collection by another author). Separately, Anthropic's own trademark guidelines (fetched directly from anthropic.com/legal/trademark-guidelines) are restrictive about third-party use of its marks and give no explicit exception for a project name like "ClaudeFoundry" that contains "Claude." Neither of these was assumed or guessed — the repo-name collision was found via a live search, and the trademark text was fetched directly from Anthropic's own page. This was flagged as an open risk in the original brief ("do not assume... trademark clearance"). **Decision (project owner, after being shown both findings): keep "ClaudeFoundry" and accept the risk.** No renaming done.
- GitHub owner filled in: **rj8b0000**. Placeholders resolved: `plugin.json` (`author.name`, `homepage`, `repository`), `marketplace.json` (`owner.name`), `LICENSE` (copyright holder — GitHub handle used; swappable for a legal name anytime), and README's install commands. Re-validated both manifests and the full test suite (51/51) after the edits.

### Not yet implemented

- Windows CMD installer wrapper.
- Personal/company-wide preference persistence (`setup-project` still asks fresh every time, as documented in its own text).
