# 11 Close

## Stage contract

- Stage ID: `close`
- Contract version: `1.2.0`
- Applicability: `required`
- Semantic owner request: `workflow.close.project`
- Maximum mutation: `read-only`
- Standards: [`Evidence and Completion`](../standards/evidence.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Compute the final result for the selected goal from current Stage results, Gate projections, Evidence, findings, Gaps, and Receipts. Close is a derived verdict; it does not mutate target facts or upgrade missing evidence.

## Entry contract

- current terminal Stage for the selected goal;
- current basis, Stage registry version, Requirement/Task/Change refs, and applicable GatePolicy projection;
- all completed/blocked/failed Stage results and every known `Not verified` boundary;
- Delivery Receipts when the goal requires delivery.

## Procedure

1. Revalidate the goal terminal Stage, basis, registry contract, result identities, Evidence, Review, and Receipts.
2. Aggregate only required gates and applicable components. Keep source, automated, artifact, runtime, independent Review, Delivery, deployment, and Production axes separate.
3. Set `Pass` only when every required gate passes with its own Evidence and critical Gaps are closed or explicitly waived by the proper owner.
4. Set `Fail` when a required executed check failed or a decisive contract contradiction remains.
5. Set `Blocked` only for a recorded environment/authorization block while affected axes remain `Not verified`.
6. Use `Partial`, `Gap`, or `change-required` when the goal has useful results but cannot legally close as Pass/Fail/Blocked.
7. Record final basis, Artifact/Evidence/Review/Receipt refs, limitations, recovery or follow-up owner, and the first Stage to resume when work continues.
8. Keep durable Product/Domain/API/Data/UI/source documents current-only. Store task-time reports, replay, captures, capability snapshots, and environment evidence in their owned run-local or explicitly accepted evidence location.

## Exit contract

A completed result MUST satisfy:

- `pass-fail-blocked-gap-or-change-verdict-recorded`;
- `all-not-verified-boundaries-visible`;
- `recovery-or-follow-up-owner-recorded`;
- `final-basis-artifact-and-receipt-refs-fixed`.

## Stop states

- `input-not-ready`: the goal's terminal Stage or required gate projection is absent.
- `basis-conflict`: final refs no longer describe one immutable/current basis.
- `evidence-incomplete`: the requested verdict cannot be supported by required Evidence/Receipts.
- `result-invalid`: aggregation hides required gates, reuses incompatible evidence, or omits limitations/recovery.

## Resume and invalidation

Any required Stage/Gate invalidation, final basis/Receipt change, reopened critical Gap, or accepted Change invalidates Close. Resume from the earliest stale or blocked Stage projected by `tooling/workflow-stage.mjs`; do not edit a previous final verdict to conceal history.

## Brownfield behavior

Do not force existing projects to adopt Forgeway folders, schemas, CI, issue trackers, or release processes merely to close a run. Close may reference target-native artifacts and run-local Evidence. Adoption becomes a separate explicit project decision after repeated real use demonstrates a maintained consumer.

## Validation

- Recompute current Gate projection rather than trusting narrative status.
- Verify every final ref and `Not verified` axis.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.
