# 08 Verification

## Stage contract

- Stage ID: `verification`
- Contract version: `1.3.0`
- Applicability: `required`
- Semantic owner request: `delivery.verify`
- Maximum mutation: `runtime-operation`
- Standards: [`Evidence and Completion`](../standards/evidence.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Execute the required verification matrix against an exact source/Result Package basis and record independent Evidence axes. Apply the [functional acceptance inventory](../standards/evidence.md#functional-acceptance-inventory) rules through the target project's existing test entry and records. Verification observes and validates; it does not edit source or authorize Delivery.

## Entry contract

- current Implementation Result Package or an explicitly fixed read-only basis;
- Requirement/Task/Change acceptance and required gate matrix, or for bounded
  existing-project testing, an evidence-labeled source-derived test plan; missing
  full PRD does not require fabricating accepted product artifacts;
- exact commands, artifacts, runtime targets, viewport/state matrices, environment boundaries, and authorizations;
- current verifier capability compatible with the selected evidence axis.

## Procedure

1. Reconfirm repository/component SHA/worktree, Result Package identity, guidance, scope, and required Evidence matrix before every Attempt.
   Reconcile [rule applicability](../standards/project-capabilities.md#rule-applicability-and-verification)
   with that matrix; for standards/Skill changes apply [rule adoption evidence](../standards/evidence.md#rule-adoption-evidence).
2. Resolve the project-adopted test workspace under [project test asset ownership](../standards/evidence.md#project-test-asset-ownership); keep application source and runtime configuration read-only during verification. Reconcile the task's entries, preserved behavior, cases and fixtures against
   [project-derived acceptance](../standards/code-design.md#project-derived-acceptance).
   For applicable business scenarios, consume the same project decisions and acceptance
   refs using [scenario acceptance and handoff](../standards/business-scenarios.md#acceptance-and-handoff);
   do not regenerate product requirements from the testing checklist.
   For affected write recovery, verify the [scope of action guards](../standards/business-scenarios.md#state-and-action-rules)
   and the [accepted rendered feedback](../standards/ui-components-and-tokens.md#accepted-product-feedback)
   in the original failure state and the next independent action when reachable.
   For AI-generated browser journeys, follow [AI E2E acceptance](../standards/ai-e2e.md): default to current-code/runtime-derived cases without a full PRD, freeze their evidence-labeled inventory before generation, hand missing scripts to their implementation owner, then return to read-only verification. Record conflicting or unverifiable business meanings for later human confirmation; continue independent cases and withhold only dependent business verdicts or unsafe operations.
   Apply the [defect retest and regression-guard evidence rules](../standards/evidence.md#functional-acceptance-inventory) when verifying a repair. Execute source/static checks and automated commands; record cwd, argv, environment class, timing, exit code, and log hash.
   For a reported failure, resolve the [incident closure boundary](../standards/evidence.md#reported-defect-closure) before declaring the repair verified. Bind the original failing operation and distinguish it from adjacent repairs; reconcile later counterexamples and corrections before reusing earlier results.
3. For cross-branch/runtime corrections, apply [cross-target regression and artifact identity](../standards/evidence.md#cross-target-regression-and-artifact-identity), preserving test adapters, exclusions and destination lifecycle evidence. Inspect actual generated/build artifacts when required; a successful build command does not prove artifact contents.
4. Exercise approved API/browser/client/runtime paths and record the effective target identity, state, request/page/event outcome, and reviewable locator.
   Apply [runtime prerequisites and entry attribution](../standards/evidence.md#runtime-prerequisites-and-entry-attribution) before expanding that coverage; preserve independent read-only checks and distinguish normal entry, direct route and authorized business actions.
   For background client requirements, apply the native-client background evidence
   rules in Evidence and Completion: have the host resolve the current operation
   capability, pass foreground/input/session constraints and the bounded operation
   with restoration, and reconcile discovery, actual result, non-interference,
   capture and cleanup evidence separately. For app-owned session protocols, pass
   current qualification evidence and task tool/path limits; query the existing
   submission by session/turn identity and validate actual tool results and terminal
   postconditions. For headless CLI routes, correlate direct process exit and per-turn
   output with the exact persistent session, and verify effective permission evidence
   against the requested mode before accepting any isolation claim. Reconcile uncertain sends rather than replaying them. Route browser page work to its browser
   owner and return unsupported, blocked and unexecuted operations to the same
   acceptance item with their recovery conditions.
   When authorized data is missing, follow the [browser Mock evidence rules](../standards/evidence.md#browser-mock-evidence) with the bundled browser Mock capability; preserve target-owned fixtures and real/mock evidence separately.
5. Select the affected parent-update, keyed lifetime, query recovery and cached-return
   cases from [Code Design](../standards/code-design.md#asynchronous-state-and-cached-consumers)
   before accepting a component-only fixture. Reconcile newly imported dependencies
   with nearby existing test injectors; preserve their assertions and the original
   failure. Then execute the applicable native and rendered checks at their own layers.
   For Product UI, apply the browser viewport policy in Evidence and Completion: select built-in/Playwright dimensions without an extra size question; keep a local user browser at its current size unless acceptance requires another viewport. Execute required viewport/state, keyboard/focus, responsive/overflow, console, and accessibility checks. Compare selected source and runtime at the same viewport/state with computed evidence when visual fidelity is required. One qualifying comparison with full required coverage is sufficient; after actual fixes recheck affected states, preserving explicit project-required rounds and evidence invalidation.
   For shared motion or reusable overlays, select the affected policy/first-frame/lifecycle cases from the [UI standard](../standards/ui-components-and-tokens.md#shared-motion-and-overlay-lifecycle), retaining component and rendered evidence separately.
6. Keep `Source-resolved`, `Automated`, `Artifact-resolved`, `Runtime-resolved`, `Gap`, and `Not verified` independent. One Evidence ID cannot prove unrelated gates.
   For frontend performance or Chrome Energy Saver cases, apply the optional [performance verification standard](../standards/frontend-performance-verification.md): freeze the scripted experiment, calibrate effective browser state, preserve real motion policy and invalidate comparisons affected by runtime drift.
7. Bind every Observation/Evidence record to the exact basis, Attempt, Result Package, Requirement/Task/Change, environment, and achieved level. Failed attempts remain immutable.
8. Return rerun scope, blockers, Gaps, and every unexecuted or inaccessible axis. Do not turn plans, screenshots, passing prose, or model judgment into runtime proof.

## Exit contract

A completed result MUST satisfy:

- `required-checks-attempted-or-explicitly-blocked`;
- `source-automated-artifact-and-runtime-axes-recorded-separately`;
- `evidence-bound-to-exact-basis-and-result-package`;
- `verification-gaps-and-rerun-scope-recorded`.

Return Evidence/Observation refs, per-gate states, exact commands/targets, findings, environment blocks, rerun scope, and `Not verified` boundaries. Verification may be `Pass`, `Fail`, `Partial`, or `Blocked` per gate; it is not the independent Review verdict.

## Stop states

- `basis-conflict`: source or package changed before/during verification.
- `environment-blocked`: required authorized environment, login, browser/client, database, gateway, deployment, or Production target is unavailable.
- `capability-unavailable` or `capability-ambiguous`: no unique verifier owns the required axis.
- `evidence-incomplete`: checks ran but result identity or proof cannot support the claim.
- `result-invalid`: returned Evidence, gate mapping, or terminal state conflicts with the input matrix.

## Resume and invalidation

Resume with a new immutable Attempt unless an interrupted operation can be safely reconciled under its original idempotency identity. Result Package, command, environment, policy, runtime target, or required-gate changes invalidate only affected Evidence and every downstream Review/Delivery claim that consumed it.

## Brownfield behavior

Use existing project tests, build outputs, runtime harnesses, fixtures, browser/client paths, and CI semantics. Do not introduce a new test framework merely for Forgeway. Missing tests or runtime access remain explicit proof gaps; passing legacy tests do not prove newly required behavior unless they exercise the relevant seam.

## Validation

- Validate Evidence records and Result Package bindings with current Forgeway consumers.
- Run target-native commands and approved runtime operations directly.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.
