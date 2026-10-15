import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfileRegistry } from "../plugins/foundry-toolkit/scripts/lib/load-registry.js";
import { composeProfiles } from "../plugins/foundry-toolkit/scripts/lib/compose.js";
import { computePlan, applyPlan } from "../plugins/foundry-toolkit/scripts/lib/plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilesDir = path.join(__dirname, "..", "plugins", "foundry-toolkit", "profiles");

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "claude-foundry-scenario-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function setUpFresh(dir, names) {
  const { registry } = await loadProfileRegistry(profilesDir);
  const composition = composeProfiles(names, registry);
  const plan = await computePlan(dir, composition);
  return applyPlan(dir, plan);
}

// Scenario 1: fresh .NET project setup
test("scenario: fresh .NET project — base + dotnet applies cleanly with no conflicts", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "App.csproj"), '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>', "utf8");

    const { written, skipped } = await setUpFresh(dir, ["base", "dotnet"]);
    assert.equal(skipped.length, 0);
    assert.ok(written.some((w) => w.path === "CLAUDE.md"));
    assert.ok(written.some((w) => w.path === ".claude-foundry/steering/dotnet-architecture.md"));
    assert.ok(written.some((w) => w.path === ".claude-foundry/steering/rules.md"));

    const rules = await readFile(path.join(dir, ".claude-foundry/steering/rules.md"), "utf8");
    assert.match(rules, /dotnet-naming/);
  });
});

// Scenario 2: existing .NET project with an established architecture — pre-existing files must not be clobbered
test("scenario: existing .NET project — pre-existing architecture doc is flagged, never silently overwritten", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "App.csproj"), '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>', "utf8");
    await mkdir(path.join(dir, ".claude-foundry", "steering"), { recursive: true });
    await writeFile(
      path.join(dir, ".claude-foundry", "steering", "dotnet-architecture.md"),
      "# Our actual architecture\n\nWe use Clean Architecture with 4 layers, documented here before ClaudeFoundry ever ran.\n",
      "utf8"
    );

    const { registry } = await loadProfileRegistry(profilesDir);
    const plan = await computePlan(dir, composeProfiles(["base", "dotnet"], registry));
    const conflict = plan.blocked.find((b) => b.path === ".claude-foundry/steering/dotnet-architecture.md");
    assert.ok(conflict, "the pre-existing architecture doc must be flagged");
    assert.equal(conflict.status, "conflict-pre-existing-file");

    const { written } = await applyPlan(dir, plan);
    assert.ok(!written.some((w) => w.path === conflict.path));
    const stillThere = await readFile(path.join(dir, conflict.path), "utf8");
    assert.match(stillThere, /Our actual architecture/);
  });
});

// Scenario 3: fresh Next.js project setup
test("scenario: fresh Next.js project — base + nextjs + testing applies cleanly", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "web", dependencies: { next: "^14.0.0" } }), "utf8");
    await mkdir(path.join(dir, "app"), { recursive: true });

    const { written, skipped } = await setUpFresh(dir, ["base", "nextjs", "testing"]);
    assert.equal(skipped.length, 0);
    assert.ok(written.some((w) => w.path === ".claude-foundry/steering/nextjs-architecture.md"));
    assert.ok(written.some((w) => w.path === ".claude-foundry/steering/testing-strategy.md"));
  });
});

// Scenario 4: existing Next.js project with existing Claude Code configuration already in place
test("scenario: existing Next.js project with a hand-written CLAUDE.md — flagged as a conflict, not merged or overwritten", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "web", dependencies: { next: "^14.0.0" } }), "utf8");
    await writeFile(dir + "/CLAUDE.md", "# Team conventions\n\nWe already have our own CLAUDE.md, written by hand.\n", "utf8");

    const { registry } = await loadProfileRegistry(profilesDir);
    const plan = await computePlan(dir, composeProfiles(["base", "nextjs"], registry));
    const conflict = plan.blocked.find((b) => b.path === "CLAUDE.md");
    assert.equal(conflict.status, "conflict-pre-existing-file");

    const { written } = await applyPlan(dir, plan);
    assert.ok(!written.some((w) => w.path === "CLAUDE.md"));
    assert.match(await readFile(path.join(dir, "CLAUDE.md"), "utf8"), /Team conventions/);

    // the user can still explicitly approve overwriting it
    const { written: forced } = await applyPlan(dir, plan, ["CLAUDE.md"]);
    assert.ok(forced.some((w) => w.path === "CLAUDE.md" && w.status === "forced-conflict-pre-existing-file"));
  });
});

// Scenario 5: full-stack Next.js + .NET project
test("scenario: full-stack project — nextjs-dotnet pulls in both technologies with zero conflicts", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "web", dependencies: { next: "^14.0.0" } }), "utf8");
    await mkdir(path.join(dir, "api"), { recursive: true });
    await writeFile(path.join(dir, "api", "Api.csproj"), '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>', "utf8");

    const { registry } = await loadProfileRegistry(profilesDir);
    const composition = composeProfiles(["base", "nextjs-dotnet"], registry);
    assert.equal(composition.ok, true);
    assert.deepEqual(composition.conflicts, []);

    const { written, skipped } = await applyPlan(dir, await computePlan(dir, composition));
    assert.equal(skipped.length, 0);
    assert.ok(written.some((w) => w.path === ".claude-foundry/steering/fullstack-nextjs-dotnet.md"));
    assert.ok(written.some((w) => w.path === ".claude-foundry/steering/dotnet-architecture.md"));
    assert.ok(written.some((w) => w.path === ".claude-foundry/steering/nextjs-architecture.md"));

    // confirm commands from both technologies are present and never collide
    const manifest = JSON.parse(await readFile(path.join(dir, ".claude-foundry", "manifest.json"), "utf8"));
    assert.ok(manifest.profiles.some((p) => p.name === "dotnet"));
    assert.ok(manifest.profiles.some((p) => p.name === "nextjs"));
  });
});

// Scenario 9: repeated setup produces no duplicate files
test("scenario: running setup twice with the same selection writes nothing new the second time", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "App.csproj"), '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>', "utf8");
    await setUpFresh(dir, ["base", "dotnet"]);

    const { registry } = await loadProfileRegistry(profilesDir);
    const secondRun = await applyPlan(dir, await computePlan(dir, composeProfiles(["base", "dotnet"], registry)));
    assert.deepEqual(secondRun.written, []);
  });
});
