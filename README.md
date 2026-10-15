# ClaudeFoundry

ClaudeFoundry is a developer toolkit for configuring projects with Claude Code: technology-aware profiles, reusable coding standards, project-specific instructions, skills, agents, and a Kiro-style spec-driven development workflow.

**ClaudeFoundry is an independent community project. It is not an official Anthropic product and is not affiliated with or endorsed by Anthropic.**

## Status

The core loop works end to end: detect → compose → preview → approve → write, with a real safe-write engine behind it (never overwrites a hand-edited or pre-existing file without explicit per-path approval; never deletes an orphaned file). All 5 skills — `setup-project`, `configure-profiles`, `testing`, `code-review`, `kiro-workflow` — install and load correctly, and the profile library (`base`, `dotnet`, `nextjs`, `nextjs-dotnet`, `testing`, `code-review`) is schema-valid and composes cleanly. `npm test` runs 51 automated tests (unit, scenario, custom-profile, detection, plugin-structure) — all passing — plus the update/uninstall commands documented below have been run for real against a local install. See [CHANGELOG.md](./CHANGELOG.md) for the full history, including an architectural fix (the engine now lives inside the plugin directory, not beside it, so it actually ships when someone installs the plugin for real).

## What it does (target design)

- Defines reusable **profiles** — base standards, technology profiles (.NET, Next.js initially), capability profiles (testing, code review), and full-stack compositions — as validated YAML/JSON.
- Inspects a repository (existing or new) and recommends profiles based on real evidence, not file-name guesses alone.
- Generates project-specific instructions, steering documents, skills, and agents **only after you preview and approve** the exact file changes.
- Tracks everything it generates in a per-project manifest, so re-running setup never silently overwrites your edits.
- Reuses a Kiro-style requirements → design → tasks → implementation workflow for planning features, with approval gates at each phase.

## Relationship to Claude Code

ClaudeFoundry is distributed as a single Claude Code **plugin** (`foundry-toolkit`) through a GitHub-hosted **marketplace** defined in this same repository. It uses Claude Code's native skills, agents, and plugin manifest formats — it does not invent a parallel configuration system.

## Installation

```bash
claude plugin marketplace add rj8b0000/claude-foundary
claude plugin install foundry-toolkit@claude-foundary --scope user
```

The plugin is named `foundry-toolkit` rather than `claude-foundry` because Claude Code reserves the `claude-` prefix for Anthropic's own plugins. The repository itself is named **`claude-foundary`** (note the spelling) — a typo made when the repo was created and kept intentionally rather than renamed after the fact; the project's display name is still "ClaudeFoundry." The marketplace's own identifier (the part after `@` above) matches the repo name exactly.

Default install scope is **user** (available in every project on your machine). Pass `--scope project` or `--scope local` to install differently.

## Usage

Inside a Claude Code session, in your own project:

```
/foundry-toolkit:setup-project
```

This inspects your repository, recommends profiles, previews what would be created or changed, and waits for your approval before writing anything.

## Supported technologies (initial)

- .NET / C#
- Next.js / React

Capabilities: testing, code review — both independently selectable and implemented. More of each are planned; see the project structure below.

## Example setup session

A real, unedited run of the engine against a fresh Next.js project (this is actual CLI output, not a mockup):

```
$ node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" detect . "${CLAUDE_PLUGIN_ROOT}/profiles"
[
  { "name": "dotnet",  "confidenceTier": "none" },
  { "name": "nextjs",  "confidenceTier": "high",
    "matched": [{ "type": "package-dependency", "dependency": "next" }, ...] }
]

$ node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" plan . "${CLAUDE_PLUGIN_ROOT}/profiles" base nextjs testing
{
  "ok": true,
  "includedProfiles": [ ...base, nextjs, testing, each "includedBecause": "selected" ],
  "compositionConflicts": [],
  "writable": [
    { "path": "CLAUDE.md", "status": "create" },
    { "path": ".claude-foundry/steering/nextjs-architecture.md", "status": "create" },
    { "path": ".claude-foundry/steering/testing-strategy.md", "status": "create" },
    { "path": ".claude-foundry/steering/rules.md", "status": "create" }
  ],
  "blocked": [],
  "orphaned": []
}

$ node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" apply . "${CLAUDE_PLUGIN_ROOT}/profiles" base nextjs testing
{ "written": [ ...4 files... ], "skipped": [], "compositionConflicts": [] }
```

Re-running `plan` after that reports all four as `"unchanged"` — nothing is rewritten. Hand-editing `CLAUDE.md` and re-running `plan` reports it as `"status": "user-edited"`, and `apply` leaves it alone unless you explicitly pass `--force CLAUDE.md`. Dropping a profile from the selection reports its file as `"status": "orphaned"` — still on disk, never deleted automatically.

In practice you don't run these commands by hand — `/foundry-toolkit:setup-project` runs them for you and presents the results in plain language before asking for approval. This is what it's actually doing underneath.

## Customization

Profiles can be overridden, excluded, or supplemented with your own company-specific or personal rules without modifying ClaudeFoundry's source:

- **Exclude a whole profile**: just don't select it. `base` itself is excludable too.
- **Override one standard**: edit the generated file directly after setup — ClaudeFoundry detects the edit (via its manifest) and will ask before ever touching that file again.
- **Write a custom profile**: author a YAML file matching `plugins/foundry-toolkit/schemas/profile.schema.json` (`kind: custom`), optionally `extends:` a built-in profile to override just one piece of it, validate it with `cli.js validate-profile`, and compose it alongside the built-in library. See `plugins/foundry-toolkit/schemas/README.md` for the field reference and `tests/custom-profile.test.js` for a worked example.
- **Narrower changes to an already-configured project**: use `/foundry-toolkit:configure-profiles` instead of re-running the full setup flow.

## Updating and uninstalling

```bash
claude plugin update foundry-toolkit@claude-foundary
claude plugin uninstall foundry-toolkit@claude-foundary
```

## Repository layout

```
claude-foundary/
├── .claude-plugin/marketplace.json
├── plugins/foundry-toolkit/
│   ├── .claude-plugin/plugin.json
│   ├── package.json          # vendored runtime deps (ajv, ajv-formats, js-yaml) + node_modules/, committed
│   ├── schemas/               # profile.schema.json, manifest.schema.json, README.md
│   ├── scripts/                # engine (lib/: compose, detect, plan, manifest, validate) + cli.js
│   ├── profiles/
│   │   ├── base/base.yaml
│   │   ├── technologies/{dotnet,nextjs}/
│   │   ├── capabilities/{testing,code-review}/
│   │   └── fullstack/nextjs-dotnet.yaml
│   └── skills/{setup-project,configure-profiles,testing,code-review,kiro-workflow}/
├── tests/               # node --test suite (dev-only, not shipped with the plugin)
```

Everything the plugin needs at runtime (`schemas/`, `scripts/`, `profiles/`, their `node_modules/`) lives **inside** `plugins/foundry-toolkit/`, reachable from any skill via `${CLAUDE_PLUGIN_ROOT}` — a plugin installed from a real marketplace only ships its own subtree, not sibling top-level repo folders.

## Troubleshooting

- **"Plugin not found" or a reserved-name error during install** — the installable plugin is named `foundry-toolkit`, not `claude-foundry` (Claude Code reserves the `claude-` prefix for official Anthropic plugins). Use `foundry-toolkit@claude-foundary` as the install id (note: the marketplace/repo name is spelled `claude-foundary`, not `claude-foundry`).
- **`validate-profile` fails with field errors** — the message names the exact field and problem (e.g. `missing required field "schemaVersion"`); fix the YAML and re-run. It never partially applies an invalid profile.
- **`plan` shows a path in `compositionConflicts`** — two of your *selected* profiles disagree on the same file or rule id. This isn't a bug to work around; drop one of the profiles, or edit one so they no longer overlap, and re-plan.
- **`apply` skipped a file you expected to be written** — check its status in the preceding `plan` output. `conflict-pre-existing-file` and `user-edited` are never written without an explicit `--force <path>`; `orphaned` is never written or deleted at all.
- **A previous ClaudeFoundry file seems to have vanished** — check `.claude-foundry/manifest.json`'s `files` list and re-run `plan`; a manually deleted generated file shows as `previously-generated-now-missing` and is only recreated with `--force`.

## Known limitations

- Detection is a heuristic, depth-limited directory scan with simple glob support — not a full project indexer, and still only advisory evidence, never conclusive.
- No deletion capability exists for orphaned files (deliberate scope boundary — a future `prune` command would need its own design and approval gate).
- No architecture scaffold/template files are generated, only steering-doc guidance.
- Personal/company-wide preference persistence doesn't exist yet — setup asks fresh each time.
- The corrected plugin layout (engine inside `plugins/foundry-toolkit/`) has been verified against the real published GitHub repository: a genuine `marketplace add`/`install` fetch delivers exactly the `plugins/foundry-toolkit/` subtree (no `tests/`, no root docs) with its vendored `node_modules` intact, and the engine runs correctly from Claude Code's actual plugin cache.
- The optional Windows CMD installer wrapper is not yet built; when it is, it will only have been tested on Windows, since that's the only environment available here.
- Published at `github.com/rj8b0000/claude-foundary` (note the spelling — see Installation above). A real git-hosted `marketplace add`/`install` from this URL hasn't been re-verified since the initial push; see `RELEASE_CHECKLIST.md`.

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, how to add a profile or skill, and engine/testing conventions.

## Release status

Published at [github.com/rj8b0000/claude-foundary](https://github.com/rj8b0000/claude-foundary) (v0.1.0). The install commands above have been run for real against this live repository — `marketplace add`, `install` (all 5 skills load), and the engine (`detect`/`plan`/`apply`) running directly from Claude Code's real plugin cache, not just a local simulation. See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for what's still open (repo description/topics, `update`/`uninstall` re-verification against the live install, optional marketplace directory submission).
