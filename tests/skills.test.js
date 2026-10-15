import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.join(__dirname, "..", "plugins", "foundry-toolkit", "skills");

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "SKILL.md must start with YAML frontmatter delimited by ---");
  const block = match[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const descriptionMatch = block.match(/^description:\s*(.+)$/ms);
  return { name: nameMatch?.[1]?.trim(), hasDescription: Boolean(descriptionMatch) };
}

test("every skill has valid frontmatter whose name matches its directory", async () => {
  const dirs = await readdir(skillsDir, { withFileTypes: true });
  const skillDirs = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual(
    skillDirs.sort(),
    ["code-review", "configure-profiles", "kiro-workflow", "setup-project", "testing"]
  );

  for (const dirName of skillDirs) {
    const raw = await readFile(path.join(skillsDir, dirName, "SKILL.md"), "utf8");
    const { name, hasDescription } = parseFrontmatter(raw);
    assert.equal(name, dirName, `skill directory "${dirName}" must declare matching name: ${dirName}`);
    assert.ok(hasDescription, `skill "${dirName}" must have a non-empty description`);
  }
});

test("every skill that invokes the engine does so via \\${CLAUDE_PLUGIN_ROOT}, never a hardcoded path", async () => {
  const dirs = await readdir(skillsDir, { withFileTypes: true });
  for (const entry of dirs.filter((d) => d.isDirectory())) {
    const raw = await readFile(path.join(skillsDir, entry.name, "SKILL.md"), "utf8");
    const scriptInvocations = raw.match(/node\s+"[^"]*cli\.js/g) ?? [];
    for (const invocation of scriptInvocations) {
      assert.match(
        invocation,
        /\$\{CLAUDE_PLUGIN_ROOT\}/,
        `${entry.name}/SKILL.md invokes cli.js without \${CLAUDE_PLUGIN_ROOT}: "${invocation}"`
      );
    }
  }
});
