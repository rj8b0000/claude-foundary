---
name: testing
description: Use this skill when the user wants to write, run, improve, or assess test coverage in a project configured with ClaudeFoundry's testing capability — phrases like "add tests for X", "write unit tests", "improve test coverage", "why is this test flaky", or when implementing a task (including a ClaudeFoundry spec task) that should be accompanied by a test. Do NOT use it to decide whether a whole feature needs a spec first — that's the kiro-workflow skill's job.
---

# ClaudeFoundry: Testing

Applies this project's testing standards — from the base profile, the `testing` capability profile, and whichever technology profile(s) are in effect — rather than inventing generic advice from scratch.

## Before writing or changing a test

1. Read `.claude-foundry/steering/testing-strategy.md` if it exists (added by the `testing` capability) for this project's specifics.
2. Identify the test framework, mocking approach, and file-naming convention already in use. Follow it; don't introduce a second framework or convention without raising that with the user first.
3. Find the actual test command. Prefer, in order:
   - A command recorded in `.claude-foundry/manifest.json`'s applied technology profile (e.g. `dotnet test`, `next`'s own test runner if configured) once the setup engine wires that through.
   - What's already defined in the project itself (`package.json` scripts, a `Makefile`, CI config).
   - Never guess a command and report it as having run.

## Writing a test

- Name it after the behavior it verifies, not the method under test.
- For a bug fix: write the test first, confirm it fails for the right reason, then fix the code and confirm it passes.
- For new behavior: the test should fail without the change.
- Keep it deterministic — control time, randomness, and network calls explicitly instead of depending on the real thing.
- Don't skip or disable a test without a comment saying why and flagging it to the user.

## Running tests

Actually run the relevant tests before saying a task is done. Report the real result:
- All passed → say so, and which command you ran.
- Something failed → show the failure, don't mark the task complete, and don't quietly narrow the task to make it look done.
- Couldn't run them (missing dependency, no test command found) → say that plainly instead of guessing at a result.

## Assessing coverage

When asked to improve or assess coverage, prioritize the paths that actually break in practice (auth, payments, data integrity, anything with known past incidents) over chasing a percentage number. Flag untested code that's genuinely risky; don't pad the suite with low-value tests just to raise a metric.
