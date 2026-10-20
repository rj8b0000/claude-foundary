---
name: configure-dotnet-project
description: Use this skill when configuring a .NET project (new or existing) to match this organization's established .NET engineering standards — layering/architecture, the Contracts folder convention, DI registration via Add*Services()/Add*Repositories() extension methods, Central Package Management, async/cancellation rules, ILogger-only logging, structural-enforcement tests, and a generated Postman collection kept in sync with the controllers — derived from the Aldo OMS project's steering documentation. .NET only: it always applies exactly `base` + `dotnet` + `dotnet-standards` (plus the cross-stack `testing`/`code-review` capabilities on request) and never selects, recommends, or considers Next.js, JavaScript, or any other technology profile. For a project that also has a non-.NET part, use `setup-project`/`configure-profiles` instead, or scope this skill explicitly to the .NET sub-project only.
---

# ClaudeFoundry: Configure a .NET project

This is a fixed-selection specialization of `setup-project` / `configure-profiles` for one
purpose only: bringing a .NET project's architecture, structure, and conventions in line
with `dotnet-standards` (which itself requires the baseline `dotnet` profile). It calls the
same engine both of those skills call — it does not reimplement detection, composition, or
the write/conflict logic.

**Scope discipline:** the profile selection for this skill is always exactly:

```
base dotnet-standards
```

(`dotnet-standards` pulls in `dotnet` automatically via `requires` — never select `dotnet`
on its own here, and never add `nextjs`, `nextjs-dotnet`, or any other non-.NET profile to
this selection, even if the repository also contains a frontend.) Add `testing` and/or
`code-review` only if the user asks for those capabilities — they're cross-stack and don't
violate the .NET-only scope. If the repository has a real relationship between a .NET
backend and a non-.NET frontend and the user wants both configured, stop and point them at
`setup-project`/`configure-profiles` with the `nextjs-dotnet` fullstack profile instead of
quietly doing half the job here.

## 1. Load current state

```bash
cat .claude-foundry/manifest.json 2>/dev/null
```

- **Exists** → read its `profiles` array. If it's missing `dotnet-standards`, this is an
  upgrade of an already-`dotnet`-configured project — go to [3. Plan](#3-plan-the-selection).
- **Missing** → first-time setup for this project. Continue to step 2.

## 2. Inspect the project against the standard

Run detection, but only to confirm this is in fact a .NET project — ignore any non-.NET
output entirely, don't act on it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" detect . "${CLAUDE_PLUGIN_ROOT}/profiles"
```

Then inspect directly for what `dotnet-standards` actually checks for — this is where you
identify gaps rather than inventing or assuming them (never silently "fix" a gap as a side
effect of this inspection; just record it to present in step 3):

- **Layering**: does a controller/UI layer reference `DbContext`, `HttpClient`, or a
  third-party SDK directly? Does a repository call another repository or make an HTTP call?
- **Contracts folder**: do service/repository interfaces live in a `Contracts/` subfolder,
  or are interface and implementation mixed together?
- **DI registration**: is there a per-project `AddServices()`/`AddRepositories()` extension
  method, or are registrations scattered across `Program.cs`/`Startup.cs`?
- **Async/cancellation**: any `.Result`, `.Wait()`, `.GetAwaiter().GetResult()` in
  service/repository code? Do public data/integration methods accept and propagate a
  `CancellationToken`?
- **Logging**: any `Console.WriteLine` in service/repository code, or is `ILogger<T>` used
  consistently?
- **Central Package Management**: does `Directory.Packages.props` exist and do `.csproj`
  files omit `Version` attributes, or are versions still set per-project?
- **Structural enforcement**: is there a test project asserting these rules
  (NetArchTest, reflection-based structure tests), or are they only documented?
- **Naming boundary**: is there a consistent, single convention at the API/DTO boundary and
  a separate consistent one at the database boundary (e.g. camelCase JSON over a
  snake_case EF model), without the two leaking into each other?

If a required detail is genuinely missing or ambiguous (e.g. no existing architecture to
infer a layering convention from, or two competing DI patterns already in the codebase),
say so explicitly in step 3 rather than picking one.

## 3. Plan the selection

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" plan . "${CLAUDE_PLUGIN_ROOT}/profiles" base dotnet-standards
```

Add `testing`/`code-review` to the selection only if requested. Read the JSON the same way
`configure-profiles` does:

- `compositionConflicts`: shouldn't occur with this fixed selection; if it does, stop and
  show both contributors rather than picking a winner.
- `writable` (`create`/`update`): the new/updated `dotnet-engineering-standards.md` steering
  doc and any `dotnet` baseline files not already present.
- `blocked`: `conflict-pre-existing-file`, `user-edited`, or
  `previously-generated-now-missing` — show each individually and only use `--force` on a
  path the user explicitly approved overwriting.
- `orphaned`: never deleted by this engine; mention them if a previous selection is being
  narrowed.

Present the gaps found in step 2 alongside this plan — the plan shows what ClaudeFoundry
will *write*, but the gaps are what the user still has to *fix in the code itself*; don't
conflate the two or imply that applying the profile alone brings the project into
compliance.

## 4. Apply only what's approved

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" apply . "${CLAUDE_PLUGIN_ROOT}/profiles" base dotnet-standards --force path/one.md
```

Omit `--force` unless the user explicitly approved those exact paths. Report exactly what
was written, what was skipped and why, and restate the gap list from step 2 as the
project's remaining work — this skill documents and governs the standard, it does not
silently refactor existing code to match it.

## 5. Generate and maintain the Postman collection

`dotnet-standards` writes `.claude-foundry/steering/dotnet-postman-collection.md` in step 4
— follow it for the full workflow and the rules it links to (`dotnet-standards-postman-*`
in `rules.md`). The short version, once the engine's writes are applied:

- **New project / first time this step runs:** confirm an OpenAPI document exists
  (Swashbuckle, NSwag, or `Microsoft.AspNetCore.OpenApi`); if none does, that's a
  prerequisite gap — present it and get approval before adding minimal OpenAPI middleware,
  the same as any other structural gap from step 2. Then load the `postman:bootstrap` skill
  to resolve CLI/workspace setup, `postman:api-documentation` to generate the collection
  from that OpenAPI document (`postman spec generate collection`), `postman:variables` to
  wire up the bearer-token capture script and create the local/production environments, and
  `postman:collection-schema-v3` for any direct edits the generator doesn't cover.
- **Existing project, controllers changed in this session:** don't treat the collection as
  a separate follow-up — regenerate the OpenAPI document and re-run
  `postman spec generate collection ... --force` against the same collection path in the
  same turn as the controller change. This updates added/changed actions in place, but it
  does **not** delete anything: for a removed action, explicitly delete its leftover request
  file (and paired `.resources/` folder) yourself — verified by testing this against a real
  project, `--force` alone leaves a stale request behind.
- Report what you actually generated or updated (collection path, environments touched) the
  same way step 4 reports what was written — don't claim the collection is in sync without
  having regenerated and inspected it.

If the Postman CLI isn't available in this environment, flag it as a gap (per
`postman:bootstrap`'s installation guidance) rather than skipping the feature silently.
