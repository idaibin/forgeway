# Deterministic dead-code cleanup

## Evidence and scope

The target project's accepted Product/API/UI/source authorities own business meaning.
Before proposing a deletion, the selected audit owner MUST bind the exact repository,
HEAD plus relevant dirty/untracked content, include/exclude scope and effective
guidance. Apply [project-derived acceptance](code-design.md#project-derived-acceptance).
An existing graph is navigation evidence only; recheck the shortest live source chain.

Classify every candidate as proven removable, uncertain/retained or live/excluded.
For proven removal identify the exact file/hunk, entry and consumer investigation,
reason it is unreachable, preserved behavior, exclusions and remaining evidence gaps.
Do not impose a deletion quota. An empty proven set is a valid no-op.

No text references is insufficient: inspect applicable dynamic imports, auto-registration,
reflection, generated code, routing, template/slot consumption, public exports and
external consumers. State search roots and exclusions. Unresolved consumers keep the
candidate uncertain; broad searching cannot establish production non-use.

A constant-false template branch is only a candidate. Check the framework's compiled
semantics, named-slot presence, parent inspection, registration, initialization and
side effects. A hidden element, deprecated annotation or disabled runtime flag alone
never proves removability. Public APIs, persistence fields, remote configuration and
native plugins require their own owner's confirmed consumer/retirement contract;
this route cannot infer retirement from local absence.

## Local correction

Fix mode MUST have authority for exact source scope, sufficient consumer evidence and
accepted preserved behavior. Preserve other users' staged, unstaged and untracked
content; overlapping unknown ownership blocks that candidate. Do not auto-create or
switch worktrees, reset/stash broad trees, update dependencies or bundle unrelated
refactoring. New sensitive business conflicts return the exact difference and stop
the affected action for an owner decision.

Delete only proven candidates. Compare the final patch to that set, inspect syntax,
framework and affected consumer behavior with applicable project-native checks.
Record tests, runtime, device and production as separate layers. Unavailable required
checks remain Not verified and limit readiness, not a fabricated pass. Do not start
services, build, install, write business data, commit, integrate or publish without
matching task authority. Auditing never grants any of these effects.

## Review and continuation

Use the host-selected audit, source, verification and explicitly requested review
capabilities at their own boundaries; Forgeway does not pin their package or model.
Implementation self-check cannot satisfy independent review. Bind reviews to the
final candidate; route defects to its source owner, then recheck changed evidence
and affected findings. On drift rebind the earliest affected stage. Preserve completed
unaffected results and resume the same task rather than repeating an uncertain write.
