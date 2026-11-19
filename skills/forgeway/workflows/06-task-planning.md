# 06 Task Planning

## Stage contract

- Stage ID: `task-planning`
- Contract version: `1.2.0`
- Applicability: `required`
- Semantic owner request: `delivery.task.plan`
- Maximum mutation: `artifact-write`
- Standards: [`Task and Implementation`](../standards/tasks-and-implementation.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Convert one current Spec Readiness result into a bounded, independently executable Task plan. Task Planning defines authority and verification seams; it does not edit product source.

## Entry contract

- current `spec-readiness` result and accepted Requirement;
- fixed repository/component basis and current graph/live-source impact evidence when applicable;
- explicit source-mutation authorization boundary;
- available target-native build/test/runtime commands or explicit `Not verified` gaps.

## Procedure

1. Fix Task ID, Requirement/Change refs, repository/component basis, owner, include/exclude paths, dirty exclusions, expected outputs, and stop conditions.
2. Prefer one tracer-bullet vertical slice that is demonstrable or verifiable through the highest stable existing seam and fits one fresh execution context.
3. When several slices are necessary, record a DAG of real blocking edges. Do not create dependencies merely because work touches different layers.
   For several Ready tasks, apply the accepted-order boundary in the [Task Planning standard](../standards/tasks-and-implementation.md#task-planning) and carry the task owner's order and rationale into the handoff.
4. Keep applicable contract, source, generated output, and tests in the same vertical slice. Tests enter the implementation feedback loop rather than a final horizontal batch.
5. For a truly wide mechanical change that cannot land green as vertical slices, plan `expand → migrate batches → contract`, with a final integration/verification gate and explicit compatibility retirement.
6. Resolve the semantic implementation owner from the target language/surface and current capability metadata; do not bind a provider, model, CLI, or package in the portable Task.
7. Record exact `cwd` and `argv[]` validation commands, runtime/environment needs, expected Evidence axes, and conditions that require stopping or Change Control.
8. Validate the Task and preview any durable Task artifact before writing it through its owner.

## Exit contract

A completed result MUST satisfy:

- `task-fixed-to-basis-and-requirement`;
- `include-exclude-scope-and-owner-resolved`;
- `vertical-slices-dependencies-and-stop-conditions-recorded`;
- `native-validation-commands-recorded`.

Return Task ref, slice/DAG plan, current capability request, scope, outputs, commands, Evidence expectations, decisions, limitations, and source-mutation authorization ref. Task readiness does not authorize Git or external/runtime actions beyond its explicit boundary.

## Stop states

- `input-not-ready`: Spec Readiness or accepted Requirement is not current.
- `source-mutation-confirmation-required`: the exact source effect lacks authorization.
- `scope-ambiguous`: include/exclude, component, dependency, or output boundary is unresolved.
- `capability-unavailable` or `capability-ambiguous`: no unique compatible implementation owner exists.
- `result-invalid`: Task basis, scope, commands, outputs, dependencies, or terminal contract is incomplete.

## Resume and invalidation

Resume only when Requirement, applicable contracts, basis, scope, dependency graph, commands, and authorization still match. Any change invalidates Task Planning and dependent Attempts. Do not mutate a Task in place to hide drift; use Change Control and a new immutable attempt/evidence chain.

## Brownfield behavior

Use the repository's current modules, tests, commands, issue/Task conventions, and existing seams. A Repository Asset Graph may narrow navigation and impact, but stale/missing graph data falls back to bounded live discovery and cannot prove absence. Avoid speculative refactors, compatibility layers, or new abstractions not required by the selected slice.

## Validation

- Validate the target Task with the existing Forgeway artifact validator.
- Recheck current source paths/commands at the fixed basis before dispatch.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.
