# 02 Product and Requirement

## Stage contract

- Stage ID: `product-requirement`
- Contract version: `1.2.0`
- Applicability: `required`
- Semantic owner request: `product.contract.specify`
- Optional support request: `domain.model.define`
- Maximum mutation: `artifact-write`
- Standards: [`Product and Requirement`](../standards/product-and-requirements.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Resolve the smallest product-behavior slice that can support observable acceptance. Reuse an accepted Product/Feature authority when it already exists; create or extend product documentation only through its semantic owner.

## Entry contract

- current `project-discovery` result and fixed basis;
- bounded user goal or an existing accepted Product/Feature authority;
- implementation facts and tests only as evidence, never as automatic product intent;
- explicit artifact-write authorization before any durable product-document change.

## Procedure

1. Read the target's existing Product/Feature authority, conventions, affected consumers, representative behavior, and tests on the fixed basis.
2. Select the smallest independently implementable feature slice. Preserve a ready Foundation/Product boundary unless contradictory evidence requires a Change.
3. Record users, behavior, normal and failure outcomes, permissions, data effects, non-goals, and observable acceptance. Apply [Business Scenario Standard](../standards/business-scenarios.md#applicability-and-authority) to the affected slice and carry its accepted applicability/exception decisions forward.
4. Classify material statements as `Confirmed`, `Assumption`, `Open`, `Rejected`, or `Deferred`; do not re-interview decisions already fixed by the request or authoritative project facts.
5. Invoke domain modeling only when shared terminology, rules, lifecycle, invariants, or bounded-context meaning is actually ambiguous. Do not default to technical DDD structures.
6. Resolve one stable Requirement, its owner, Product reference, acceptance list, applicable trace lanes, and blockers. A lane may be applicable, explicitly not applicable, or unresolved; do not invent placeholder contracts.
7. Preview and then write only an authorized target-native Product/Feature artifact. Keep API fields, migrations, UI tokens/geometry, implementation paths, and task-time evidence with their own owners.
8. Mark the slice Ready only when downstream implementation and verification can repeat the intended behavior without guessing. Record the product confirmation decision separately from document structure checks.

## Exit contract

A completed result MUST satisfy:

- `product-authority-resolved`;
- `material-decisions-classified`;
- `requirement-and-observable-acceptance-ready`;
- `product-confirmation-recorded`.

Return Product/Feature refs, Requirement ref, accepted decisions, acceptance, scope/non-goals, applicable lanes, blockers, `Not verified` boundaries, and the next semantic owner. Readiness does not imply implementation, verification, Review, or Delivery.

## Stop states

- `input-not-ready`: no bounded outcome or usable product evidence exists.
- `scope-ambiguous`: the request contains multiple independent features without an accepted slice boundary.
- `product-confirmation-required`: a missing user/business decision changes behavior, permission, failure, data risk, or acceptance.
- `capability-unavailable` or `capability-ambiguous`: no unique current product/domain owner can complete the missing responsibility.
- `result-invalid`: returned scope, authority, decisions, acceptance, or result refs do not match the Stage input.

## Resume and invalidation

Resume only when the Product/Feature and Requirement refs, content identities, basis, owner, and confirmation remain current. User-visible behavior, business rules, permissions, failure semantics, acceptance, or product-authority replacement invalidates this Stage and every dependent specification, Task, implementation, and Evidence result.

## Brownfield behavior

Do not rebuild a PRD because Forgeway entered an existing repository. Reference accepted product facts first. When code and tests reveal behavior absent from product documentation, report it as implementation fact and propose a Draft backfill; only the product owner may promote it to intent. A bug or visual mismatch does not rewrite product behavior unless the intended outcome actually changes.

## Validation

- Requirement/schema checks through the repository validator when an authorized Requirement is written.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.
- Focused earliest-stage/resume checks: `node fixtures/workflow-stage/test-core.mjs`.
