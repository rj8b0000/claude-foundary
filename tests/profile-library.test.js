import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfileRegistry } from "../plugins/foundry-toolkit/scripts/lib/load-registry.js";
import { composeProfiles } from "../plugins/foundry-toolkit/scripts/lib/compose.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilesDir = path.join(__dirname, "..", "plugins", "foundry-toolkit", "profiles");

test("every profile in the library is individually schema-valid", async () => {
  const { registry, problems } = await loadProfileRegistry(profilesDir);
  assert.deepEqual(problems, []);
  assert.deepEqual(
    [...registry.keys()].sort(),
    ["base", "code-review", "dotnet", "nextjs", "nextjs-dotnet", "testing"]
  );
});

test("base + nextjs + dotnet compose cleanly with no conflicts", async () => {
  const { registry, problems } = await loadProfileRegistry(profilesDir);
  assert.deepEqual(problems, []);

  const result = composeProfiles(["base", "nextjs", "dotnet"], registry);
  assert.equal(result.ok, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(
    result.includedProfiles.map((p) => p.name).sort(),
    ["base", "dotnet", "nextjs"]
  );

  // base writes CLAUDE.md; each technology writes its own steering doc — no path collisions.
  assert.deepEqual(
    result.resolved.instructions.map((i) => i.path),
    ["CLAUDE.md"]
  );
  assert.deepEqual(
    result.resolved.steeringDocs.map((d) => d.path).sort(),
    [".claude-foundry/steering/dotnet-architecture.md", ".claude-foundry/steering/nextjs-architecture.md"]
  );

  // commands stay namespaced per technology, so same-named keys never collide
  assert.equal(result.resolved.commands.dotnet.build, "dotnet build");
  assert.equal(result.resolved.commands.nextjs.build, "next build");
});

test("selecting the fullstack profile alone pulls in both technologies automatically", async () => {
  const { registry, problems } = await loadProfileRegistry(profilesDir);
  assert.deepEqual(problems, []);

  const result = composeProfiles(["nextjs-dotnet"], registry);
  assert.equal(result.ok, true);
  assert.deepEqual(result.conflicts, []);

  const byName = Object.fromEntries(result.includedProfiles.map((p) => [p.name, p.includedBecause]));
  assert.equal(byName["nextjs-dotnet"], "selected");
  assert.equal(byName["nextjs"], "required-by-dependency");
  assert.equal(byName["dotnet"], "required-by-dependency");

  assert.deepEqual(
    result.resolved.steeringDocs.map((d) => d.path).sort(),
    [
      ".claude-foundry/steering/dotnet-architecture.md",
      ".claude-foundry/steering/fullstack-nextjs-dotnet.md",
      ".claude-foundry/steering/nextjs-architecture.md",
    ]
  );
});

test("base is optional: the fullstack profile composes without it", async () => {
  const { registry, problems } = await loadProfileRegistry(profilesDir);
  assert.deepEqual(problems, []);

  const result = composeProfiles(["nextjs-dotnet"], registry);
  assert.equal(result.ok, true);
  assert.ok(!result.includedProfiles.some((p) => p.name === "base"));
  assert.deepEqual(result.resolved.instructions, [], "no CLAUDE.md content without base");
});

test("the full representative composition (base + fullstack) has zero conflicts and no duplicated standards", async () => {
  const { registry, problems } = await loadProfileRegistry(profilesDir);
  assert.deepEqual(problems, []);

  const result = composeProfiles(["base", "nextjs-dotnet"], registry);
  assert.equal(result.ok, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(
    result.includedProfiles.map((p) => p.name).sort(),
    ["base", "dotnet", "nextjs", "nextjs-dotnet"]
  );
  // one instruction target (CLAUDE.md, from base) and three distinct steering docs — nothing duplicated
  assert.equal(result.resolved.instructions.length, 1);
  assert.equal(result.resolved.steeringDocs.length, 3);
  assert.equal(new Set(result.resolved.steeringDocs.map((d) => d.path)).size, 3);
});

test("testing and code-review capabilities are independently selectable and complement, not duplicate, technology profiles", async () => {
  const { registry, problems } = await loadProfileRegistry(profilesDir);
  assert.deepEqual(problems, []);

  // selectable alone, with no technology profile at all
  const alone = composeProfiles(["testing"], registry);
  assert.equal(alone.ok, true);
  assert.deepEqual(alone.conflicts, []);
  assert.deepEqual(alone.resolved.commands, {}, "a capability must never define its own build/test commands");

  const full = composeProfiles(["base", "nextjs-dotnet", "testing", "code-review"], registry);
  assert.equal(full.ok, true);
  assert.deepEqual(full.conflicts, []);
  assert.deepEqual(
    full.includedProfiles.map((p) => p.name).sort(),
    ["base", "code-review", "dotnet", "nextjs", "nextjs-dotnet", "testing"]
  );
  assert.deepEqual(full.resolved.skills.sort(), ["code-review", "setup-project", "testing"]);

  // five distinct steering docs: dotnet, nextjs, fullstack integration, testing strategy, code-review standards
  assert.equal(full.resolved.steeringDocs.length, 5);
  assert.equal(new Set(full.resolved.steeringDocs.map((d) => d.path)).size, 5);

  // technology commands remain untouched by the capabilities
  assert.equal(full.resolved.commands.dotnet.test, "dotnet test");
  assert.ok(!full.resolved.commands.testing, "testing capability must not add its own commands namespace");
});
