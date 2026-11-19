# 03 Solution, Interface and Data

## Stage contract

- Stage ID: `solution-contracts`
- Contract version: `1.3.0`
- Applicability: `conditional`
- Semantic owner request: `solution.contract.resolve`
- Maximum mutation: `artifact-write`
- Standards: [`Interface and Data`](../standards/interfaces-and-data.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Resolve only the interface, data, architecture, and cross-boundary decisions applicable to the accepted Requirement. Preserve each target-native authority; do not create a single Forgeway-owned technical Spec or duplicate endpoint, DTO, migration, or architecture facts.

## Entry contract

- completed `product-requirement` result on the current basis;
- explicit applicability decision for interface, data, and architecture lanes;
- target-native owner and location when an authority will be created or changed;
- artifact-write and owner acceptance for contract-first artifacts.

A `not-applicable` decision requires a named decision reference and reason. Absence of an OpenAPI file, database, or architecture document does not by itself make this Stage applicable.

## Procedure

When this Stage needs API contract design, revision, or validation, resolve
`api.contract.specify` under [API Contract Skill](../standards/api-contract-skill.md).
Return its native contract references to the host coordinator. Data and architecture
lanes retain their own owners and do not require this capability.

1. Translate accepted business semantics into only the invariants, identity, permission, data-scope, success, failure, idempotency, compatibility, and lifecycle decisions required across boundaries.
2. Declare one native wire-contract authority per service and select `code-first` or `contract-first` before request/response definitions are changed.
3. Record `phase: design|implementation`. For code-first, reference the backend route/DTO/error owner and the project generation or validation chain. For contract-first `design`, keep human-readable OpenAPI YAML `draft` until the target owner accepts the exact scope, version, and content hash; then record it as `authoritative` before entering `implementation`.
4. Ensure every input has the real path/query/header/cookie/body location, every non-empty consumed response has a wire schema, standard security is explicit, and required/nullable/enum/default/conditional semantics are sufficient to implement the boundary. Do not infer backend behavior from a frontend wrapper, stale prose, or schema parsing.
5. Keep OpenAPI limited to wire behavior. Product rules, page handling, retries in UI, deployment state, and `Not verified` evidence remain with their owners.
6. Resolve data lifecycle and migration intent separately from API DTOs and domain objects. Empty-database creation and existing-data upgrade are distinct verification targets.
7. Record target architecture decisions only when a boundary, dependency direction, deployment interface, security boundary, or cross-repository responsibility changes. Prefer an existing ADR or architecture owner.
8. Record authoring owner, real non-LLM consumers, validator, drift policy, retirement rule, and separate verification dimensions. Record a producer only for real generated derivatives.
9. Return authority refs and decisions without implementing backend, migration, generated client, or frontend source in this Stage.

## Exit contract

A completed result MUST satisfy:

- `native-interface-data-and-architecture-authorities-resolved`;
- `contract-state-owner-and-consumers-recorded`;
- `cross-boundary-failure-and-compatibility-decisions-recorded`;
- `verification-dimensions-defined`.

Return each applicable lane's authority state, content identity, consumers, compatibility decisions, verification plan, blockers, and `Not verified` dimensions. A structurally valid or accepted contract does not prove backend conformance, frontend consumption, runtime integration, gateway, deployment, or Production.

## Stop states

- `input-not-ready`: Requirement or decisive product semantics are not accepted.
- `authority-conflict`: competing interface/data/architecture owners cannot be reconciled.
- `confirmation-required`: contract-first authority, compatibility, migration, security, or irreversible behavior lacks owner acceptance.
- `capability-unavailable` or `capability-ambiguous`: no unique target/native technical owner can resolve the missing lane.
- `result-invalid`: returned authorities, content identities, states, or verification dimensions conflict with the fixed input.

## Resume and invalidation

Resume only when native authority paths/symbols, owner, contract state, accepted content hash, basis, and consumers remain current. An interface authority, data lifecycle, architecture boundary, or accepted contract hash change invalidates this Stage and dependent Task, implementation, generation, verification, and Review results.

## Brownfield behavior

Prefer existing annotated controllers, typed routers, IDL, OpenAPI, migrations, schemas, ADRs, and generated-client chains. A stale frontend client or old document may identify a conflict but cannot confirm backend truth. Create a missing technical document only when the target owner and real consumer require it; otherwise record decisions in the existing native mechanism or mark the lane `not-applicable`/`Not verified`.

## Validation

- OpenAPI or native-contract validation uses the target project's real command and owner.
- Contract-first lint uses a pinned generic parser/linter without compiling or starting the backend and without parsing Controllers as the document producer.
- Structural lint MUST cover unresolved references, operation identity, path parameters, schema/examples, and standard security declarations. It does not prove design completeness or implementation conformance.
- Project protocol gate applicability with `protocolContractGatePredicates({ authorityStrategy, phase, hasGeneratedDerivatives })`: applicable gates must provide authority and phase explicitly; contract-first `design` marks source conformance `not-applicable`; contract-first `implementation` requires it; code-first requires source conformance and deterministic generation; a contract-first chain with real generated derivatives sets `hasGeneratedDerivatives: true` and also requires deterministic generation.
- Deterministic double generation is required only for code-first or an actual derivative generation chain.
- Structure, backend conformance, frontend consumption, runtime, gateway, deployment, and Production are separate Evidence dimensions.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.
