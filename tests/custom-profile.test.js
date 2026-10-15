import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfileFile } from "../plugins/foundry-toolkit/scripts/lib/load-profile.js";
import { validateProfile, validateProfileCrossFields } from "../plugins/foundry-toolkit/scripts/lib/validate-profile.js";
import { loadProfileRegistry } from "../plugins/foundry-toolkit/scripts/lib/load-registry.js";
import { composeProfiles } from "../plugins/foundry-toolkit/scripts/lib/compose.js";
import { computePlan, applyPlan } from "../plugins/foundry-toolkit/scripts/lib/plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilesDir = path.join(__dirname, "..", "plugins", "foundry-toolkit", "profiles");
const customProfilePath = path.join(__dirname, "fixtures", "profiles", "custom-company-standards.yaml");

async function loadCombinedRegistry() {
  const { registry, problems } = await loadProfileRegistry(profilesDir);
  assert.deepEqual(problems, []);
  const custom = await loadProfileFile(customProfilePath);
  const { valid, errors } = await validateProfile(custom);
  assert.equal(valid, true, JSON.stringify(errors));
  registry.set(custom.name, custom);
  return registry;
}

// Scenario 6a: a custom, user-defined profile validates and can be authored without touching ClaudeFoundry's own source
test("a custom profile validates against the same schema as built-in profiles", async () => {
  const custom = await loadProfileFile(customProfilePath);
  const { valid, errors } = await validateProfile(custom);
  assert.equal(valid, true, JSON.stringify(errors));
  assert.deepEqual(validateProfileCrossFields(custom), []);
  assert.equal(custom.kind, "custom");
});

// Scenario 6b: an invalid custom profile produces actionable errors instead of partially applying
test("an invalid custom profile (bad kind) fails validation with an actionable error, not a partial apply", async () => {
  const badProfile = {
    schemaVersion: "1",
    kind: "experimental", // not in the allowed enum
    name: "bad-custom",
    version: "1.0.0",
    description: "a custom profile with a typo'd kind",
  };
  const { valid, errors } = await validateProfile(badProfile);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.path === "/kind" && e.message.includes("must be one of")));
});

// Scenario 6c: the custom profile overrides a base standard via `extends`, without modifying base.yaml itself
test("extending base and overriding one instruction replaces only that content, inheriting the rest", async () => {
  const registry = await loadCombinedRegistry();
  const result = composeProfiles(["acme-company-standards"], registry);

  assert.equal(result.ok, true);
  assert.deepEqual(result.conflicts, []);
  // base itself was never selected or required — only inherited into the custom profile's own effective provides
  assert.deepEqual(result.includedProfiles.map((p) => p.name), ["acme-company-standards"]);

  assert.equal(result.resolved.instructions.length, 1);
  assert.match(result.resolved.instructions[0].content, /Acme Corp standards/);
  assert.ok(!result.resolved.instructions[0].content.includes("Coding conventions and maintainability"));
  // base's `skills: [setup-project]` is still inherited even though its instruction was overridden
  assert.ok(result.resolved.skills.includes("setup-project"));
});

// Scenario 6d: the custom profile composes alongside a technology profile with no conflict
test("a custom profile composes alongside a technology profile and applies end to end", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "claude-foundry-custom-"));
  try {
    const registry = await loadCombinedRegistry();
    const composition = composeProfiles(["acme-company-standards", "dotnet"], registry);
    assert.equal(composition.ok, true);
    assert.deepEqual(composition.conflicts, []);

    const { written, skipped } = await applyPlan(dir, await computePlan(dir, composition));
    assert.equal(skipped.length, 0);

    const claudeMd = await readFile(path.join(dir, "CLAUDE.md"), "utf8");
    assert.match(claudeMd, /Acme Corp standards/, "the custom override wins over the generic base content");

    const rules = await readFile(path.join(dir, ".claude-foundry/steering/rules.md"), "utf8");
    assert.match(rules, /acme-commit-style/);
    assert.match(rules, /dotnet-naming/, "the technology profile's rules still merge in alongside the custom one");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
