import { readdir } from "node:fs/promises";
import path from "node:path";
import { loadProfileFile } from "./load-profile.js";
import { validateProfile, validateProfileCrossFields } from "./validate-profile.js";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (/\.(ya?ml|json)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Load every profile file under `rootDir`, validate each against the schema
 * and the cross-field checks, and build a registry keyed by profile name.
 * Invalid files and duplicate names are reported in `problems`, not thrown,
 * so a caller can decide whether to proceed with the rest of the library.
 *
 * @returns {Promise<{ registry: Map<string, object>, problems: Array<{file: string, errors: object[]}> }>}
 */
export async function loadProfileRegistry(rootDir) {
  const files = await walk(rootDir);
  const registry = new Map();
  const problems = [];

  for (const file of files) {
    const profile = await loadProfileFile(file);
    const { errors } = await validateProfile(profile);
    const crossErrors = validateProfileCrossFields(profile);
    const allErrors = [...errors, ...crossErrors];

    if (allErrors.length > 0) {
      problems.push({ file, errors: allErrors });
      continue;
    }
    if (registry.has(profile.name)) {
      problems.push({
        file,
        errors: [{ path: "/name", message: `duplicate profile name "${profile.name}" — already loaded from another file` }],
      });
      continue;
    }
    registry.set(profile.name, profile);
  }

  return { registry, problems };
}
