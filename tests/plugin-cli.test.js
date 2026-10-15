import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "plugins", "foundry-toolkit", "scripts", "cli.js");

function runClaude(args) {
  return execFileSync("claude", args, { cwd: repoRoot, shell: true, encoding: "utf8" });
}

function runCli(args, { expectFailure = false } = {}) {
  try {
    const stdout = execFileSync("node", [cliPath, ...args], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(expectFailure, false, `expected "${args.join(" ")}" to fail, but it exited 0`);
    return { stdout, exitCode: 0 };
  } catch (err) {
    assert.equal(expectFailure, true, `expected "${args.join(" ")}" to succeed, but it exited ${err.status}: ${err.stderr}`);
    return { stdout: err.stdout, stderr: err.stderr, exitCode: err.status };
  }
}

// Scenario 12 (proxy): plugin and marketplace load/validate from a clean invocation of the real Claude Code CLI.
test("claude plugin validate passes for both the plugin and the marketplace", () => {
  const pluginOutput = runClaude(["plugin", "validate", "./plugins/foundry-toolkit"]);
  assert.match(pluginOutput, /Validation passed/);

  const marketplaceOutput = runClaude(["plugin", "validate", "."]);
  assert.match(marketplaceOutput, /Validation passed/);
});

test("cli.js validate-profile exits non-zero on an invalid profile, with an actionable message on stdout", () => {
  const { stdout, exitCode } = runCli(
    ["validate-profile", path.join(repoRoot, "tests", "fixtures", "profiles", "invalid-missing-fields.yaml")],
    { expectFailure: true }
  );
  assert.equal(exitCode, 1);
  assert.match(stdout, /missing required field "schemaVersion"/);
});

test("cli.js reports a missing profile reference as a clean error, not a raw stack trace", () => {
  const { stderr, exitCode } = runCli(
    ["compose-library", path.join(repoRoot, "plugins", "foundry-toolkit", "profiles"), "base", "nonexistent-profile"],
    { expectFailure: true }
  );
  assert.equal(exitCode, 1);
  assert.match(stderr, /nonexistent-profile.*not in the profile registry/);
  assert.ok(!stderr.includes("at composeProfiles"), "must not leak a raw stack trace to the user");
});

test("cli.js with an unknown command prints usage and exits non-zero", () => {
  const { exitCode } = runCli(["not-a-real-command"], { expectFailure: true });
  assert.equal(exitCode, 1);
});
