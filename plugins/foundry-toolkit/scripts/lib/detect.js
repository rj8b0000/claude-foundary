import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "bin", "obj", "dist", "build", ".next", ".claude-foundry"]);

/** Convert a simple glob (`*`, `**`) to a RegExp anchored to a full relative path. */
function globToRegExp(glob) {
  const escaped = glob
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((seg) => seg.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")
    )
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Walk `rootDir` (skipping heavy/irrelevant directories) up to `maxDepth`,
 * returning every relative path whose filename matches `glob`.
 * This is a best-effort heuristic scan, not a full project indexer.
 */
async function findMatches(rootDir, glob, maxDepth = 6) {
  const regex = globToRegExp(glob);
  const matches = [];

  async function walk(dir, relDir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (regex.test(relPath) || regex.test(entry.name)) matches.push(relPath);
        await walk(path.join(dir, entry.name), relPath, depth + 1);
      } else if (regex.test(relPath) || regex.test(entry.name)) {
        matches.push(relPath);
      }
    }
  }

  await walk(rootDir, "", 0);
  return matches;
}

async function readPackageJson(rootDir) {
  try {
    const raw = await readFile(path.join(rootDir, "package.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Evaluate one `detect` indicator against a real project directory.
 * Returns { matched: boolean, detail: string }. Never throws on a missing
 * file or directory — a missing thing just means "not matched".
 */
export async function evaluateIndicator(indicator, projectRoot) {
  if (indicator.type === "file-exists") {
    const matches = await findMatches(projectRoot, indicator.path);
    return matches.length > 0
      ? { matched: true, detail: `found ${matches.slice(0, 3).join(", ")}${matches.length > 3 ? ", ..." : ""}` }
      : { matched: false, detail: `no file matching "${indicator.path}"` };
  }

  if (indicator.type === "file-contains") {
    const matches = await findMatches(projectRoot, indicator.path);
    for (const relPath of matches) {
      try {
        const content = await readFile(path.join(projectRoot, relPath), "utf8");
        if (content.includes(indicator.pattern)) {
          return { matched: true, detail: `"${indicator.pattern}" found in ${relPath}` };
        }
      } catch {
        // unreadable file: treat as not matching, don't fail the whole detection
      }
    }
    return { matched: false, detail: `"${indicator.pattern}" not found in any file matching "${indicator.path}"` };
  }

  if (indicator.type === "package-dependency") {
    const pkg = await readPackageJson(projectRoot);
    if (!pkg) return { matched: false, detail: "no package.json at project root" };
    const inAny = ["dependencies", "devDependencies", "peerDependencies"].some(
      (section) => pkg[section] && Object.prototype.hasOwnProperty.call(pkg[section], indicator.dependency)
    );
    return inAny
      ? { matched: true, detail: `"${indicator.dependency}" declared in package.json` }
      : { matched: false, detail: `"${indicator.dependency}" not declared in package.json` };
  }

  return { matched: false, detail: `unknown indicator type "${indicator.type}"` };
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/**
 * Evaluate every profile's `detect` indicators (if any) against a real
 * project. This is advisory evidence only — never treat the result as
 * conclusive proof of a technology or architecture on its own.
 *
 * @returns {Promise<Array<{ name: string, kind: string, confidenceTier: 'high'|'medium'|'low'|'none', matched: object[], unmatched: object[] }>>}
 */
export async function detectProfiles(projectRoot, registry) {
  const results = [];
  for (const profile of registry.values()) {
    if (!profile.detect || profile.detect.length === 0) continue;

    const matched = [];
    const unmatched = [];
    for (const indicator of profile.detect) {
      const { matched: isMatch, detail } = await evaluateIndicator(indicator, projectRoot);
      (isMatch ? matched : unmatched).push({ ...indicator, detail });
    }

    const confidenceTier = matched.reduce((best, m) => {
      const rank = CONFIDENCE_RANK[m.confidence] ?? 0;
      return rank > (CONFIDENCE_RANK[best] ?? 0) ? m.confidence : best;
    }, "none");

    results.push({ name: profile.name, kind: profile.kind, confidenceTier, matched, unmatched });
  }
  return results;
}
