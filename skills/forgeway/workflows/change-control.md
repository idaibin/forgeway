# Change Control Interrupt

Change Control is an interrupt, not a mandatory linear Stage. It preempts the current goal whenever an accepted behavior, contract, authority, basis, scope, or required gate changes after downstream work has begun.

## Interrupt contract

- Interrupt ID: `change-control`
- Contract version: `1.3.0`
- Semantic owner request: `delivery.change.control`
- Maximum mutation: `artifact-write`
- Standard: [`Change Management`](../standards/change-management.md)

## Entry

- previous fixed basis and accepted Requirement/contract refs;
- exact changed decision, authority, scope, or policy;
- affected consumers, completed Stage results, Attempts, Evidence, Review, and Receipts.

## Procedure

1. Create a new `CHG-*` record before changing accepted behavior, interface/data/UI/architecture contracts, persistent data, permissions, compatibility, runtime expectations, or required gates.
2. Bind the Change to the previous basis, affected Requirements, reason, decision owner, impact scope, rollout/rollback, and revalidation gates.
3. Determine the earliest affected Stage from changed authority/result identities and invalidation triggers in `runtime/stages.json`.
4. Mark that Stage and every dependent Stage stale in the run projection. Preserve historical failed/successful Attempts, Evidence, Reviews, and Receipts.
5. Update only owning target artifacts. Do not copy facts into a Change record or create compatibility aliases without real consumers/persistent data.
6. Create new Task/Attempt/Evidence identities for resumed work and close the Change only with current evidence or an explicit owner waiver.

## Exit

- `change-record-fixed-to-previous-basis`;
- `affected-requirements-and-stages-listed`;
- `revalidation-and-rollback-plan-recorded`;
- `affected-stage-states-invalidated`.

The workflow selector resolves an active Change Control interrupt before any normal Stage.
A completed snapshot record must also reference the existing host adapter's qualified
Observation as specified in [Workflow State](../runtime/workflow-state.md#interrupts).
Self-declared exit strings and an opaque result reference do not release the interrupt.
The host identifies affected old Stage Attempt/skip-decision identities; the selector
rejects their reuse as current, without invalidating unrelated Stages or treating a
new identity alone as proof of later revalidation. The host adapter remains external-required;
this contract does not implement or authorize its execution.

## Stop states

- `input-not-ready`;
- `basis-conflict`;
- `confirmation-required`;
- `result-invalid`.
