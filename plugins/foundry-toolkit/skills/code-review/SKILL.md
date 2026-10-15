---
name: code-review
description: Use this skill when the user wants a code review in a project configured with ClaudeFoundry's code-review capability and no more specific review tooling is already handling it — phrases like "review this change", "does this look okay", "review my diff". If a dedicated code-review skill, command, or plugin (official or otherwise) is already available in this session, prefer it for scanning the diff and use this skill only to make sure it has this project's ClaudeFoundry standards as context — don't run two independent reviews.
---

# ClaudeFoundry: Code review

ClaudeFoundry does not reimplement diff-scanning or review-comment mechanics. This skill's job is to make sure a review — whichever tool actually performs it — is held to this project's standards, not generic ones.

## First: check what's already available

If this session has a more specific code-review skill, command, or plugin already loaded, use that for the actual review, and give it (or apply alongside it) the standards below. Don't run a second, independent pass that duplicates its findings — that wastes effort and produces conflicting verdicts on the same lines.

Only perform the review yourself, end to end, when nothing more specific is available.

## Standards to apply

Read `.claude-foundry/steering/code-review-standards.md` if present (added by the `code-review` capability) and the steering docs for whatever technology profile(s) are in effect — they carry stack-specific review concerns this skill doesn't repeat.

In the absence of that file, use this order, most important first:

1. **Correctness** — including edge cases and error paths, not just the happy path.
2. **Security and privacy** — injection, auth bypass, secrets, unsafe deserialization, sensitive data in logs.
3. **Test coverage** — does new behavior have a test that would fail without the change?
4. **Consistency** — does it match the project's existing patterns?
5. **Readability and maintainability.**

## Reporting findings

State the concrete failure scenario for each finding (what input or condition triggers it), not just that something "looks off." Review a one-line change with the same rigor as a large one — size isn't a proxy for risk. Don't block on pure style preferences that don't affect correctness, security, or maintainability, and don't rubber-stamp a change just because it's small or the author is confident.
