import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import yaml from "js-yaml";

/**
 * Load and parse a profile file (.yaml, .yml, or .json) into a plain object.
 * Does not validate against the schema — call validateProfile() for that.
 */
export async function loadProfileFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return parseProfileText(raw, filePath);
}

export function parseProfileText(raw, filePath = "<string>") {
  const ext = extname(filePath).toLowerCase();
  try {
    if (ext === ".json") {
      return JSON.parse(raw);
    }
    // js-yaml parses JSON too (JSON is a YAML subset), so default to YAML.
    return yaml.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse profile "${filePath}": ${err.message}`);
  }
}
