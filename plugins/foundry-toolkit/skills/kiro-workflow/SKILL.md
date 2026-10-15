---
name: kiro-workflow
description: "Use this skill whenever the user wants to plan a non-trivial feature before writing code — spec-driven development in the style of Kiro: requirements, then design, then a task breakdown, then incremental implementation. Trigger on phrases like 'write a spec for X', 'let's plan this feature', 'create a feature spec', 'EARS requirements', 'spec-driven', 'break this into tasks before we build it', or when a request is clearly a new feature of meaningful size (not a one-line fix) and the user hasn't already handed you a design. Also use it to resume or update work already under .claude-foundry/specs/ — check that directory first if one might exist. Do NOT use it for small, well-understood changes, pure bug fixes, or when the user explicitly asks to just write the code without a spec."
---

# ClaudeFoundry: Kiro-style spec-driven development

This skill turns a feature idea into three short artifacts — requirements, design, tasks — reviewed one at a time, before any implementation starts. The point is to catch misunderstandings while they're cheap to fix (a sentence in a requirements doc) rather than expensive (a wrong abstraction half-built). Keep every artifact as short as it can be while still being useful; this is a planning aid, not a paperwork exercise.

Specs live under `.claude-foundry/specs/`, not `.kiro/specs/` — that path is reserved for the separate Kiro IDE and its own session data, which ClaudeFoundry does not read or write.

## Workflow

Four phases, strictly in order. Each of the first three ends with a **stop-and-wait for approval** gate — do not advance to the next phase, and do not start implementing, until the user explicitly approves the current artifact. If the user asks you to "create a spec" or "write requirements for X", that is a request for phase 1 only — stop there and wait, even if the rest of the workflow seems obvious. Never treat silence or a topic change as approval.

1. **Requirements** — understand the feature, write user stories + EARS acceptance criteria → `requirements.md`
2. **Design** — inspect the real codebase (and this project's ClaudeFoundry steering docs, if any), propose a technical approach → `design.md`
3. **Tasks** — break the approved design into small, ordered, test-driven steps → `tasks.md`
4. **Execution** — implement tasks one at a time, running tests, updating status

```
idea → [Requirements] →(approve)→ [Design] →(approve)→ [Tasks] →(approve)→ [Execution]
```

### Before starting: pick the feature name and check for existing work

Derive a short kebab-case feature name from the request (e.g. "add dark mode toggle" → `dark-mode-toggle`). The spec lives at `.claude-foundry/specs/{feature-name}/`.

If that directory already exists, **read what's there before doing anything else**. Don't overwrite a `requirements.md`, `design.md`, or `tasks.md` that already exists — show the user what's in it and ask whether they want to revise it, continue from where it left off, or start over. Figure out which phase the existing spec reached (e.g. a repo with `requirements.md` and `design.md` but no `tasks.md` is mid-design or ready for the tasks phase) and resume from there rather than restarting.

## Phase 1: Requirements

Goal: pin down *what* to build and *how we'll know it's done*, before any thought of *how*.

1. Ask clarifying questions about anything genuinely ambiguous — scope, users, edge cases, non-goals. Don't pepper the user with questions a reasonable default would answer; ask only what actually changes the design if answered differently.
2. Write `requirements.md` with:
   - A one-paragraph summary of the feature and why it's wanted.
   - One or more **user stories**: `As a <role>, I want <capability>, so that <benefit>.`
   - **Acceptance criteria** per story, in **EARS notation** (see below) — these become the test cases in phase 3, so write them specifically enough to be checked, not as vague aspirations.
   - A short **out of scope** list if anything obvious is deliberately excluded.
3. Present the draft and ask for approval before moving on. If the user pushes back, revise and ask again — don't silently reinterpret and proceed.

### EARS notation

EARS (Easy Approach to Requirements Syntax) keeps acceptance criteria unambiguous and testable. Use whichever template fits each criterion:

| Pattern | Template | Example |
|---|---|---|
| Ubiquitous | The `<system>` shall `<response>` | The system shall encrypt all stored passwords. |
| Event-driven | WHEN `<trigger>`, the `<system>` shall `<response>` | WHEN the user submits an empty form, the system shall display a validation error. |
| State-driven | WHILE `<state>`, the `<system>` shall `<response>` | WHILE the upload is in progress, the system shall disable the submit button. |
| Unwanted behavior | IF `<condition>`, THEN the `<system>` shall `<response>` | IF the API returns a 500, THEN the system shall retry once before surfacing an error. |
| Optional feature | WHERE `<feature is enabled>`, the `<system>` shall `<response>` | WHERE dark mode is enabled, the system shall persist the preference across sessions. |

Combine templates when a criterion needs more than one condition (e.g. "WHILE offline, WHEN the user taps save, the system shall queue the change").

## Phase 2: Design

Goal: figure out *how* to build it, grounded in the codebase that actually exists — not a generic textbook architecture.

1. Inspect the project before proposing anything: read relevant existing modules, note the frameworks/libraries already in use, check for a `CLAUDE.md` and anything under `.claude-foundry/steering/` (ClaudeFoundry-generated architecture guidance, if this project has been set up with it), look at how similar features are already structured, and identify existing tests and conventions (naming, error handling, file layout). A design that ignores this will be rejected on grounds it doesn't fit — do the reading up front.
2. Write `design.md` covering, at the depth the feature actually warrants (skip sections that don't apply):
   - **Overview**: the chosen approach in a few sentences, and why, including any rejected alternatives worth noting.
   - **Architecture / components**: what's new, what's modified, how pieces fit into the existing structure.
   - **Data models / interfaces**: schemas, types, function signatures, API contracts — whatever the feature touches.
   - **Trade-offs and risks**: anything non-obvious about the choice (performance, migration cost, edge cases the design doesn't handle and why that's acceptable).
3. Present the draft and wait for approval before moving to tasks. If the user's feedback changes the approach meaningfully, update `design.md` rather than carrying the delta only in conversation.

## Phase 3: Tasks

Goal: turn the approved design into a concrete, ordered checklist that can be executed incrementally and verified at each step.

Write `tasks.md` as a checklist, each task:
- Small enough to implement and verify in one sitting (prefer several small tasks over one large one).
- Ordered so each task builds on a working state from the previous one — test-driven where it makes sense (write/adjust the test, then the implementation that satisfies it; use the `testing` skill's conventions if this project has the testing capability configured).
- Phrased as an action, referencing the relevant requirement(s) it satisfies, e.g.:

```markdown
- [ ] 1. Add `DarkModePreference` field to the user settings model (req: 1.2)
- [ ] 2. Write unit tests for persisting and reading the preference (req: 1.2, 2.1)
- [ ] 3. Implement the settings toggle in the UI (req: 1.1)
- [ ] 4. Wire the toggle to apply the theme at runtime (req: 1.1, 1.3)
```

Present the list and wait for approval. Approval of the tasks list is also the gate into implementation — do not start coding against an unapproved `tasks.md`, and do not start implementing at all if the user only asked for the spec (requirements/design/tasks) rather than the feature itself.

## Phase 4: Execution

Work through `tasks.md` top to bottom, one task at a time:

1. Implement the task, following the existing codebase's conventions (and this project's ClaudeFoundry rules, if configured) rather than the spec's own illustrative style.
2. Run the relevant tests (the ones the task introduced or touches). Report results honestly — if a test fails or you couldn't run the suite, say so plainly; don't mark a task done on a guess.
3. On success, edit `tasks.md` to check the box (`- [x]`) for that task before moving to the next one, so the file always reflects real progress.
4. If a task turns out to be wrong or the design needs to change mid-implementation, stop and flag it to the user rather than silently improvising around it — a design-level surprise belongs back in `design.md`, not buried in a diff.

Don't batch all tasks into one giant uninterrupted run if the feature is large or risky — check in with the user at natural milestones, but don't ask for permission before every single task once execution has been approved.

## Respecting project-level preferences

If this project's applied ClaudeFoundry profiles later expose explicit workflow preferences (e.g. a stricter or lighter-weight approval gate), honor them. No such mechanism exists yet — don't invent one; follow the phases above as written until one is actually implemented and documented.
