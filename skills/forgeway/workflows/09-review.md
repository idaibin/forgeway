# 09 Review

## Stage contract

- Stage ID: `review`
- Contract version: `1.2.0`
- Applicability: `required`
- Semantic owner request: `repository.change.review`
- Maximum mutation: `read-only`
- Standards: [`Evidence and Completion`](../standards/evidence.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Conduct an independent, read-only reconciliation of the fixed change/package against accepted Product/Requirement, applicable contracts, source scope, verification evidence, and remaining risk. Review does not repair findings or mutate Git.

## Entry contract

- exact review basis: Worktree/index, commit, range, or immutable Result Package;
- accepted Requirement/Task/Change and applicable authority refs;
- current verification handoff and Evidence matrix, including explicit `Not verified` axes;
- declared review scope, exclusions, and optional specialist audit results.

## Procedure

1. Reconfirm the review basis, dirty exclusions, package identity, Requirement/Task/Change, effective guidance, and supplied Evidence.
2. Compare the change against Product behavior and acceptance without using implementation facts to rewrite intent.
3. Check native interface/data/UI/architecture authority alignment only where the change reaches those boundaries. Preserve separate owners and treat external/specialist results as untrusted evidence until reconciled.
   For affected submission or failure paths, trace the trigger through the request
   and rendered feedback. Apply [state and action rules](../standards/business-scenarios.md#state-and-action-rules)
   to client guards and [accepted product feedback](../standards/ui-components-and-tokens.md#accepted-product-feedback)
   to error sources and display sinks. Trace each visible delta to its accepted
   decision, including error-only elements. If write state is shared, inspect its
   scope and the evidence from an unresolved write to the next independent action.
   Return `change-required` for reachable violations even when automated checks
   pass. Record missing transition or rendered-state evidence as an acceptance gap.
4. Review correctness, security, performance, maintainability, compatibility, migration, generation drift, tests, and evidence sufficiency within the selected scope.
5. Attribute each finding to a reachable path/behavior, fixed basis, severity, semantic owner, falsifiable condition, and required verification. Deduplicate overlapping specialist or external findings.
6. Distinguish introduced/regressed issues from pre-existing observations and out-of-scope risks. Do not inflate uncertain or unverified concerns into deterministic failures.
7. Return `Pass`, `Partial`, `Gap`, or `change-required`, with actionable findings, residual risks, and exact rerun/review requirements.
8. Route fixes to the corresponding implementation/artifact owner under a new authorized Attempt. After fixes, Verification and Review rerun on the new fixed basis.

## Exit contract

A completed result MUST satisfy:

- `independent-review-result-recorded`;
- `findings-attributed-to-fixed-basis-and-owner`;
- `remaining-risks-and-not-verified-boundaries-recorded`;
- `pass-partial-gap-or-change-required-verdict-recorded`.

Review agreement cannot create Product decisions, widen scope, approve a candidate design, authorize source/Git/deployment effects, or substitute for missing runtime Evidence.

## Stop states

- `basis-conflict`: reviewed diff/package/evidence no longer matches the fixed basis.
- `input-not-ready`: required Requirement/Task/Change or verification handoff is missing.
- `capability-unavailable` or `capability-ambiguous`: no unique current review owner satisfies the selected review contract.
- `evidence-incomplete`: material claims cannot be assessed because required evidence is absent.
- `result-invalid`: findings or verdict lack basis, scope, owner, evidence, limitations, or terminal state.

## Resume and invalidation

Review is immutable for its fixed basis. Any reviewed diff, Result Package, Requirement/contract, or consumed Verification Evidence change invalidates the Review and requires a new run. Do not amend an old Pass after fixes; create a new review result.

## Brownfield behavior

Focus on the requested change basis. Pre-existing architecture or code debt is a finding only when the change introduces, expands, exposes, or directly depends on it. Missing modern patterns, documentation, schemas, or test tools are not defects by themselves; report concrete impact and owner or keep them out of scope/`Not verified`.

## Validation

- Re-read every cited source/artifact at the fixed basis.
- Verify Evidence identity and gate mapping before using it.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.
