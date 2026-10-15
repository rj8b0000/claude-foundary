import { createHash } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import path from "node:path";

export const MANIFEST_SCHEMA_VERSION = "1";

export function sha256Hex(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Build a manifest object (matching schemas/manifest.schema.json) from the
 * profiles that were applied and the files that were actually written.
 *
 * @param {Array<{name: string, version: string, includedBecause?: string}>} profiles
 * @param {Array<{path: string, content: string, generatedBy: {profile: string, componentId: string}}>} generatedFiles
 */
export function buildManifest(profiles, generatedFiles) {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    profiles: profiles.map((p) => ({
      name: p.name,
      version: p.version,
      ...(p.includedBecause ? { includedBecause: p.includedBecause } : {}),
    })),
    files: generatedFiles.map((f) => ({
      path: f.path,
      sha256: sha256Hex(f.content),
      generatedBy: f.generatedBy,
    })),
  };
}

export async function loadManifestFile(manifestPath) {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compare a loaded manifest against the real files in a project.
 * Status per file:
 *  - "unchanged": still matches the hash ClaudeFoundry recorded — safe to overwrite.
 *  - "user-edited": content changed since ClaudeFoundry wrote it — must ask before touching it.
 *  - "missing": the file no longer exists — the user (or something else) removed it.
 */
export async function diffManifest(manifest, projectRoot) {
  const results = [];
  for (const entry of manifest.files) {
    const absolutePath = path.join(projectRoot, entry.path);
    if (!(await fileExists(absolutePath))) {
      results.push({ path: entry.path, status: "missing", generatedBy: entry.generatedBy });
      continue;
    }
    const content = await readFile(absolutePath, "utf8");
    const currentHash = sha256Hex(content);
    results.push({
      path: entry.path,
      status: currentHash === entry.sha256 ? "unchanged" : "user-edited",
      generatedBy: entry.generatedBy,
    });
  }
  return results;
}
