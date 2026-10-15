import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildManifest, diffManifest, sha256Hex } from "../plugins/foundry-toolkit/scripts/lib/manifest.js";

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "claude-foundry-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("buildManifest records hashes and profile provenance", () => {
  const manifest = buildManifest(
    [{ name: "base-minimal", version: "1.0.0", includedBecause: "selected" }],
    [{ path: "CLAUDE.md", content: "hello\n", generatedBy: { profile: "base-minimal", componentId: "base-conventions" } }]
  );

  assert.equal(manifest.schemaVersion, "1");
  assert.equal(manifest.profiles[0].name, "base-minimal");
  assert.equal(manifest.files[0].sha256, sha256Hex("hello\n"));
  assert.equal(manifest.files[0].generatedBy.componentId, "base-conventions");
});

test("diffManifest reports unchanged for a file that still matches its recorded hash", async () => {
  await withTempProject(async (dir) => {
    const content = "# Base conventions\n";
    await writeFile(path.join(dir, "CLAUDE.md"), content, "utf8");
    const manifest = buildManifest(
      [{ name: "base-minimal", version: "1.0.0" }],
      [{ path: "CLAUDE.md", content, generatedBy: { profile: "base-minimal", componentId: "x" } }]
    );

    const diff = await diffManifest(manifest, dir);
    assert.deepEqual(diff, [{ path: "CLAUDE.md", status: "unchanged", generatedBy: { profile: "base-minimal", componentId: "x" } }]);
  });
});

test("diffManifest reports user-edited when the file's content has changed since generation", async () => {
  await withTempProject(async (dir) => {
    const original = "original content\n";
    await writeFile(path.join(dir, "CLAUDE.md"), "the user changed this\n", "utf8");
    const manifest = buildManifest(
      [{ name: "base-minimal", version: "1.0.0" }],
      [{ path: "CLAUDE.md", content: original, generatedBy: { profile: "base-minimal", componentId: "x" } }]
    );

    const diff = await diffManifest(manifest, dir);
    assert.equal(diff[0].status, "user-edited");
  });
});

test("diffManifest reports missing when a previously generated file no longer exists", async () => {
  await withTempProject(async (dir) => {
    const manifest = buildManifest(
      [{ name: "base-minimal", version: "1.0.0" }],
      [{ path: "deleted-doc.md", content: "gone\n", generatedBy: { profile: "base-minimal", componentId: "x" } }]
    );

    const diff = await diffManifest(manifest, dir);
    assert.equal(diff[0].status, "missing");
  });
});
