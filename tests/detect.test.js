import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectProfiles } from "../plugins/foundry-toolkit/scripts/lib/detect.js";
import { loadProfileRegistry } from "../plugins/foundry-toolkit/scripts/lib/load-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilesDir = path.join(__dirname, "..", "plugins", "foundry-toolkit", "profiles");

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "claude-foundry-detect-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("detects a .NET project from a .csproj file, not a Next.js one", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "MyApp.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk.Web\"></Project>", "utf8");
    const { registry } = await loadProfileRegistry(profilesDir);

    const results = await detectProfiles(dir, registry);
    const dotnet = results.find((r) => r.name === "dotnet");
    const nextjs = results.find((r) => r.name === "nextjs");

    assert.equal(dotnet.confidenceTier, "high");
    assert.ok(dotnet.matched.some((m) => m.type === "file-exists" && m.path === "*.csproj"));
    assert.ok(dotnet.matched.some((m) => m.type === "file-contains" && m.pattern === "Microsoft.NET.Sdk.Web"));
    assert.equal(nextjs.confidenceTier, "none");
  });
});

test("detects a Next.js project from package.json's dependency on next", async () => {
  await withTempProject(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "my-app", dependencies: { next: "^14.0.0", react: "^18.0.0" } }),
      "utf8"
    );
    const { registry } = await loadProfileRegistry(profilesDir);

    const results = await detectProfiles(dir, registry);
    const nextjs = results.find((r) => r.name === "nextjs");

    assert.equal(nextjs.confidenceTier, "high");
    assert.ok(nextjs.matched.some((m) => m.type === "package-dependency" && m.dependency === "next"));
  });
});

test("an empty project matches nothing, with no false positives", async () => {
  await withTempProject(async (dir) => {
    const { registry } = await loadProfileRegistry(profilesDir);
    const results = await detectProfiles(dir, registry);
    for (const result of results) {
      assert.equal(result.confidenceTier, "none", `expected no match for ${result.name}`);
    }
  });
});

test("detection skips node_modules and similar directories rather than scanning them", async () => {
  await withTempProject(async (dir) => {
    // a decoy .csproj buried inside node_modules should not count as project evidence
    await mkdir(path.join(dir, "node_modules", "some-package"), { recursive: true });
    await writeFile(path.join(dir, "node_modules", "some-package", "Decoy.csproj"), "<Project></Project>", "utf8");

    const { registry } = await loadProfileRegistry(profilesDir);
    const results = await detectProfiles(dir, registry);
    const dotnet = results.find((r) => r.name === "dotnet");
    assert.equal(dotnet.confidenceTier, "none");
  });
});
