# 07 Implementation

## Stage contract

- Stage ID: `implementation`
- Contract version: `1.2.0`
- Applicability: `required`
- Semantic owner request: `source.implement`
- Maximum mutation: `source-write`
- Standards: [`Task and Implementation`](../standards/tasks-and-implementation.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Execute one authorized Task slice through exactly one current semantic implementation owner and return an attributable Result Package. Implementation produces source facts; it does not self-approve verification, Review, Git, deployment, or Production.

## Entry contract

- validated Task fixed to current basis, Requirement/Change, include/exclude, outputs, commands, and stop conditions;
- selected capability whose accepted inputs, outputs, maximum effects, confirmation needs, Evidence class, and terminal contract match the Task;
- effective scope computed from user, host, and capability limits;
- preserved unrelated dirty work.

## Procedure

1. Reconfirm basis, Task, effective guidance, scope, generated-source owners, and pre-existing dirty exclusions immediately before mutation.
2. Give the selected owner the smallest accepted Artifact package; omit unrelated history, secrets, raw credentials, and later-stage authority.
3. Implement the selected vertical slice using target-native language, framework, architecture, migration, generation, and test conventions.
4. Apply red/green/refactor or the repository's equivalent feedback loop at the agreed highest stable seam. Keep each change small enough for immediate syntax/type/test feedback.
5. Update Product, Domain, Interface, UI, `DESIGN.md`, guidance, generated source, and tests only through their semantic owners and only when the Task/Change actually requires them.
6. Preserve existing consumers and data only when the Requirement or real migration boundary requires compatibility. Remove superseded code when the accepted change makes it obsolete and no active consumer remains.
7. Run only the authorized native checks assigned to this Attempt. Record exact cwd/argv, results, generated artifacts, changed paths, acceptance mappings, and unverified runtime axes.
8. Package the result against the immutable Attempt and return an explicit terminal or stop state. Validate the result against the original basis and scope before another Stage can begin.

## Exit contract

A completed result MUST satisfy:

- `authorized-source-diff-produced`;
- `task-acceptance-refs-mapped-to-changes`;
- `native-commands-and-results-recorded`;
- `result-package-fixed-to-attempt`.

Implementation completion may claim only the source/automated/artifact Evidence actually achieved. It cannot claim browser/client/runtime, independent Review, remote Delivery, deployment, or Production.

## Stop states

- `basis-conflict`: basis, guidance, Task, or native authority changed.
- `scope-ambiguous`: the requested modification escapes Task or effective scope.
- `capability-unavailable` or `capability-ambiguous`: no unique compatible implementation owner remains.
- `confirmation-required`: a new product, source, external, runtime, or irreversible action exceeds existing authorization.
- `evidence-incomplete`: execution occurred but required command/result/package proof is missing.
- `result-invalid`: returned result conflicts with Task basis, scope, outputs, or terminal contract.

## Resume and invalidation

A `running` Stage resumes the same immutable Attempt and reconciles interrupted side effects before creating another Attempt. Task/basis drift, unowned source changes, generated-source owner changes, or Result Package changes invalidate Implementation and all downstream verification/review/delivery results.

## Brownfield behavior

Modify the smallest existing owner and reuse current modules, interfaces, migrations, components, tests, and commands. Do not rebuild project structure, duplicate native contracts, or add a Forgeway-specific source layer. Treat undocumented current behavior as implementation fact; do not silently promote it to desired Product behavior.

## Validation

- Run the Task's exact native syntax/type/test/build commands.
- Verify generated-source drift through its producer.
- Check Result Package identity and scope before handoff.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.
