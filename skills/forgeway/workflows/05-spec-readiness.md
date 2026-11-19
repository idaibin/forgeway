# 05 Spec Readiness

## Stage contract

- Stage ID: `spec-readiness`
- Contract version: `1.2.0`
- Applicability: `required`
- Semantic owner request: `workflow.spec.readiness.project`
- Maximum mutation: `read-only`
- Standard: [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Project one bounded answer to: “Is this Requirement sufficiently specified for an authorized implementation Task?” Aggregate existing authority references and readiness without creating a second Product, Domain, API, Data, Architecture, or UI owner.

## Entry contract

- current `project-discovery` and `product-requirement` results;
- explicit applicable/not-applicable decisions for `solution-contracts` and `ui-specification`;
- current result identities and blockers for every applicable lane;
- current basis and intended source-mutation scope.

## Procedure

1. Revalidate all Stage records against the current basis fingerprint, contract version, result fingerprint, Evidence, and exit conditions.
2. Require each conditional specification lane to be either current `completed` or explicitly `skipped` with decision reference and reason.
3. Build a readiness projection that references, but does not copy, Product/Requirement, Domain, Interface/Data/Architecture, UI, and design authorities.
4. For every lane, record disposition (`referenced`, `extended`, `new`, `not-applicable`), owner, authority state, result identity, readiness, blockers, and `Not verified` dimensions.
5. Confirm that observable acceptance can be mapped to a bounded implementation and verification seam without unresolved product, permission, failure, compatibility, migration, or UI decisions.
6. Record the exact source-mutation boundary that a later Task may request. Readiness does not itself authorize source changes.
7. Return the nearest unresolved owner when any lane is incomplete; otherwise return a current Spec Readiness projection for Task Planning.

## Exit contract

A completed result MUST satisfy:

- `all-applicable-spec-lanes-terminal`;
- `blocking-decisions-and-not-verified-boundaries-listed`;
- `spec-readiness-projection-produced`;
- `source-mutation-gate-disposition-recorded`.

The projection MUST set `authorizes_execution=false`. It is a derived Gate view, not a durable business/API/UI fact or a substitute for Requirement/Task authorization.

## Stop states

- `input-not-ready`: a required earlier Stage or conditional applicability decision is missing.
- `product-confirmation-required`: Product/Requirement behavior or acceptance is unresolved.
- `confirmation-required`: technical/UI authority or source selection requires owner approval.
- `result-invalid`: a referenced Stage result is stale, contradictory, untraceable, or missing required exit conditions.

## Resume and invalidation

Resume by re-reading referenced result identities and Evidence; do not trust a previous textual summary. Any invalidated applicable specification lane, changed Requirement readiness, changed basis, or changed intended mutation scope invalidates this Stage and all downstream Task/implementation results.

## Brownfield behavior

A ready existing project may complete this Stage entirely by referencing current native authorities. Do not generate a universal `spec.md`, YAML sidecar, or Forgeway directory merely to make the projection tidy. Missing durable documentation becomes a blocking Gap only when implementation or verification would otherwise have to guess a material decision.

## Validation

- Earliest missing Stage and stale-result projection: `node tooling/workflow-stage.mjs next --copy-snapshot --state <workflow-state.json> --delivery-db <delivery.sqlite>`.
- Registry/Stage document parity: `node tooling/workflow-stage.mjs validate`.
- Focused fixtures: `node fixtures/workflow-stage/test-core.mjs`.
