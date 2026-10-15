import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfileFile } from "../plugins/foundry-toolkit/scripts/lib/load-profile.js";
import { validateProfile, validateProfileCrossFields } from "../plugins/foundry-toolkit/scripts/lib/validate-profile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(__dirname, "fixtures", "profiles", name);

test("a well-formed profile passes schema validation", async () => {
  const profile = await loadProfileFile(fixture("valid-base.yaml"));
  const { valid, errors } = await validateProfile(profile);
  assert.equal(valid, true, JSON.stringify(errors));
  assert.deepEqual(validateProfileCrossFields(profile), []);
});

test("a profile missing required fields fails with actionable errors", async () => {
  const profile = await loadProfileFile(fixture("invalid-missing-fields.yaml"));
  const { valid, errors } = await validateProfile(profile);
  assert.equal(valid, false);

  const messages = errors.map((e) => `${e.path}: ${e.message}`);
  assert.ok(
    messages.some((m) => m.includes('missing required field "schemaVersion"')),
    `expected a missing-schemaVersion error, got: ${messages.join(" | ")}`
  );
  assert.ok(
    messages.some((m) => m.includes('missing required field "version"')),
    `expected a missing-version error, got: ${messages.join(" | ")}`
  );
  assert.ok(
    errors.some((e) => e.path === "/name"),
    `expected a /name pattern error, got: ${messages.join(" | ")}`
  );
});

test("a profile that extends itself is rejected by cross-field validation", async () => {
  const profile = await loadProfileFile(fixture("invalid-self-extends.yaml"));
  const { valid } = await validateProfile(profile);
  assert.equal(valid, true, "schema itself doesn't forbid self-reference, only cross-field check does");

  const crossErrors = validateProfileCrossFields(profile);
  assert.equal(crossErrors.length, 1);
  assert.match(crossErrors[0].message, /cannot extends itself/);
});

test("requires and conflictsWith the same profile is rejected as contradictory", async () => {
  const profile = {
    schemaVersion: "1",
    kind: "technology",
    name: "contradictory",
    version: "1.0.0",
    description: "fixture",
    requires: ["other-profile"],
    conflictsWith: ["other-profile"],
  };
  const crossErrors = validateProfileCrossFields(profile);
  assert.equal(crossErrors.length, 1);
  assert.match(crossErrors[0].message, /both requires and conflictsWith/);
});
