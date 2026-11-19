# Forgeway Delivery Lifecycle

Forgeway uses one recoverable lifecycle for a new idea, an empty project, an existing repository, or a bounded change. The lifecycle is Stage-based: every Stage has the same entry, owner, effect, procedure, exit, stop, resume, Brownfield, and validation contract.

## Entry directions

```text
New project
  -> bounded intent and empty-state evidence
  -> project-discovery
  -> create only missing accepted target-native authorities

Existing project
  -> fixed repository/component basis
  -> discover and reference native authorities
  -> distinguish implementation facts, Product intent, inference, conflict, and decisions
  -> extend only the smallest missing or stale owner
```

Both directions converge before Spec Readiness, Task Planning, implementation, Verification, Review, and Delivery. Source, tests, screenshots, or passing builds cannot silently become Product intent or delivery proof.

## Lifecycle stages

| Stage | Core result | Mutation ceiling |
| --- | --- | --- |
| `project-discovery` | fixed basis, authority/asset baseline, Gaps, first safe next Stage | read-only |
| `product-requirement` | accepted behavior/Requirement and observable acceptance | owned product artifact |
| `solution-contracts` | applicable native interface/data/architecture refs and decisions | owned contract artifact |
| `ui-specification` | accepted source/UI contract and runtime evidence matrix | owned UI/design artifact |
| `spec-readiness` | derived readiness projection and blockers | read-only |
| `task-planning` | bounded Task slices, dependencies, scope, commands, stop conditions | owned Task artifact |
| `implementation` | authorized source diff and Result Package | Task-owned source |
| `verification` | separate source/automated/artifact/runtime Evidence | authorized runtime operations only |
| `review` | independent fixed-basis findings and verdict | read-only |
| `delivery` | separately authorized Git/deployment actions and Receipts | authorized delivery effects |
| `close` | final Pass/Fail/Blocked/Gap/Change result and recovery refs | read-only |

`solution-contracts` and `ui-specification` are conditional. Skipping requires an explicit current decision; absence of a file or capability is not a valid not-applicable decision.

## Goals

- `inspect` stops after Project Discovery.
- `to-spec` stops after Spec Readiness and never merges Product/UI/native technical owners.
- `implement` stops after an implementation Result Package.
- `verify` stops after required Verification.
- `review` stops after independent Review.
- `deliver` continues through Delivery and Close.

A goal chooses a terminal Stage, not a second workflow.

## Earliest missing Stage

Forgeway evaluates selected stages from the beginning. A Stage is terminal only when its contract version, current basis fingerprint, immutable result fingerprint, Evidence refs, and all exit conditions match. A conditional Stage may also be terminal through a current explicit skip decision.

The first pending, running, blocked, stale, or applicability-unresolved Stage is the only next Stage. A stale Stage invalidates downstream projections. A running Stage resumes its current Attempt. The derived result never authorizes execution.

## Recovery

Each handoff and result must be attributable to persistent refs: repository/component basis, Requirement/Task/Change, PackageManifest, Run, Attempt, Observation/Evidence, Review result, and Receipt as applicable. Recovery does not depend on the same model or conversation.

- basis/guidance/authority drift returns to `project-discovery`;
- Product behavior or acceptance drift returns to `product-requirement` through Change Control;
- contract or selected-source drift returns to its owning specification Stage;
- Task/scope drift returns to `task-planning`;
- source/package drift returns to `implementation`;
- command/environment/policy drift invalidates affected Verification;
- reviewed diff/evidence drift invalidates Review;
- target/authorization/receipt drift invalidates affected Delivery;
- any required invalidation reopens Close.

## Brownfield adoption modes

| Mode | Project mutation | Result |
| --- | --- | --- |
| Inspect | none | authority map, Gaps, earliest next Stage |
| Augment | only accepted native owner or one necessary missing artifact | current project fact is extended without a parallel Forgeway truth |
| Adopt | explicit project decision after repeated real use | maintained manifest, automation, or long-lived Forgeway consumer |

Default is Inspect then Augment. Forgeway does not require `.forgeway/`, a universal Spec, issue tracker, new test framework, CI workflow, or release process.

## Change and completion

Change Control is an interrupt whenever accepted behavior, contract, authority, basis, scope, or gates change. It fixes the previous basis, affected stages, revalidation, rollback, and new immutable attempt identities before normal routing resumes.

Close uses current Gate projections and Receipts. Documents, source, tests, builds, local runtime, remote branches, deployments, and Production are separate facts; none automatically proves another.
