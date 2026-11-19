# 01 Fix Basis and Authority

This is a required subprocedure of `project-discovery`, not an independently skippable lifecycle Stage.

## Purpose

Establish the exact repository/component basis, effective guidance, excluded dirty work, and native authority owners that every later Artifact, Task, Attempt, Evidence, Review, and Receipt must reference.

## Entry contract

- bounded target identity and goal;
- candidate root or repository reference;
- current filesystem/Git access;
- requested include/exclude and mutation boundary.

## Procedure

1. Resolve the real and deepest applicable Git root, nested repository boundaries, branch, exact commit SHA, worktree state, and remote identity.
2. Read effective repository and host guidance, including the nearest applicable `AGENTS.md`.
   On continuation, read the relevant existing project context and original task's
   latest checkpoint under [project continuity](../standards/project-capabilities.md#project-knowledge-and-continuity);
   revalidate the basis and resume condition rather than replaying a historical plan.
3. Record pre-existing dirty paths and explicit exclusions; unrelated work remains out of scope.
4. Name product, domain, source, build, runtime, data, interface, UI, test, and delivery owners only from current evidence.
5. Identify project-native manifests, interface authority, migrations, design authority, generated sources, and validation commands relevant to the goal.
6. Compute or record one stable basis fingerprint for the current workflow state. A branch name, local path, or remembered previous run is not a fixed basis.
7. Preserve unknowns as `Not verified` and conflicts as named Gaps.

## Output contract

Return repository/component identities, commit/worktree basis, effective guidance, dirty exclusions, authority refs, environment limits, and scope. Create a project manifest only when an accepted project/campaign owner and non-LLM consumer require one; no fixed `forgeway/`, `.forgeway/`, or `delivery/` location is implied.

## Stop and resume

Stop with `basis-conflict`, `scope-ambiguous`, or `owner-unresolved` before any downstream mutation. Re-run this procedure whenever repository SHA/worktree, effective guidance, scope, topology, or native authority ownership changes.
