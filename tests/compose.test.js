import { test } from "node:test";
import assert from "node:assert/strict";
import { composeProfiles, CompositionError } from "../plugins/foundry-toolkit/scripts/lib/compose.js";

function profile(overrides) {
  return {
    kind: "technology",
    version: "1.0.0",
    description: "fixture",
    provides: {},
    ...overrides,
  };
}

function registryOf(...profiles) {
  return new Map(profiles.map((p) => [p.name, p]));
}

test("composes two independent profiles with no overlap", () => {
  const a = profile({ name: "a", provides: { skills: ["skill-a"] } });
  const b = profile({ name: "b", provides: { skills: ["skill-b"] } });
  const result = composeProfiles(["a", "b"], registryOf(a, b));

  assert.equal(result.ok, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.resolved.skills.sort(), ["skill-a", "skill-b"]);
  assert.deepEqual(
    result.includedProfiles.map((p) => p.includedBecause),
    ["selected", "selected"]
  );
});

test("requires pulls in a dependency automatically and records why", () => {
  const capability = profile({ name: "testing", provides: { skills: ["run-tests"] } });
  const tech = profile({ name: "dotnet", requires: ["testing"], provides: {} });
  const result = composeProfiles(["dotnet"], registryOf(tech, capability));

  assert.equal(result.ok, true);
  const testingEntry = result.includedProfiles.find((p) => p.name === "testing");
  assert.equal(testingEntry.includedBecause, "required-by-dependency");
  assert.ok(result.resolved.skills.includes("run-tests"));
});

test("conflictsWith produces a hard conflict instead of picking a winner", () => {
  const a = profile({ name: "wpf", conflictsWith: ["nextjs"] });
  const b = profile({ name: "nextjs" });
  const result = composeProfiles(["wpf", "nextjs"], registryOf(a, b));

  assert.equal(result.ok, false);
  assert.equal(result.resolved, null);
  assert.deepEqual(result.hardConflicts, [{ a: "wpf", b: "nextjs", reason: "conflictsWith" }]);
});

test("extends: child overrides a specific rule, inherits the rest from the parent", () => {
  const parent = profile({
    name: "base",
    provides: {
      rules: [
        { id: "indentation", text: "2 spaces" },
        { id: "naming", text: "camelCase" },
      ],
    },
  });
  const child = profile({
    name: "dotnet-style",
    extends: ["base"],
    provides: { rules: [{ id: "naming", text: "PascalCase for public members" }] },
  });
  const result = composeProfiles(["dotnet-style"], registryOf(parent, child));

  assert.equal(result.ok, true);
  // base is inherited, not independently applied, since nothing selected or required it
  assert.deepEqual(result.includedProfiles.map((p) => p.name), ["dotnet-style"]);

  const naming = result.resolved.rules.find((r) => r.id === "naming");
  const indentation = result.resolved.rules.find((r) => r.id === "indentation");
  assert.equal(naming.text, "PascalCase for public members");
  assert.equal(indentation.text, "2 spaces");
});

test("identical content at the same target path is deduped silently", () => {
  const a = profile({
    name: "a",
    provides: { instructions: [{ id: "x", path: "CLAUDE.md", content: "same text" }] },
  });
  const b = profile({
    name: "b",
    provides: { instructions: [{ id: "y", path: "CLAUDE.md", content: "same text" }] },
  });
  const result = composeProfiles(["a", "b"], registryOf(a, b));

  assert.equal(result.ok, true);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.resolved.instructions.length, 1);
  assert.deepEqual(result.resolved.instructions[0].contributors.sort(), ["a", "b"]);
});

test("different content at the same target path is a conflict, not auto-resolved", () => {
  const a = profile({
    name: "a",
    provides: { instructions: [{ id: "x", path: "CLAUDE.md", content: "use tabs" }] },
  });
  const b = profile({
    name: "b",
    provides: { instructions: [{ id: "y", path: "CLAUDE.md", content: "use spaces" }] },
  });
  const result = composeProfiles(["a", "b"], registryOf(a, b));

  assert.equal(result.ok, true, "a content conflict is not a hard conflict");
  assert.equal(result.resolved.instructions.length, 0, "the colliding path is withheld from resolved output");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, "instructions-path-collision");
  assert.equal(result.conflicts[0].path, "CLAUDE.md");
});

test("same rule id with different text across profiles is a conflict", () => {
  const a = profile({ name: "a", provides: { rules: [{ id: "indentation", text: "2 spaces" }] } });
  const b = profile({ name: "b", provides: { rules: [{ id: "indentation", text: "4 spaces" }] } });
  const result = composeProfiles(["a", "b"], registryOf(a, b));

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, "rule-conflict");
  assert.equal(result.resolved.rules.length, 0);
});

test("commands are namespaced per profile, so same-named commands never collide", () => {
  const frontend = profile({ name: "nextjs", provides: { commands: { build: "next build", test: "jest" } } });
  const backend = profile({ name: "dotnet", provides: { commands: { build: "dotnet build", test: "dotnet test" } } });
  const result = composeProfiles(["nextjs", "dotnet"], registryOf(frontend, backend));

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.resolved.commands.nextjs.build, "next build");
  assert.equal(result.resolved.commands.dotnet.build, "dotnet build");
});

test("an extends cycle is rejected with a clear error", () => {
  const a = profile({ name: "a", extends: ["b"] });
  const b = profile({ name: "b", extends: ["a"] });
  assert.throws(() => composeProfiles(["a"], registryOf(a, b)), CompositionError);
});

test("a missing requires target raises a clear error instead of silently skipping it", () => {
  const a = profile({ name: "a", requires: ["does-not-exist"] });
  assert.throws(() => composeProfiles(["a"], registryOf(a)), /does-not-exist/);
});
