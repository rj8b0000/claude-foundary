# Contributing to ClaudeFoundry

ClaudeFoundry is an independent community project, not an official Anthropic product. Contributions of all sizes are welcome — a new technology profile, a capability profile, a bug fix in the engine, or a documentation improvement.

This file covers the parts that are already stable enough to document. The project is still early (see [CHANGELOG.md](./CHANGELOG.md) for exactly what's implemented); expect this guide to grow as the contribution process itself gets exercised by real pull requests.

## Repository layout

See the "Repository layout" section of [README.md](./README.md). The short version: everything the plugin needs at runtime lives inside `plugins/foundry-toolkit/` (skills, the engine under `scripts/`, the profile library under `profiles/`, schemas under `schemas/`, and vendored `node_modules/`) because a real plugin install only fetches that one subtree. `tests/` at the repo root is dev-only tooling and is never shipped.

## Development setup

```bash
git clone https://github.com/rj8b0000/claude-foundary.git
cd claude-foundary
npm test                    # runs the full suite (node --test tests/*.test.js)
npm run validate:profiles   # schema-validates every profile in the library
```

No separate `npm install` step is needed at the repo root — the engine's dependencies (`ajv`, `ajv-formats`, `js-yaml`) are vendored in `plugins/foundry-toolkit/node_modules/` and Node resolves them from there for both the shipped plugin and the test suite. If you add a new dependency the engine genuinely needs at runtime, add it to `plugins/foundry-toolkit/package.json` and run `npm install` **inside that directory**, then commit the updated `node_modules/` — don't add it to the root `package.json`, since nothing ships from there.

## Adding a technology or capability profile

1. Read `plugins/foundry-toolkit/schemas/README.md` for the full field reference and the composition rules (how `extends`, `requires`, `conflictsWith`, and same-path/same-id merging actually behave).
2. Write the profile as YAML under the appropriate directory (`profiles/technologies/<name>/`, `profiles/capabilities/<name>/`, or `profiles/fullstack/<name>/`).
3. Keep `detect` indicators honest: each one is advisory evidence with a `confidence` level, never proof. Don't mark something `high` confidence unless it genuinely would be unusual for a project without that technology to have it.
4. Validate it:
   ```bash
   node plugins/foundry-toolkit/scripts/cli.js validate-profile plugins/foundry-toolkit/profiles/<path>/<name>.yaml
   ```
5. Add it to `tests/profile-library.test.js` (or a new scenario test) exercising at least: it composes cleanly with `base`, and with any profile it's meant to combine with (e.g. a new full-stack composition). If it defines `commands`, confirm in a test that they stay namespaced and don't collide with another profile's.
6. Run `npm test` and `npm run validate:profiles` before opening a pull request. Report the actual output in the PR description — don't claim a test passed without having run it.

A capability profile should never define its own `commands` — that's reserved for technology profiles, so a capability never competes with a technology's build/test command. If you find yourself wanting to set one, that's a sign it belongs in a technology profile instead.

## Adding a skill

Follow the directory-per-skill convention already in `plugins/foundry-toolkit/skills/`: a `SKILL.md` with YAML frontmatter (`name` matching the directory, a specific `description` that says when to trigger and when *not* to). Keep lengthy reference material in supporting files under the skill's own directory rather than inflating `SKILL.md` itself. If the skill needs to invoke the engine, use `${CLAUDE_PLUGIN_ROOT}` for every path — never a hardcoded one (there's an automated test, `tests/skills.test.js`, that checks this).

Only add a dedicated agent alongside a skill when it provides a distinct benefit over the skill alone — see the reasoning recorded in `CHANGELOG.md`'s Phase 5 entry for why testing/code-review didn't get one.

## Engine conventions

- Pure functions where possible (`compose.js`, `manifest.js`) — easy to unit test without touching a filesystem.
- Filesystem-touching code (`detect.js`, `plan.js`) takes a `projectRoot` argument and never assumes the current working directory.
- Never silently resolve a conflict in the engine — if two profiles disagree, surface it in the return value (`conflicts`, `hardConflicts`, `blocked`) for the caller (a skill, ultimately a human) to decide.
- `cli.js` commands that a skill will parse programmatically (`detect`, `plan`, `apply`) print JSON. Commands meant for a human running them directly (`validate-profile`, `validate-library`, `compose`, `compose-library`) print readable text.
- Wrap anything that can throw a domain error (like `CompositionError`) so the CLI reports it cleanly — never let a raw stack trace reach the user running the command.

## Testing expectations

- `npm test` must pass before a PR is opened.
- A new scenario or bug fix gets a test that would fail without it, same standard the toolkit itself recommends to the projects it configures.
- Tests that touch the filesystem use a fresh temp directory (see the `withTempProject` helper pattern already used across `tests/*.test.js`) and clean up after themselves, even on failure.
- `tests/plugin-cli.test.js` shells out to the real `claude` CLI to validate plugin/marketplace structure — if you don't have Claude Code's CLI available locally, that one test will fail; the rest of the suite doesn't depend on it.

## Reporting issues / proposing changes

Until this repository has a public issue tracker set up, open a pull request with your proposed change and a clear description of the problem it solves — the same honesty standard the toolkit asks of itself applies here: describe what you actually tested, not what you expect to work.

## License

By contributing, you agree your contribution is licensed under this project's MIT license (see [LICENSE](./LICENSE)).
