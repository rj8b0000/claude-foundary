# Release checklist

This is the gap between "the code works" (true as of Phase 7) and "this is published for other people to install." Nothing here has been done — this is a checklist, not a log of completed work. See [CHANGELOG.md](./CHANGELOG.md) for what's actually built.

## 0. Naming and branding risk — **decided: keeping "ClaudeFoundry", accepting the risk**

This was flagged as an open risk in the original project brief ("do not assume `claude-foundry` is available on GitHub or that the name has trademark clearance") and is now confirmed, not theoretical:

- **A different, unrelated project already exists on GitHub using the exact name `claude-foundry`** (a skills collection, `tylerburleigh/claude-foundry`, ~60 installs via skills.sh). GitHub repo names are namespaced per owner, so `rj8b0000/claude-foundry` would not technically collide — but anyone searching "claude-foundry" will find both projects, and that confusion is real, not hypothetical. (As it happens, this repo ended up named `claude-foundary` anyway — see 0.1 below — which incidentally sidesteps this specific collision, though not the broader trademark question.)
- **Anthropic's trademark guidelines** (anthropic.com/legal/trademark-guidelines) are, in their own words, restrictive and don't carve out an exception for open-source or community tools: "You may only use our trademarks as specifically permitted by us and only in materials we approve beforehand," and trademarks may not be used in a way that implies sponsorship, endorsement, or affiliation. The guidelines give no explicit safe harbor for a third-party project with "Claude" in its own product name — "ClaudeFoundry" is exactly that kind of use. This is not a definitive legal determination (verify with Anthropic directly or counsel if this matters to you); it is a real, documented restriction with no clear exception found.

**Decision (confirmed by the project owner):** keep "ClaudeFoundry" as the project name, plugin name `foundry-toolkit` (already not "claude-"-prefixed), and the existing "independent community project, not affiliated with/endorsed by Anthropic" disclaimer in the README. The trademark and name-collision risk described above is accepted knowingly, not overlooked. If this changes later — e.g. Anthropic objects after publication — the rename path is still straightforward: the plugin's own installable identifier (`foundry-toolkit`) is already decoupled from the "ClaudeFoundry" display name, so only branding text and the repo name itself would need to change, not the plugin's structure.

### 0.1. Unplanned: the repository is actually named `claude-foundary`, not `claude-foundry`

When the repository was created, it was named `claude-foundary` (an extra "a") rather than `claude-foundry`. Given the choice between renaming it and updating everything to match the name actually in use, the project owner chose to **keep `claude-foundary` and update the docs/manifests to match it**, rather than rename. Every reference below now reflects that real name. `foundry-toolkit` (the plugin's own installable name) is unaffected — it was never tied to the repo's spelling.

## 1. Fill in real values

| File | Field | Value |
|---|---|---|
| `plugins/foundry-toolkit/.claude-plugin/plugin.json` | `author.name`, `homepage`, `repository` | `rj8b0000` / `https://github.com/rj8b0000/claude-foundary` — **done** |
| `.claude-plugin/marketplace.json` | `name`, `owner.name` | `claude-foundary` / `rj8b0000` — **done** |
| `LICENSE` | copyright holder | `rj8b0000` (GitHub handle — swap for a legal/display name anytime if you'd rather) — **done** |
| `README.md` | install commands | `rj8b0000/claude-foundary` — **done** |

## 2. Repository setup

- [x] Create the GitHub repository — created as `rj8b0000/claude-foundary` (see 0.1 above)
- [ ] Add the SSH remote and push (in progress — SSH identity confirmed authenticating as `rj8b0000` via the `github-personal` host alias)
- [ ] Confirm `plugins/foundry-toolkit/node_modules/` actually pushed (it's intentionally un-ignored — see `.gitignore` — but double-check nothing in your global gitconfig or a credential helper strips it)
- [ ] Add a repository description and topics (e.g. `claude-code`, `plugin`, `developer-tools`)

## 3. Verify after pushing

- [ ] `claude plugin marketplace add rj8b0000/claude-foundary` from a machine that has never touched this code before
- [ ] `claude plugin install foundry-toolkit@claude-foundary` and confirm all 5 skills load (mirrors the local clean-environment test already run — see CHANGELOG Phase 8 — but this is the first real test of an actual git-hosted fetch, which only pulls the `plugins/foundry-toolkit/` subtree)
- [ ] Run the example setup session from the README against a real scratch project
- [ ] `claude plugin update` and `claude plugin uninstall` against the real install

## 4. Licensing disclosure

- [ ] Vendored runtime dependencies (`plugins/foundry-toolkit/node_modules/`) are `ajv`, `ajv-formats`, `js-yaml`, `fast-deep-equal`, `json-schema-traverse`, `fast-uri` (all MIT), and `argparse` (Python-2.0, a transitive dependency of `js-yaml`) — all permissive, all compatible with this project's MIT license, and each package's own `LICENSE` file is still present inside its vendored directory (verified). No action required beyond disclosing this list, which this checklist now does.

## 5. Optional, before or shortly after first release

- [ ] Decide whether to submit to Anthropic's community/official plugin marketplace directory, or keep this self-hosted only (README currently documents only the self-hosted path)
- [ ] Windows CMD installer wrapper (not built — section 10 of the original brief; can ship after v0.1.0)
- [ ] Decide on a version/tag strategy (plugin.json and this repo are currently both `0.1.0`, unreleased)

## Already verified, not blocking

- `claude plugin validate` passes for both plugin and marketplace manifests.
- Full install → update → uninstall cycle run for real, locally (Phase 7).
- A genuinely isolated copy of **only** `plugins/foundry-toolkit/` (no sibling repo files, simulating exactly what a real marketplace fetch delivers) installs, loads all 5 skills, and runs detect → plan → apply correctly end to end (Phase 8).
- Repo-wide grep for secrets, credentials, and the local machine's username: zero matches.
- 51/51 automated tests passing (`npm test`).
