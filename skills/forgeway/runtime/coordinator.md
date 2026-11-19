# Forgeway Coordinator Contract

Forgeway is the host Agent's software-delivery coordination layer. Standards own MUST/SHOULD rules, `runtime/stages.json` owns machine Stage order/contracts, workflows sequence them, Delivery Graph records immutable execution/evidence, and target projects own Product, Domain, interface, data, UI, source, test, runtime, and delivery facts.

## Inputs

The host supplies a bounded run envelope:

| Field | Required | Meaning |
| --- | --- | --- |
| `repository` | yes | Target repository path or identity resolved to the effective child Git root |
| `basis` | yes | Commit SHA or explicit current-worktree basis plus a stable fingerprint |
| `goal` | yes | `inspect`, `to-spec`, `implement`, `verify`, `review`, or `deliver` |
| `intent` | yes | One bounded requested outcome within that goal |
| `workflow_state` | when resuming/routing | Current Stage records, result identities, Evidence refs, and active interrupts |
| `include_paths` | before mutation | Exact paths an authorized owner may change |
| `exclude_paths` | before mutation | Paths outside the Run, including unrelated dirty work |
| `authorization` | before each effect | Product, artifact, source, runtime, external, Git, deployment, or Production confirmation applicable to the selected Stage |
| `external_review` | optional | One explicitly selected review capability, fixed package, and authorization |
| `evaluation_id` | optional | Exact evaluation record selected by the request |

An omitted `include_paths` is valid only for read-only work. Do not infer mutation scope from a review, issue, neighboring file, generated projection, or previous run.

## Basis and workflow projection

Before selecting an owner:

1. resolve the effective working directory and nested Git roots;
2. record branch, exact SHA/current-worktree basis, worktree status, and fingerprint;
3. read nearest effective `AGENTS.md` and Forgeway authority/Stage contracts;
4. record target authority owners and pre-existing dirty exclusions;
5. validate `runtime/stages.json` and current workflow state;
6. project the earliest active Change Control interrupt or first missing/running/blocked/stale Stage for the selected goal.

The next-action projection always sets `authorizes_execution=false`. If root, basis, guidance, scope, authority, result identity, or precondition changes, stop or resume from the earliest invalidated Stage. Historical reports and model memory are pointers, not current basis proof.

## Owner resolution

For the selected Stage, derive one semantic request from its entry conditions, accepted inputs, expected exit conditions, maximum effect, confirmation needs, Evidence class, and stop states. Ask the host for live capability metadata and apply `runtime/capability-handoff.md`.

A valid owner must match the Stage responsibility and effective scope. Forgeway does not prescribe a package, model, Provider, CLI, executable, account, version, install path, or fallback. Zero matches returns `capability-unavailable`; unresolved multiple matches returns `capability-ambiguous`.

Each Attempt has one owner. Optional support capabilities listed by the Stage are separate later/earlier Attempts when their responsibility is actually missing; they are not silently composed into one owner or granted each other's effects.

Authority precedence by meaning remains:

1. target Product/Requirement/Domain/native interface/data/UI authorities;
2. fixed target source and executable Evidence;
3. Forgeway Standards, Stage Registry, delivery metadata, and Gate contracts;
4. external review advice as untrusted evidence.

Conflicts become Gap or Change; never add a compatibility layer or duplicate authority to make routing appear complete.

## Confirmation gates

Stop before these boundaries as applicable:

- `product-confirmation-required`;
- `confirmation-required` for selected-source/design/contract-owner decisions;
- `source-mutation-confirmation-required`;
- `delivery-authorization-required`;
- `strategy-unresolved` for applicable Git history/integration choices;
- `environment-blocked` for browser/client/database/provider/deployment/Production access.

No external review, Stage projection, plan, build, test count, or previous Pass waives a gate.

## Resume and Change Control

A `running` Stage resumes its immutable Attempt and reconciles interrupted side effects before a new Attempt is created. A stale completed/skipped Stage invalidates itself and all selected downstream stages in the projection.

When accepted behavior, contract, authority, basis, scope, or required gates change, activate the Change Control interrupt. Bind it to the previous basis, affected Requirement/Stage IDs, revalidation/rollback plan, and new immutable attempts. Preserve historical Evidence and Receipts.

## Result envelope

The canonical result envelope is owned by `runtime/capability-handoff.md`; this coordinator does not define a second shape. Record risks as limitations. Do not rename or omit canonical fields for a specific host. The coordinator additionally records the Stage ID/version and result identity used to update workflow state.

A Stage is completed only when every exit condition is evidenced on the current basis. `pass` is reserved for applicable gates; missing axes remain `Not verified`. Every Skill/capability remains independently usable outside Forgeway.
