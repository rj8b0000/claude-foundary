#!/usr/bin/env node
import { loadProfileFile } from "./lib/load-profile.js";
import { validateProfile, validateProfileCrossFields } from "./lib/validate-profile.js";
import { composeProfiles } from "./lib/compose.js";
import { loadProfileRegistry } from "./lib/load-registry.js";
import { detectProfiles } from "./lib/detect.js";
import { computePlan, applyPlan } from "./lib/plan.js";

const [, , command, ...args] = process.argv;

async function loadAndValidate(filePath) {
  const profile = await loadProfileFile(filePath);
  const { valid, errors } = await validateProfile(profile);
  const crossFieldErrors = validateProfileCrossFields(profile);
  const allErrors = [...errors, ...crossFieldErrors];
  return { filePath, profile, valid: valid && crossFieldErrors.length === 0, errors: allErrors };
}

async function runValidate(files) {
  let anyInvalid = false;
  for (const file of files) {
    const result = await loadAndValidate(file);
    if (result.valid) {
      console.log(`✔ ${file} (${result.profile.name}@${result.profile.version})`);
    } else {
      anyInvalid = true;
      console.log(`✘ ${file}`);
      for (const err of result.errors) {
        console.log(`    ${err.path}: ${err.message}`);
      }
    }
  }
  process.exitCode = anyInvalid ? 1 : 0;
}

async function runCompose(files) {
  const registry = new Map();
  for (const file of files) {
    const result = await loadAndValidate(file);
    if (!result.valid) {
      console.error(`✘ ${file} failed validation, cannot compose:`);
      for (const err of result.errors) console.error(`    ${err.path}: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    registry.set(result.profile.name, result.profile);
  }

  const selected = [...registry.keys()];
  printComposeResult(composeProfiles(selected, registry));
}

async function runValidateLibrary(dir) {
  const { registry, problems } = await loadProfileRegistry(dir);
  for (const name of [...registry.keys()].sort()) {
    const p = registry.get(name);
    console.log(`✔ ${name}@${p.version} (${p.kind})`);
  }
  for (const problem of problems) {
    console.log(`✘ ${problem.file}`);
    for (const err of problem.errors) console.log(`    ${err.path}: ${err.message}`);
  }
  process.exitCode = problems.length > 0 ? 1 : 0;
}

async function runComposeLibrary(dir, selected) {
  const { registry, problems } = await loadProfileRegistry(dir);
  if (problems.length > 0) {
    console.error(`✘ ${problems.length} profile(s) in "${dir}" failed validation, cannot compose:`);
    for (const problem of problems) {
      console.error(`  ${problem.file}`);
      for (const err of problem.errors) console.error(`    ${err.path}: ${err.message}`);
    }
    process.exitCode = 1;
    return;
  }
  printComposeResult(composeProfiles(selected, registry));
}

function printComposeResult(result) {
  if (!result.ok) {
    console.log("✘ Composition failed: conflicting profiles cannot be combined.");
    for (const c of result.hardConflicts) console.log(`    "${c.a}" conflictsWith "${c.b}"`);
    process.exitCode = 1;
    return;
  }

  console.log("Included profiles:");
  for (const p of result.includedProfiles) console.log(`  - ${p.name}@${p.version} (${p.includedBecause})`);

  if (result.conflicts.length > 0) {
    console.log("\nUnresolved conflicts (need a user decision, not auto-resolved):");
    for (const c of result.conflicts) {
      console.log(`  - ${c.type}: ${c.path ?? c.id}`);
      for (const contributor of c.contributors) console.log(`      from ${contributor.profile}`);
    }
  } else {
    console.log("\nNo conflicts.");
  }

  console.log(
    `\nResolved: ${result.resolved.instructions.length} instruction file(s), ${result.resolved.steeringDocs.length} steering doc(s), ${result.resolved.rules.length} rule(s), ${result.resolved.skills.length} skill(s), ${result.resolved.agents.length} agent(s).`
  );
  for (const [profileName, commands] of Object.entries(result.resolved.commands)) {
    console.log(`  commands.${profileName}: ${JSON.stringify(commands)}`);
  }
}

async function loadRegistryOrFail(dir) {
  const { registry, problems } = await loadProfileRegistry(dir);
  if (problems.length > 0) {
    console.error(`✘ ${problems.length} profile(s) in "${dir}" failed validation:`);
    for (const problem of problems) {
      console.error(`  ${problem.file}`);
      for (const err of problem.errors) console.error(`    ${err.path}: ${err.message}`);
    }
    process.exitCode = 1;
    return null;
  }
  return registry;
}

async function runDetect(projectRoot, dir) {
  const registry = await loadRegistryOrFail(dir);
  if (!registry) return;
  console.log(JSON.stringify(await detectProfiles(projectRoot, registry), null, 2));
}

async function runPlan(projectRoot, dir, selected) {
  const registry = await loadRegistryOrFail(dir);
  if (!registry) return;
  const composition = composeProfiles(selected, registry);
  if (!composition.ok) {
    console.log(JSON.stringify({ ok: false, hardConflicts: composition.hardConflicts, includedProfiles: composition.includedProfiles }, null, 2));
    process.exitCode = 1;
    return;
  }
  const plan = await computePlan(projectRoot, composition);
  console.log(JSON.stringify({ ok: true, ...plan }, null, 2));
}

async function runApply(projectRoot, dir, selected, forcePaths) {
  const registry = await loadRegistryOrFail(dir);
  if (!registry) return;
  const composition = composeProfiles(selected, registry);
  if (!composition.ok) {
    console.log(JSON.stringify({ ok: false, hardConflicts: composition.hardConflicts }, null, 2));
    process.exitCode = 1;
    return;
  }
  const plan = await computePlan(projectRoot, composition);
  const result = await applyPlan(projectRoot, plan, forcePaths);
  console.log(
    JSON.stringify(
      {
        written: result.written.map((w) => ({ path: w.path, status: w.status })),
        skipped: result.skipped.map((s) => ({ path: s.path, status: s.status })),
        compositionConflicts: plan.compositionConflicts,
      },
      null,
      2
    )
  );
}

/** Split `base dotnet --force CLAUDE.md,foo.md` into profile names and a force-path list. */
function parseSelectionAndForce(args) {
  const forceIndex = args.indexOf("--force");
  if (forceIndex === -1) return { selected: args, forcePaths: [] };
  const selected = args.slice(0, forceIndex);
  const forcePaths = (args[forceIndex + 1] ?? "").split(",").filter(Boolean);
  return { selected, forcePaths };
}

try {
  if (command === "validate-profile") {
    await runValidate(args);
  } else if (command === "compose") {
    await runCompose(args);
  } else if (command === "validate-library") {
    await runValidateLibrary(args[0] ?? "profiles");
  } else if (command === "compose-library") {
    const [dir, ...selected] = args;
    await runComposeLibrary(dir ?? "profiles", selected);
  } else if (command === "detect") {
    const [projectRoot, dir] = args;
    await runDetect(projectRoot, dir ?? "profiles");
  } else if (command === "plan") {
    const [projectRoot, dir, ...selected] = args;
    await runPlan(projectRoot, dir, selected);
  } else if (command === "apply") {
    const [projectRoot, dir, ...rest] = args;
    const { selected, forcePaths } = parseSelectionAndForce(rest);
    await runApply(projectRoot, dir, selected, forcePaths);
  } else {
    console.error(
      "Usage: cli.js <validate-profile|compose> <profile-file...>\n" +
        "       cli.js validate-library [dir=profiles]\n" +
        "       cli.js compose-library <dir> <profile-name...>\n" +
        "       cli.js detect <projectRoot> [dir=profiles]\n" +
        "       cli.js plan <projectRoot> <dir> <profile-name...>\n" +
        "       cli.js apply <projectRoot> <dir> <profile-name...> [--force path1,path2]"
    );
    process.exitCode = 1;
  }
} catch (err) {
  // Never let an engine error (e.g. a missing profile reference, an extends
  // cycle) crash out as a raw stack trace — report it the same actionable way
  // as every other failure this CLI reports.
  console.error(`✘ ${err.message}`);
  process.exitCode = 1;
}
