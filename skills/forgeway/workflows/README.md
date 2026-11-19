# Workflows

Workflows sequence Standards through one uniform [Workflow Stage Contract](../standards/workflow-stages.md). They do not redefine product, interface, data, UI, source, evidence, or delivery rules.

## Linear stages

- `project-discovery` — [Project discovery and asset baseline](./00-project-discovery.md)
  - execute [Fix basis and authority](./01-fix-basis.md) inside this Stage before classification
- `product-requirement` — [Product and Requirement](./02-product-and-requirement.md)
- `solution-contracts` — [Solution, interface and data contracts](./03-solution-interface-data.md), conditional
- `ui-specification` — [UI specification](./04-ui-specification.md), conditional
- `spec-readiness` — [Spec readiness](./05-spec-readiness.md)
- `task-planning` — [Task planning](./06-task-planning.md)
- `implementation` — [Implementation](./07-implementation.md)
- `verification` — [Verification](./08-verification.md)
- `review` — [Independent review](./09-review.md)
- `delivery` — [Delivery](./10-delivery.md)
- `close` — [Close](./11-close.md)

Machine order, applicability, execution kind, capability/host adapter resolution, mutation boundary, entry/exit conditions, stop states, and invalidation triggers are owned by [`runtime/stages.json`](../runtime/stages.json). `node tooling/workflow-stage.mjs next --copy-snapshot --state <workflow-state.json> --delivery-db <delivery.sqlite>` verifies Delivery Graph refs, returns the earliest current Stage, and always sets `authorizes_execution=false`.

## Goal flows and interrupts

- [`to-spec`](./to-spec.md) runs only through Spec Readiness and preserves separate Product, Domain, Interface/Data/Architecture, and UI owners.
- [`change-control`](./change-control.md) is an interrupt. It preempts the linear flow when accepted behavior, authority, basis, scope, or gates change and invalidates the earliest affected Stage plus downstream results.

## Entry and adoption

The entry accepts a product idea, empty directory, existing repository, or bounded delivery outcome. Existing projects default to `reference > extend > create`; Forgeway never requires a `forgeway/` or `.forgeway/` directory, a universal Spec, a fixed issue tracker, or adoption of every Stage artifact.

Creative production remains outside this lifecycle. Forgeway may consume an already accepted external creative artifact by immutable reference and evidence, but does not generate or publish it.

Independent post-task maintenance: [bounded retrospective](post-task-retrospective.md); not a linear Stage or automatic dispatch action.
