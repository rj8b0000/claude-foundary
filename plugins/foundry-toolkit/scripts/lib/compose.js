/**
 * Profile composition: resolves a set of selected profiles into one inspectable
 * configuration, pulling in dependencies, refusing to silently pick a winner on
 * a meaningful conflict, and never duplicating shared standards unnecessarily.
 */

function baseName(ref) {
  return ref.split("@")[0];
}

function refVersion(ref) {
  const parts = ref.split("@");
  return parts.length > 1 ? parts[1] : undefined;
}

function getProfile(registry, ref, requestedBy) {
  const name = baseName(ref);
  const version = refVersion(ref);
  const profile = registry.get(name);
  if (!profile) {
    throw new CompositionError(
      `profile "${name}" (referenced by ${requestedBy}) is not in the profile registry`
    );
  }
  if (version && profile.version !== version) {
    throw new CompositionError(
      `profile "${name}" is pinned to version ${version} by ${requestedBy}, but the registry has version ${profile.version}`
    );
  }
  return profile;
}

export class CompositionError extends Error {}

/**
 * Resolve a profile's effective `provides` by walking its `extends` chain.
 * The child's own fields override the parent's field-by-field; fields the
 * child omits are inherited unchanged. Detects extends cycles.
 */
function resolveEffectiveProvides(profile, registry, visiting = new Set()) {
  if (visiting.has(profile.name)) {
    throw new CompositionError(
      `extends cycle detected: ${[...visiting, profile.name].join(" -> ")}`
    );
  }
  visiting.add(profile.name);

  let effective = { instructions: [], steeringDocs: [], rules: [], skills: [], agents: [], commands: {} };
  for (const parentRef of profile.extends ?? []) {
    const parent = getProfile(registry, parentRef, `${profile.name}'s extends`);
    const parentEffective = resolveEffectiveProvides(parent, registry, new Set(visiting));
    effective = mergeProvidesLayer(effective, parentEffective);
  }
  effective = mergeProvidesLayer(effective, profile.provides ?? {});

  visiting.delete(profile.name);
  return effective;
}

/** Overlay `child` onto `base`, keyed-array fields override by id, commands shallow-merge. */
function mergeProvidesLayer(base, child) {
  return {
    instructions: overlayById(base.instructions, child.instructions),
    steeringDocs: overlayById(base.steeringDocs, child.steeringDocs),
    rules: overlayById(base.rules, child.rules),
    skills: [...new Set([...(base.skills ?? []), ...(child.skills ?? [])])],
    agents: [...new Set([...(base.agents ?? []), ...(child.agents ?? [])])],
    commands: { ...(base.commands ?? {}), ...(child.commands ?? {}) },
  };
}

function overlayById(baseItems = [], childItems = []) {
  const byId = new Map(baseItems.map((item) => [item.id, item]));
  for (const item of childItems) byId.set(item.id, item);
  return [...byId.values()];
}

/**
 * Resolve the transitive `requires` closure of the selected profiles.
 * Returns a Map<name, { profile, includedBecause }>.
 */
function resolveRequiredClosure(selectedNames, registry) {
  const included = new Map();
  for (const name of selectedNames) {
    const profile = getProfile(registry, name, "selection");
    included.set(profile.name, { profile, includedBecause: "selected" });
  }

  const queue = [...selectedNames];
  while (queue.length > 0) {
    const current = baseName(queue.shift());
    const currentProfile = included.get(current).profile;
    for (const reqRef of currentProfile.requires ?? []) {
      const reqName = baseName(reqRef);
      if (!included.has(reqName)) {
        const reqProfile = getProfile(registry, reqRef, `${current}'s requires`);
        included.set(reqName, { profile: reqProfile, includedBecause: "required-by-dependency" });
        queue.push(reqName);
      }
    }
  }
  return included;
}

/** Find conflictsWith violations among the included set. Each pair reported once. */
function findHardConflicts(included) {
  const conflicts = [];
  const seen = new Set();
  for (const { profile } of included.values()) {
    for (const ref of profile.conflictsWith ?? []) {
      const otherName = baseName(ref);
      if (!included.has(otherName)) continue;
      const key = [profile.name, otherName].sort().join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({ a: profile.name, b: otherName, reason: "conflictsWith" });
    }
  }
  return conflicts;
}

/**
 * Merge resolved `instructions`/`steeringDocs` across all included profiles,
 * grouped by target file path. Identical content at the same path is deduped
 * silently; different content at the same path is a conflict, never resolved
 * by picking a winner.
 */
function mergeNamedTargets(perProfile, field) {
  const byPath = new Map();
  for (const [profileName, effective] of perProfile) {
    for (const item of effective[field] ?? []) {
      if (!byPath.has(item.path)) byPath.set(item.path, []);
      byPath.get(item.path).push({ profile: profileName, id: item.id, content: item.content });
    }
  }

  const resolved = [];
  const conflicts = [];
  for (const [targetPath, contributors] of byPath) {
    const distinctContents = [...new Set(contributors.map((c) => c.content))];
    if (distinctContents.length === 1) {
      resolved.push({
        path: targetPath,
        content: distinctContents[0],
        contributors: contributors.map((c) => c.profile),
        generatedBy: { profile: contributors[0].profile, componentId: contributors[0].id },
      });
    } else {
      conflicts.push({ type: `${field}-path-collision`, path: targetPath, contributors });
    }
  }
  return { resolved, conflicts };
}

/** Merge `rules` across all included profiles, grouped by rule id. */
function mergeRules(perProfile) {
  const byId = new Map();
  for (const [profileName, effective] of perProfile) {
    for (const rule of effective.rules ?? []) {
      if (!byId.has(rule.id)) byId.set(rule.id, []);
      byId.get(rule.id).push({ profile: profileName, text: rule.text });
    }
  }

  const resolved = [];
  const conflicts = [];
  for (const [id, contributors] of byId) {
    const distinctTexts = [...new Set(contributors.map((c) => c.text))];
    if (distinctTexts.length === 1) {
      resolved.push({ id, text: distinctTexts[0], contributors: contributors.map((c) => c.profile) });
    } else {
      conflicts.push({ type: "rule-conflict", id, contributors });
    }
  }
  return { resolved, conflicts };
}

/**
 * Compose the given profile names (and anything they require/extend) from the
 * registry into a single resolved configuration.
 *
 * @param {string[]} selectedNames - profile refs the user chose.
 * @param {Map<string, object>} registry - profile name -> parsed, schema-valid profile object.
 * @returns {{
 *   ok: boolean,
 *   includedProfiles: Array<{name: string, version: string, includedBecause: string}>,
 *   resolved: {instructions: object[], steeringDocs: object[], rules: object[], skills: string[], agents: string[], commands: Record<string, object>},
 *   hardConflicts: Array<{a: string, b: string, reason: string}>,
 *   conflicts: Array<object>
 * }}
 */
export function composeProfiles(selectedNames, registry) {
  const included = resolveRequiredClosure(selectedNames, registry);
  const hardConflicts = findHardConflicts(included);

  const includedProfiles = [...included.entries()].map(([name, { profile, includedBecause }]) => ({
    name,
    version: profile.version,
    includedBecause,
  }));

  if (hardConflicts.length > 0) {
    return { ok: false, includedProfiles, resolved: null, hardConflicts, conflicts: [] };
  }

  const perProfile = [...included.entries()].map(([name, { profile }]) => [
    name,
    resolveEffectiveProvides(profile, registry),
  ]);

  const instructions = mergeNamedTargets(perProfile, "instructions");
  const steeringDocs = mergeNamedTargets(perProfile, "steeringDocs");
  const rules = mergeRules(perProfile);

  const skills = [...new Set(perProfile.flatMap(([, e]) => e.skills ?? []))];
  const agents = [...new Set(perProfile.flatMap(([, e]) => e.agents ?? []))];
  const commands = Object.fromEntries(
    perProfile
      .filter(([, e]) => e.commands && Object.keys(e.commands).length > 0)
      .map(([name, e]) => [name, e.commands])
  );

  const conflicts = [...instructions.conflicts, ...steeringDocs.conflicts, ...rules.conflicts];

  return {
    ok: true,
    includedProfiles,
    resolved: {
      instructions: instructions.resolved,
      steeringDocs: steeringDocs.resolved,
      rules: rules.resolved,
      skills,
      agents,
      commands,
    },
    hardConflicts: [],
    conflicts,
  };
}
