---
name: configure-profiles
description: Use this skill when the user wants to change which ClaudeFoundry profiles apply to an already-configured project — "add the testing capability here", "drop the dotnet profile", "exclude this rule", "override this standard", "create a custom profile for our company conventions" — without repeating full repository inspection. For first-time setup of a project (new or existing, no `.claude-foundry/manifest.json` yet), use setup-project instead; that skill calls the same underlying engine as this one.
---

# ClaudeFoundry: Configure profiles

This skill changes a project's applied profile set and re-runs the safe write engine — it does not reimplement repository inspection (that's `setup-project`'s job) or the write/conflict logic (that lives in the engine both skills call).

All commands below run from the project root and use `${CLAUDE_PLUGIN_ROOT}` so they work wherever this plugin was actually installed from — never hardcode a path to this plugin.

## 1. Read current state

```bash
cat .claude-foundry/manifest.json 2>/dev/null
```

If it doesn't exist, there's nothing to reconfigure yet — point the user to `setup-project` instead.

If it exists, its `profiles` array is the currently-applied set (with each one's version and why it's included). Use this, not guesswork, as the starting point for "what's currently on."

## 2. Work out the new selection

Based on what the user asked for:
- **Add a profile**: append it to the selection.
- **Remove a profile**: drop it from the selection. Anything it uniquely provided will show up as `orphaned` in the plan (see step 3) — never deleted automatically.
- **Exclude a specific component** (a rule or instruction, not a whole profile): check that component's id is listed in its profile's `overridableComponents`. If it is, the simplest safe path is editing the generated file directly after applying (ClaudeFoundry will detect that edit and protect it from then on). If it isn't marked overridable, say so plainly and ask the user how they want to proceed rather than silently excluding it anyway.
- **Override a standard**: same as above — edit the generated file after apply, or define a custom profile (below) that provides a higher-priority version via `extends`.
- **Custom profile**: write a new profile YAML matching `${CLAUDE_PLUGIN_ROOT}/schemas/profile.schema.json` (see `${CLAUDE_PLUGIN_ROOT}/schemas/README.md` for the field reference), save it wherever the project keeps project-specific config (e.g. `.claude-foundry/profiles/`), and validate it before using it:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" validate-profile .claude-foundry/profiles/my-company-standards.yaml
  ```

  A failing validation must produce the actionable errors the command prints — don't hand-wave around them or apply an unvalidated profile.

  A custom profile directory composes alongside the built-in library by passing both directories' profiles into the same `plan`/`apply` call (see step 3) — if the CLI's single-`dir` argument doesn't cover a project's custom-profile location, merge them into one directory (e.g. a project-local copy or symlink) before planning, and say so to the user rather than silently dropping the custom profile.

## 3. Preview before applying

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" plan . "${CLAUDE_PLUGIN_ROOT}/profiles" <profile-name...>
```

Read the JSON result:
- `compositionConflicts`: two profiles want different content at the same path/rule id. Never pick a winner yourself — show both contributors to the user and ask which should win (or whether both need editing to stop overlapping).
- `writable` entries with `status: "create"` or `"update"`: safe, will be written.
- `blocked` entries: `conflict-pre-existing-file` (a file ClaudeFoundry didn't create is in the way), `user-edited` (someone hand-edited a generated file), or `previously-generated-now-missing` (a generated file was deleted). Show these to the user individually and ask before using `--force` on any of them — never force a path the user hasn't specifically approved.
- `orphaned` entries: files no longer provided by the new selection. These are never deleted by this engine, forced or not — tell the user they're welcome to remove them by hand if no longer wanted.

## 4. Apply only what's approved

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" apply . "${CLAUDE_PLUGIN_ROOT}/profiles" <profile-name...> --force path/one.md,path/two.md
```

Omit `--force` entirely unless the user explicitly approved overwriting those specific paths in step 3. After applying, report exactly what was written, what was skipped and why, and what's now orphaned — the same honesty standard as everywhere else in this toolkit: don't claim something was updated if it was actually skipped.
