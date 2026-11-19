# 00 Project Discovery and Asset Baseline

## Stage contract

- Stage ID: `project-discovery`
- Contract version: `1.2.0`
- Applicability: `required`
- Semantic owner request: `project.asset.discover`
- Maximum mutation: `artifact-write` for bounded run-local inventory artifacts; target source and external systems remain read-only
- Standard: [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Fix the target repository/component basis and establish the smallest accepted asset baseline before product, design, source, verification, or delivery work. This is the common entry for a new project, an existing repository, or a bounded change in an existing project.

The basis procedure in [`01-fix-basis.md`](./01-fix-basis.md) executes inside this Stage before asset classification. It is not a later second pass.

## Entry contract

Required inputs:

- one bounded goal: `inspect`, `to-spec`, `implement`, `verify`, `review`, or `deliver`;
- a target root, repository identity, empty-project location, or explicit project reference;
- the requested scope and mutation boundary;
- accessible effective guidance and current worktree information.

Stop before discovery when the real root, target identity, or requested scope cannot be resolved without guessing.

## Procedure

1. Execute `01-fix-basis.md`: resolve the deepest applicable Git root, exact commit/worktree basis, effective `AGENTS.md` guidance, branch, remotes, dirty paths, secrets/environment boundaries, and include/exclude scope.
2. Resolve project topology as `monolith`, `monorepo`, or `polyrepo`. Freeze a separate repository basis for every repository and map addressable components without inferring ownership from directory or framework names.
3. Inventory project-native product/feature records, domain facts, interface/IDL/OpenAPI authority, migrations/data declarations, architecture/configuration, `DESIGN.md` or feature UI specs, source, tests/CI, runtime, and delivery authority relevant to the requested goal.
4. For every requested asset, record one disposition: `referenced`, `extended`, `new`, or `not-applicable`; one semantic owner; repository/component; fixed basis; authority state; evidence level; next consumer; and any Gap.
5. Preserve product intent, implementation fact, inference, conflict, and decision-required states separately. Code, tests, screenshots, or generated clients cannot silently become product, interface, or design intent.
6. Resolve conflicts through the native owner. A generated artifact defers to its generation source; an implemented UI does not overwrite accepted design; a stale path is rediscovered from the current root; unresolved duplicate owners remain a Gap.
7. Choose `reference > extend > create`. Create a durable asset only when no usable authority exists and its owner, real consumer, accepted location, scope, and authorization are all known.
8. Persist only accepted target facts in target-native locations. Keep basis snapshots, handoffs, logs, provider/model/session identities, captures, and temporary reports in an ignored run-local location.
9. Return one attributable baseline and the first safe next Stage or an explicit stop state. Independent read-only inventory may run in parallel after basis freeze; ownership reconciliation and the final handoff remain serialized.

## Exit contract

A completed result MUST satisfy:

- `basis-fixed`;
- `guidance-and-dirty-exclusions-recorded`;
- `native-authorities-classified`;
- `gaps-and-first-safe-next-stage-recorded`.

The result includes repository/component bases, authority references, dispositions, owner/evidence states, proposed or accepted outputs, exact scope, decisions, limitations, every `Not verified` axis, and one next-stage candidate. It never authorizes mutation, Git, deployment, or external actions.

## Stop states

- `basis-conflict`: root, SHA/worktree, guidance, or authority changed or conflicts.
- `scope-ambiguous`: target/component/include/exclude boundary cannot be fixed.
- `owner-unresolved`: multiple facts claim one semantic owner without a decision path.
- `capability-unavailable` or `capability-ambiguous`: no unique live discovery owner satisfies the handoff.
- `evidence-incomplete`: a required authority or environment cannot be inspected.
- `result-invalid`: returned basis, scope, references, evidence, or terminal state is incomplete.

No stop state permits fallback to another model/provider, scope expansion, source mutation, or a later Stage.

## Resume and invalidation

Resume only from a baseline whose repository/component basis, guidance, exclusions, registry contract version, result identity, and Evidence still match. A basis, guidance, scope, or native authority-owner change invalidates this Stage and every downstream Stage. Re-run discovery from the changed boundary; do not patch an old map by memory.

## Brownfield behavior

Existing projects are the default case. Use current project conventions and authorities before proposing Forgeway metadata or documentation. An existing file is not automatically authoritative; verify its owner and current basis. A missing file is not automatically required. Backfilled product or domain text derived from implementation remains Draft/Inference until the proper owner accepts it.

For Product UI, classify accepted design source, missing source for a new page, supplied source for a new project, or no usable source. Preserve source identity/hash/revision, rights/use, viewport/state coverage, and extraction limits without performing design work in this Stage.

## Validation

- Registry contract: `node tooling/workflow-stage.mjs validate`
- Focused behavior: `node fixtures/workflow-stage/test-core.mjs`
- Repository checks: `npm test && git diff --check`
