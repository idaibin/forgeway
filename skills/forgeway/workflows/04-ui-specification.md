# 04 UI Specification

## Stage contract

- Stage ID: `ui-specification`
- Contract version: `1.3.0`
- Applicability: `conditional`
- Semantic owner request: `ui.contract.specify`
- Maximum mutation: `artifact-write`
- Standards: [`UI`](../standards/ui.md), [`Frontend CSS and Markup`](../standards/frontend-css.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Turn an accepted visual source or accepted current UI surface into a traceable feature UI contract. Preserve Product behavior, shared visual authority, target components/source, and runtime evidence as separate owners.

## Entry contract

- completed `product-requirement` result and explicit UI-lane applicability;
- one classified source condition: accepted existing design, accepted current surface, supplied source, candidate required, or no usable source;
- immutable source identity/reference, rights/use boundary, target viewport/state coverage, and evidence limitations;
- artifact-write authorization before durable UI or `DESIGN.md` changes.

## Procedure

1. Recheck current product/source truth, routes, data/actions/states, shared visual owners, component library, and target runtime on the fixed basis.
   When a concrete method/prompt/interaction reference is needed, apply
   [optional Handbook lookup](../standards/project-capabilities.md#optional-handbook-references)
   to metadata first. Read only a useful selected fixed reference through the
   existing owner; a miss adds no call. Reference/candidate metadata does not replace
   source selection, rights, project components/tokens or runtime verification.
2. For an accepted source, record its identity, revision/hash, selection/approval, rights/use, `use`/`ignore` boundary, viewport/state coverage, and extraction quality.
3. For a new page without an accepted source, create only an ignored candidate UI spec plus complete generation prompt, route generation through an available design/image capability, and stop for explicit human selection.
4. Resolve whether the proven visual boundary already adopts `DESIGN.md`. Reuse it when present; do not force first adoption for a local feature that preserves shared semantics.
5. When first adoption or shared visual semantics change is explicitly required, bind the candidate `DESIGN.md`, selected source, lint/completeness results, and non-implementer exact-hash approval before shared implementation.
6. Create one feature UI contract per independently accepted page/flow. Name the closest accepted page when one exists and the actual public component/style owner; reuse fitting owners. If none exists or an owner does not fit, record that fact and reason without inventing a reference or blocking unrelated slices. Define composition, data/state meaning, loading/empty/error/permission/populated states, interactions, focus/keyboard, responsive/overflow/localization/reduced-motion behavior, assets, and acceptance.
7. Preserve raw source evidence and a traceable source/current/target delta. Do not copy endpoint DTOs, implementation component APIs, props/events, or shared token values into page contracts.
8. Record the shell, page, panel/component, control, inner-scroll and overlay owners for each affected layout chain. Assign one page-edge inset and internal-gap owner per axis; require every rendered wrapper to keep a semantic, layout, scroll/layer, state/event, transition, ref/test or proven reuse responsibility.
9. Define the exact viewport/state/runtime Evidence matrix for implementation and verification. Build/lint or image approval alone cannot satisfy browser/client verification; later visual corrections update the contract before CSS and retain the original source evidence.
10. Return `Ready`, `Partial`, or `Not Ready` per slice and name each blocking owner and closure condition.

## Exit contract

A completed result MUST satisfy:

- `selected-source-and-rights-boundary-fixed`;
- `feature-ui-contract-and-states-resolved`;
- `viewport-accessibility-and-runtime-evidence-matrix-defined`;
- `ui-readiness-or-explicit-blocker-recorded`.

Return source identity, applicable design authority, feature UI refs, per-slice readiness, state/interaction/viewport/accessibility contract, delta rows, asset/copy decisions, required runtime Evidence, blockers, and `Not verified` limits.

## Stop states

- `input-not-ready`: Product behavior or UI scope is not accepted.
- `evidence-incomplete`: no usable selected/current visual source or required source identity/rights/coverage is available.
- `confirmation-required`: candidate selection or new/changed shared design authority lacks exact-hash human approval.
- `capability-unavailable` or `capability-ambiguous`: no unique source-inspection or UI-contract owner is available.
- `result-invalid`: returned source, contract, readiness, or evidence matrix does not match the fixed input.

## Resume and invalidation

Resume only when selected-source identity, design-authority hash, feature UI contract, viewport/state matrix, basis, and approval remain current. A source, shared design, accepted viewport/state, or product-behavior change invalidates this Stage and dependent implementation, visual comparison, runtime Evidence, and Review.

## Brownfield behavior

Existing project tokens, components, `DESIGN.md`, current pages, and selected designs remain authoritative. Extend the smallest feature UI contract; do not replace a design system because Forgeway entered the project. Pixel inspection may support `visually-inferred` evidence but cannot prove hidden states, accessibility, exact tokens, behavior, or implementation ownership.

## Validation

- UI artifact lint/completeness applies only when the corresponding target authority is created or changed.
- Runtime/browser/client checks occur in Verification, not this Stage.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.
