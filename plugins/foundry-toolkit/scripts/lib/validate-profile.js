import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "..", "..", "schemas", "profile.schema.json");

let cachedValidator = null;

async function getValidator() {
  if (cachedValidator) return cachedValidator;
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

/**
 * Validate a parsed profile object against the profile schema.
 * Returns { valid: boolean, errors: Array<{ path: string, message: string }> }.
 * Errors are actionable: each names the offending field and the problem, never a raw ajv dump.
 */
export async function validateProfile(profile) {
  const validate = await getValidator();
  const valid = validate(profile);
  if (valid) return { valid: true, errors: [] };

  const errors = (validate.errors ?? []).map((e) => ({
    path: e.instancePath || "(root)",
    message: describeAjvError(e),
  }));
  return { valid: false, errors };
}

function describeAjvError(e) {
  switch (e.keyword) {
    case "required":
      return `missing required field "${e.params.missingProperty}"`;
    case "enum":
      return `must be one of: ${e.params.allowedValues.join(", ")}`;
    case "pattern":
      return `does not match the required pattern ${e.params.pattern}`;
    case "additionalProperties":
      return `unexpected field "${e.params.additionalProperty}" — not part of the profile schema`;
    case "const":
      return `must be exactly "${e.params.allowedValue}"`;
    default:
      return e.message ?? "is invalid";
  }
}

/**
 * Additional structural checks beyond what JSON Schema can express:
 * self-reference in extends/requires/conflictsWith, and a profile requiring
 * and conflicting with the same other profile.
 */
export function validateProfileCrossFields(profile) {
  const errors = [];
  const name = profile.name;
  const baseName = (ref) => ref.split("@")[0];

  for (const field of ["extends", "requires", "conflictsWith"]) {
    for (const ref of profile[field] ?? []) {
      if (baseName(ref) === name) {
        errors.push({
          path: `/${field}`,
          message: `profile "${name}" cannot ${field} itself`,
        });
      }
    }
  }

  const requiresSet = new Set((profile.requires ?? []).map(baseName));
  const conflictsSet = new Set((profile.conflictsWith ?? []).map(baseName));
  for (const ref of requiresSet) {
    if (conflictsSet.has(ref)) {
      errors.push({
        path: "/requires",
        message: `profile "${name}" both requires and conflictsWith "${ref}" — contradictory`,
      });
    }
  }

  return errors;
}
