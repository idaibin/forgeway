# 10 Delivery

## Stage contract

- Stage ID: `delivery`
- Contract version: `1.2.0`
- Applicability: `required`
- Execution: capability `repository.git.deliver`; deployment and Production readback are separate conditional host adapters
- Maximum mutation: `delivery-write`
- Standards: [`Evidence and Completion`](../standards/evidence.md), [`Workflow Stage Contract`](../standards/workflow-stages.md)

## Purpose

Execute only separately authorized Git, publication, deployment, or Production-readback actions against the reviewed immutable basis and return receipts. Verification and Review never imply Delivery authorization.

## Entry contract

- current terminal Review result and required passing/accepted gate projection;
- exact delivery basis and target identities;
- a separate authorization for every requested commit, history rewrite, push, branch publication, PR, merge, release, deployment, or Production action;
- history strategy selected by effective project/host guidance or the selected delivery capability's validated default when integration is applicable;
- compatible delivery capability and accessible environment.

## Procedure

1. Reconfirm reviewed basis, branch/protection state, remotes, target environment, dirty exclusions, required gates, and authorization boundaries. Apply [delivery readiness and recovery](../standards/evidence.md#delivery-readiness-and-recovery) to the requested delivery effects, including the native post-release checks and data/configuration recovery boundary when deployment is in scope.
2. Resolve history strategy through effective project/host guidance and the selected delivery capability before Git mutation. A default strategy does not grant integration authority. Stop for a choice when sharing state, policy, conflict or sensitive overlap makes the applicable default unsafe.
3. Execute one authorized action through its semantic owner. Commit, push, PR, merge, release, deployment, and Production readback are separate operations even when one host automates several.
4. Preserve operation identity and reconcile interrupted side effects before retrying. Never duplicate a commit, branch publication, release, or deployment because a prior response was interrupted.
5. Read back the resulting commit/ref/release/deployment/runtime target and compare it to the intended basis and content identity.
6. Produce an immutable Receipt for every completed authorized action; record failures or environment blocks without claiming success.
7. Leave unrequested or unauthorized actions `Not verified`. A remote branch does not imply PR/merge; deployment does not imply Production behavior; local verification does not imply release.
8. Return the delivered basis and receipts to Close. Any mismatch becomes Gap/Change and cannot be hidden by a clean local worktree.

## Exit contract

A completed result MUST satisfy:

- `each-authorized-delivery-action-has-receipt-or-explicit-failure`;
- `remote-or-runtime-readback-recorded-when-required`;
- `unexecuted-actions-remain-not-verified`;
- `delivered-basis-fixed-for-close`.

The completed Stage record must carry an explicit `delivery_outcome`. `succeeded` requires an exact confirmed Receipt; `failed` requires an exact negative Receipt. The selector derives that match from persisted readback. `blocked` and `not-executed` remain non-completed Stage states and cannot bypass Receipt requirements.

## Stop states

- `delivery-authorization-required`: one requested delivery effect lacks explicit authorization.
- `strategy-unresolved`: an applicable history/integration strategy is not selected.
- `basis-conflict`: reviewed basis, branch, remote, package, or target changed.
- `environment-blocked`: credentials, provider, remote, deployment, or Production target is unavailable or unauthorized.
- `capability-unavailable` or `capability-ambiguous`: no unique current delivery owner satisfies the action.
- `evidence-incomplete`: the action may have occurred but readback/receipt proof is insufficient.
- `result-invalid`: receipt or terminal result conflicts with the authorized action and basis.

## Resume and invalidation

Resume by reconciling the original operation identity and remote/runtime readback; do not blindly repeat side effects. Reviewed basis, target, history strategy, authorization, receipt readback, deployment environment, or Production target changes invalidate only the affected delivery action and dependent Close result.

## Brownfield behavior

Respect the repository's existing branch, review, release, deployment, and rollback conventions. Do not introduce PRs, GitHub Actions, release tooling, environments, or a Forgeway branch policy unless the target owner explicitly adopts them. Existing dirty `main` work remains untouched when a reviewed branch is delivered.

## Validation

- Validate commit/ref/readback or deployment/runtime receipt against the intended immutable basis.
- Preserve independent authorization/evidence per delivery action.
- Stage registry and transition checks: `node tooling/workflow-stage.mjs validate`.

### Optional native result observation

An existing trusted host owner may use the bounded
[Codex PostToolUse observation adapter](../tooling/delivery/README.md#bounded-codex-posttooluse-observation-adapter)
under the [Evidence boundary](../standards/evidence.md#codex-posttooluse-observation-boundary).
It observes a previously bound operation and independently reads its exact
already-authorized target; it does not perform delivery or retry it. Hook
completion is not success. Reopen the existing DeliveryStore and retain all
unmet gate/Stage exit conditions before asserting closure. Native registration
and actual loaded-handler evidence remain separate host acceptance requirements.
