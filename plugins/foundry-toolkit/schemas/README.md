# Profile and manifest schemas

Two JSON Schemas (draft 2020-12) govern ClaudeFoundry's data:

- **`profile.schema.json`** — the format of a profile file (base, technology, capability, full-stack, or custom). Profiles are written as YAML or JSON; both are accepted.
- **`manifest.schema.json`** — the format of `.claude-foundry/manifest.json`, written into a project ClaudeFoundry has configured, so repeated setup never silently overwrites a user's edits.

For real, complete examples, read the library itself: `profiles/base/base.yaml`, `profiles/technologies/{dotnet,nextjs}/*.yaml`, `profiles/capabilities/{testing,code-review}/*.yaml`, and `profiles/fullstack/nextjs-dotnet.yaml` (the last one shows `requires` pulling in two technology profiles automatically). For a minimal from-scratch example and a user-defined profile that `extends` a built-in one, see `tests/fixtures/profiles/valid-base.yaml` and `tests/fixtures/profiles/custom-company-standards.yaml`. `tests/compose.test.js` and `tests/profile-library.test.js` cover composition scenarios end to end. See `../../../CONTRIBUTING.md` for the step-by-step process of adding a new profile.

## Profile fields

| Field | Required | Meaning |
|---|---|---|
| `schemaVersion` | yes | Fixed at `"1"`. Versions this schema, not the profile. |
| `kind` | yes | One of `base`, `technology`, `capability`, `fullstack`, `custom`. |
| `name` | yes | Kebab-case, unique in the registry. |
| `version` | yes | Semantic version of the profile itself. |
| `description` | yes | One sentence, shown to the user when recommending/selecting profiles. |
| `extends` | no | Parent profile ref(s). Inherits the parent's `provides`; fields this profile also sets override the parent's, field by field. |
| `requires` | no | Other profiles that must also be applied. The composer includes them automatically and records why (`includedBecause: "required-by-dependency"`). |
| `conflictsWith` | no | Profiles that cannot be combined with this one. Composition fails outright (`ok: false`) rather than picking a winner — the user must drop one. |
| `detect` | no | Advisory indicators only (`file-exists`, `file-contains`, `package-dependency`, each with a `confidence`). Never treated as conclusive proof by itself. |
| `provides` | no | What the profile contributes — see below. |
| `overridableComponents` | no | Component ids the user may freely override without that being flagged as a conflicting edit. |

### `provides`

| Field | Shape | Composition behavior |
|---|---|---|
| `instructions` | `[{ id, path, content }]` | Grouped by target `path` across all applied profiles. Identical content at the same path is deduped silently. Different content at the same path is a **conflict** — withheld from the resolved output until a user decides. |
| `steeringDocs` | same shape as `instructions` | Same merge behavior, kept separate so steering docs and root instructions never collide with each other by path alone. |
| `rules` | `[{ id, text }]` | Grouped by `id`. Same `id` + same `text` across profiles dedupes; same `id` + different `text` is a **conflict**. |
| `skills` / `agents` | `string[]` | Unioned, deduped. |
| `commands` | `{ [key]: string }` | Kept **namespaced per profile** in the resolved output (`resolved.commands.<profileName>`), so e.g. two technologies both defining `build` never collide. |

## Composition algorithm (implemented in `scripts/lib/compose.js`)

1. Resolve the transitive `requires` closure of the selected profiles.
2. Check `conflictsWith` across the resulting set — any violation fails composition entirely (`ok: false`, no resolved output), reported as `hardConflicts`.
3. For each included profile, resolve its effective `provides` by walking its `extends` chain (cycles are rejected with a clear error).
4. Merge every included profile's effective `provides` into one resolved configuration, surfacing path/id-level collisions as `conflicts` rather than auto-resolving them.

A composition with `conflicts.length > 0` is not final — a skill using this engine must show the conflicts to the user and get an explicit decision before writing anything.

## Manifest fields

`.claude-foundry/manifest.json` records only what's needed to manage generated files safely: which profiles (and why) were applied, and for each generated file its path, a SHA-256 of the content ClaudeFoundry last wrote, and which profile/component produced it. No credentials, tokens, or other project data are stored. `scripts/lib/manifest.js` builds this file and diffs it against the real filesystem to classify each tracked file as `unchanged`, `user-edited`, or `missing` before any future write.

## Validating a profile by hand

```bash
node scripts/cli.js validate-profile path/to/profile.yaml
node scripts/cli.js compose path/to/profile-a.yaml path/to/profile-b.yaml
```
