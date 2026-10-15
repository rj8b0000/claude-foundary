---
name: setup-project
description: Use this skill when the user wants to configure, bootstrap, or set up a project with ClaudeFoundry — phrases like "set up this project", "configure ClaudeFoundry here", "apply the .NET profile", "recommend profiles for this repo", or when a project has no ClaudeFoundry configuration yet and the user wants project-specific instructions, steering documents, skills, or agents generated. Also use it to re-run setup on a project that already has a `.claude-foundry/manifest.json` (profile updates, adding a capability, re-detecting after a stack change). Do NOT use it for unrelated coding tasks, and do not use the Kiro-style spec workflow in place of it — this skill handles project configuration, not feature planning.
---

# ClaudeFoundry: Project setup

ClaudeFoundry is an independent community toolkit, not an official Anthropic product. This skill turns a repository (new or existing) into an approved, inspectable set of project instructions, steering documents, skills, and agents, built from composable profiles — without ever silently overwriting what's already there.

Every meaningful step ends with a **preview and an explicit approval gate**. Never write, modify, or delete a file in the user's project before showing what will change and getting a yes.

## Before anything else: load state

1. Check for `.claude-foundry/manifest.json` in the project root.
   - **Exists** → this project was set up before. Read it: it lists previously generated files, the profile(s)/version(s) that produced them, and a content hash per file. Go to [Re-running setup](#re-running-setup-existing-manifest).
   - **Missing** → treat as first-time setup for this project. Go to [Step 1: Inspect the repository](#step-1-inspect-the-repository).
2. Check whether the user has personal/company-wide ClaudeFoundry preferences recorded (see [Personal preferences](#personal-preferences)). If valid preferences already exist, don't re-ask the questions that produced them.

## Step 1: Inspect the repository

Run the detection engine first — it only evaluates advisory indicators, it never decides anything on its own:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" detect . "${CLAUDE_PLUGIN_ROOT}/profiles"
```

Always use `${CLAUDE_PLUGIN_ROOT}`, never a hardcoded path — the plugin can be installed anywhere. This prints each technology profile's matched/unmatched indicators and a `confidenceTier` (`high`/`medium`/`low`/`none`). Treat this as evidence, not proof — a `confidenceTier: "high"` on `nextjs` is strong evidence, not certainty.

Then inspect directly, same as the detector couldn't do on its own:

- Is there a git repository here (`.git`)? Is it empty, or does it have real history/commits?
- Existing structure: folder layout, obvious architectural pattern (e.g. Clean Architecture folders, feature-folder Next.js app router vs. pages router) — the detector can't tell you *which* architecture, only that evidence of a technology exists.
- Existing build/test commands: `scripts` in `package.json`, `dotnet test`/`dotnet build` targets, CI config (`.github/workflows/*`, `azure-pipelines.yml`, etc.).
- Existing Claude Code configuration: `CLAUDE.md`, `.claude/` directory, other skills/agents already present. Never assume these are ClaudeFoundry's to replace — they may be hand-written. (If `CLAUDE.md` already exists and isn't tracked in `.claude-foundry/manifest.json`, the base profile's instructions will show up as a `conflict-pre-existing-file` in the plan later — expect that and explain it, don't be surprised by it.)
- Existing documentation that describes architecture, product domain, or operations.

When the detector's evidence is ambiguous or contradictory (e.g. both `dotnet` and `nextjs` show matches with no clear relationship — could be two separate projects, or a genuine full-stack layout), say so explicitly and ask rather than guessing which the user means.

If the repository is empty or has essentially no implementation to inspect, this is a **new project** — go to [New project setup](#new-project-setup-section-53) instead of guessing a stack.

## Step 2: Summarize and recommend

Present to the user, before asking anything else:

1. What was discovered (the detector's output plus your own direct inspection), distinguishing **confirmed from code** vs **uncertain/inferred**.
2. Recommended profiles: the base profile (always, but excludable if the user wants), the technology profile(s) the detector found at `medium` or `high` confidence, and the `testing`/`code-review` capabilities as relevant defaults. For a full-stack project (e.g. both `dotnet` and `nextjs` detected with a real relationship), recommend `nextjs-dotnet` instead of the two technologies separately — it pulls both in via `requires` automatically.
3. Any meaningful conflicts or overlaps — these come from the `plan` step (below), not from recommendation alone; mention here only if something about the detected combination is already known to be unusual.
4. Only questions that inspection genuinely could not answer (e.g. "this looks like it could be a modular monolith or the start of microservices — which is it?").

## Step 3: Customization mode

Offer, don't force, a menu:

- Accept all recommended defaults.
- Customize individual standards (edit specific base-profile rules before they're applied).
- Select only a subset of recommended profiles/capabilities.
- Add a profile not auto-detected, or exclude one that was.
- Add company-specific or personal rules on top.

Keep this conversational — don't present a giant form if the user just wants to accept defaults.

## Step 4: Preview before writing

Compute the real write plan — never hand-describe what you think will happen, run it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" plan . "${CLAUDE_PLUGIN_ROOT}/profiles" <approved-profile-name...>
```

This returns JSON with everything needed to preview honestly:

- `compositionConflicts`: two of the *selected profiles themselves* want different content at the same path or rule id. This is a selection problem — go back to step 3 and ask the user to drop one, override one, or accept a merge isn't possible as selected. Never apply while this is non-empty.
- `writable` (`status: "create"` or `"update"`): safe to write, shown to the user as what's new or changing.
- `blocked`: `conflict-pre-existing-file` (something not created by ClaudeFoundry is already at that path), `user-edited` (a previously generated file was hand-edited since), or `previously-generated-now-missing` (a generated file is gone). Show each one individually with its path and status — never silently fold these into the "will create" list.
- `orphaned`: files the current selection no longer provides. Never delete these; tell the user they can remove them by hand if they don't want them anymore.

Present all four groups and wait for explicit approval before applying. A "looks good" or equivalent is sufficient; silence or a topic change is not approval. If the user wants a `blocked` path overwritten anyway, get their explicit per-path approval — that becomes a `--force` argument in the next step, never a default.

## Step 5: Write and record

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" apply . "${CLAUDE_PLUGIN_ROOT}/profiles" <approved-profile-name...> --force path/a.md,path/b.md
```

Omit `--force` unless the user explicitly approved those exact paths in step 4. This single command writes every approved file **and** updates `.claude-foundry/manifest.json` (profile provenance, per-file content hash, timestamp) — don't hand-write the manifest yourself; the engine is what keeps it accurate for the next run.

Report back from the command's real output: files created, files updated, files skipped and why (quoting the actual `status` values), anything still orphaned, and the next suggested step (e.g. "run `/foundry-toolkit:kiro-workflow` to plan the first feature"). Never report a file as written unless `apply`'s own output says so.

## Re-running setup (existing manifest)

Re-running is just Steps 1–5 again with the (possibly changed) profile selection — the `plan`/`apply` commands already read the existing manifest and classify every file correctly (`unchanged`, `update`, `user-edited`, `previously-generated-now-missing`, `orphaned`) without you needing to hash anything by hand. The only extra thing to do first: read `.claude-foundry/manifest.json`'s `profiles` array and show the user what's currently applied before asking what should change, so they're deciding from the real current state rather than from memory.

## New project setup (section 5.3)

When there's genuinely not enough implementation to inspect, ask about essentials — application purpose, technology stack, application type, architectural requirements, database/integrations, testing requirements, build/deployment constraints — but skip any question the (sparse) repository already answers. When an architectural choice has real trade-offs, present the options and trade-offs and wait for approval before generating anything architecture-specific. Then proceed through Steps 2–5 as above.

## Personal preferences

First-time, reusable preferences (e.g. "I always want the base profile plus code review, and I prefer 4-space indentation") should only be asked once and only through an explicitly supported, documented persistence mechanism — not invented ad hoc. Until that mechanism is implemented, treat every project as first-time and ask fresh; do not fabricate a preferences store.

## For profile changes after initial setup

Once `.claude-foundry/manifest.json` exists, a narrower request ("add testing", "drop dotnet", "exclude this one rule") is better handled by `configure-profiles`, which skips straight to re-planning instead of repeating full repository inspection. Use this skill's full flow for first-time setup and whenever the stack itself might have changed.
