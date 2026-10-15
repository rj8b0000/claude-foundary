import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { composeProfiles } from "../plugins/foundry-toolkit/scripts/lib/compose.js";
import { computePlan, applyPlan } from "../plugins/foundry-toolkit/scripts/lib/plan.js";

function profile(overrides) {
  return { kind: "technology", version: "1.0.0", description: "fixture", provides: {}, ...overrides };
}

const DOC_PATH = "CLAUDE.md";

function makeRegistry(content = "hello from a\n") {
  const a = profile({ name: "a", provides: { instructions: [{ id: "x", path: DOC_PATH, content }] } });
  return new Map([["a", a]]);
}

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "claude-foundry-plan-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("fresh project: plan proposes create, apply writes the file and a manifest", async () => {
  await withTempProject(async (dir) => {
    const composition = composeProfiles(["a"], makeRegistry());
    const plan = await computePlan(dir, composition);

    assert.equal(plan.writable.length, 1);
    assert.equal(plan.writable[0].status, "create");
    assert.deepEqual(plan.blocked, []);
    assert.deepEqual(plan.orphaned, []);

    const { written, skipped } = await applyPlan(dir, plan);
    assert.equal(written.length, 1);
    assert.deepEqual(skipped, []);

    const content = await readFile(path.join(dir, DOC_PATH), "utf8");
    assert.equal(content, "hello from a\n");

    const manifest = JSON.parse(await readFile(path.join(dir, ".claude-foundry", "manifest.json"), "utf8"));
    assert.equal(manifest.files[0].path, DOC_PATH);
  });
});

test("re-running with the same profile reports unchanged and writes nothing new", async () => {
  await withTempProject(async (dir) => {
    const registry = makeRegistry();
    await applyPlan(dir, await computePlan(dir, composeProfiles(["a"], registry)));

    const secondPlan = await computePlan(dir, composeProfiles(["a"], registry));
    assert.equal(secondPlan.writable.length, 1);
    assert.equal(secondPlan.writable[0].status, "unchanged");

    const { written } = await applyPlan(dir, secondPlan);
    assert.deepEqual(written, []);
  });
});

test("a user edit is detected and never silently overwritten; force overwrites it explicitly", async () => {
  await withTempProject(async (dir) => {
    const registry = makeRegistry();
    await applyPlan(dir, await computePlan(dir, composeProfiles(["a"], registry)));

    await writeFile(path.join(dir, DOC_PATH), "the user rewrote this by hand\n", "utf8");

    const plan = await computePlan(dir, composeProfiles(["a"], registry));
    assert.equal(plan.writable.length, 0);
    assert.equal(plan.blocked.length, 1);
    assert.equal(plan.blocked[0].status, "user-edited");

    const unforced = await applyPlan(dir, plan);
    assert.deepEqual(unforced.written, []);
    assert.equal(unforced.skipped[0].status, "user-edited");
    assert.equal(await readFile(path.join(dir, DOC_PATH), "utf8"), "the user rewrote this by hand\n");

    const forced = await applyPlan(dir, plan, [DOC_PATH]);
    assert.equal(forced.written.length, 1);
    assert.equal(forced.written[0].status, "forced-user-edited");
    assert.equal(await readFile(path.join(dir, DOC_PATH), "utf8"), "hello from a\n");
  });
});

test("a pre-existing file ClaudeFoundry never created is flagged as a conflict, not overwritten by default", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, DOC_PATH), "a human wrote this before ClaudeFoundry ever ran\n", "utf8");

    const registry = makeRegistry();
    const plan = await computePlan(dir, composeProfiles(["a"], registry));
    assert.equal(plan.writable.length, 0);
    assert.equal(plan.blocked.length, 1);
    assert.equal(plan.blocked[0].status, "conflict-pre-existing-file");

    const unforced = await applyPlan(dir, plan);
    assert.deepEqual(unforced.written, []);
    assert.equal(await readFile(path.join(dir, DOC_PATH), "utf8"), "a human wrote this before ClaudeFoundry ever ran\n");

    const forced = await applyPlan(dir, plan, [DOC_PATH]);
    assert.equal(forced.written[0].status, "forced-conflict-pre-existing-file");
    assert.equal(await readFile(path.join(dir, DOC_PATH), "utf8"), "hello from a\n");
  });
});

test("dropping a profile orphans its file instead of deleting it", async () => {
  await withTempProject(async (dir) => {
    const b = profile({ name: "b", provides: { instructions: [{ id: "y", path: "OTHER.md", content: "from b\n" }] } });
    const registry = new Map([...makeRegistry(), ["b", b]]);

    await applyPlan(dir, await computePlan(dir, composeProfiles(["a", "b"], registry)));
    assert.ok(await readFile(path.join(dir, "OTHER.md"), "utf8"));

    // re-run with only "a" selected: "b"'s file is now orphaned, not deleted
    const plan = await computePlan(dir, composeProfiles(["a"], registry));
    assert.equal(plan.orphaned.length, 1);
    assert.equal(plan.orphaned[0].path, "OTHER.md");

    const { written, skipped, manifest } = await applyPlan(dir, plan, ["OTHER.md"]); // force must not delete even if named
    assert.ok(!written.some((w) => w.path === "OTHER.md"), "force never deletes an orphan");
    assert.ok(skipped.some((s) => s.path === "OTHER.md" && s.status === "orphaned"));
    assert.equal(await readFile(path.join(dir, "OTHER.md"), "utf8"), "from b\n", "the orphaned file is left alone on disk");
    assert.ok(manifest.files.some((f) => f.path === "OTHER.md"), "the orphan stays tracked in the manifest");
  });
});

test("a generated file deleted by hand is reported as previously-generated-now-missing and only recreated with force", async () => {
  await withTempProject(async (dir) => {
    const registry = makeRegistry();
    await applyPlan(dir, await computePlan(dir, composeProfiles(["a"], registry)));
    await rm(path.join(dir, DOC_PATH));

    const plan = await computePlan(dir, composeProfiles(["a"], registry));
    assert.equal(plan.blocked[0].status, "previously-generated-now-missing");

    const unforced = await applyPlan(dir, plan);
    assert.deepEqual(unforced.written, []);

    const forced = await applyPlan(dir, plan, [DOC_PATH]);
    assert.equal(forced.written[0].status, "forced-previously-generated-now-missing");
    assert.equal(await readFile(path.join(dir, DOC_PATH), "utf8"), "hello from a\n");
  });
});

test("a profile update (new content, same path) is a safe automatic update, not a conflict", async () => {
  await withTempProject(async (dir) => {
    await applyPlan(dir, await computePlan(dir, composeProfiles(["a"], makeRegistry("version 1\n"))));

    const updatedRegistry = makeRegistry("version 2\n");
    const plan = await computePlan(dir, composeProfiles(["a"], updatedRegistry));
    assert.equal(plan.writable[0].status, "update");
    assert.deepEqual(plan.blocked, []);

    const { written } = await applyPlan(dir, plan);
    assert.equal(written[0].status, "update");
    assert.equal(await readFile(path.join(dir, DOC_PATH), "utf8"), "version 2\n");
  });
});
