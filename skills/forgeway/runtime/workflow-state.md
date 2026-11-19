# Workflow State Snapshot

`forgeway-workflow-state/1` is a run-local host snapshot used by the deterministic Stage selector. It references persistent basis, results, Evidence, and decisions; it is not a Product/Requirement/API/UI/source authority, Delivery Graph replacement, or execution authorization.

## Lifecycle

| Field | Contract |
| --- | --- |
| Owner | host coordinator for one Forgeway Run |
| Producer | host adapter after reading current Run/Attempt/Result/Evidence/Receipt refs |
| Non-LLM consumer | `tooling/workflow-stage.mjs next` |
| Version | `forgeway-workflow-state/1` |
| Validator | `validateWorkflowState` plus `fixtures/workflow-stage/test-core.mjs` |
| Drift policy | recompute whenever basis, Stage registry, result identity, Evidence, decision, interrupt, or goal changes |
| Retirement | after selector and host adapters read a successor and replay tests preserve stop/resume behavior |

## Shape

```json
{
  "schema_version": "forgeway-workflow-state/1",
  "run_id": "run:example",
  "run_input_package_id": "pkg:run-input",
  "goal": "to-spec",
  "basis": {
    "fingerprint": "sha256:<64-lowercase-hex>"
  },
  "stage_states": [
    {
      "stage_id": "project-discovery",
      "status": "completed",
      "contract_version": "1.2.0",
      "basis_fingerprint": "sha256:<64-lowercase-hex>",
      "attempt_ref": "attempt:project-discovery:1",
      "stage_execution_id": "stage-execution:project-discovery",
      "run_input_package_id": "pkg:run-input",
      "stage_input_package_id": "pkg:run-input",
      "stage_result_package_id": "pkg:example-discovery",
      "result_fingerprint": "sha256:<64-lowercase-hex>",
      "evidence_refs": ["obs:example-discovery"]
    },
    {
      "stage_id": "solution-contracts",
      "status": "skipped",
      "applicability": "not-applicable",
      "contract_version": "1.3.0",
      "basis_fingerprint": "sha256:<64-lowercase-hex>",
      "decision_ref": "decision:no-interface-data-change",
      "reason": "The bounded slice changes no wire, persistence, or architecture contract."
    }
  ],
  "interrupt_states": [],
  "invalidation_events": []
}
```

## Stage statuses

- `pending` / `ready`: Stage has not produced a terminal current result.
- `running`: `attempt_ref` must resolve in the persistent Graph to a `started` Attempt owned by this Run and Stage. Supplied execution/input/result identities must match that Attempt. A missing, cross-Run, wrong-Stage or already-terminal Attempt is `state-invalid`; reconcile its attributable outcome before resuming. Do not create a silent parallel Attempt.
- `blocked`: include one Stage-declared `stop_state` and recovery reason.
- `completed`: requires current Stage version plus real Run input, Stage input, Attempt, Result Package and eligible Observation refs. The selector derives exit-condition satisfaction from Observation claim refs; a caller cannot self-declare it.
- `skipped`: conditional Stage only; requires current basis/version, `not-applicable`, decision ref, and reason.
- `stale`: include why the result is invalid; selector returns this Stage and downstream invalidation IDs.

A completed record whose current basis, Run/Attempt/Result lineage, package hash, Observation eligibility, producer capability, Observation/payload validator, actual Result Package and condition-specific assertion/check target, allowed kind/outcome, exit claims, or applicable Receipt no longer match fails closed. `previous-terminal` stages must consume the nearest earlier completed Stage Result Package after skipped conditional stages are removed. Typed `external-source-drift`, `guidance-drift`, `product-authority-drift`, `solution-authority-drift`, `ui-authority-drift`, and `task-drift` events bind different previous/current Package identities, preserve history, and invalidate the earliest owning Stage.

`brownfield_admission` is optional and only valid for a simple Bug. It must reference an eligible Run-local Host Observation bound to the Run input Package, fixed Task, existing failing check, expected behavior, all unchanged Product/API/Data/UI/Architecture authorities, and an `implementation` or `verification` entry Stage. It authorizes no execution; it only prevents already-closed specification lanes from becoming empty ceremony. A Verification admission additionally requires a current completed Implementation Result.

The CLI must open the persistent Delivery Graph with `--delivery-db`; without that store, completed Stage claims are not verifiable. A completed Delivery record must explicitly carry `delivery_outcome=succeeded|failed|blocked|not-executed`; the selector derives `succeeded` or `failed` from exact bound Receipt readback, while `blocked` and `not-executed` cannot be represented as completed.

## Interrupts

An active `change-control` record (`required`, `running`, or `blocked`) preempts linear routing. A completed interrupt must satisfy all interrupt exit conditions; affected Stage records are then stale or absent so normal earliest-stage selection resumes correctly.

Change Control contract 1.3.0 strengthens completed-record admission. Existing active
records route unchanged; old completed records must be revalidated by the original
host owner rather than accepted from `result_ref`/`satisfied_exit_conditions` alone.
The completed record adds `host_verification_ref`, resolving through the same Delivery
Graph to an eligible, satisfied `artifact-validation` Observation. Its producer is the
registry's `forgeway.change-control` host adapter at contract 1.1.0; the referenced
Attempt must be Run-local, succeeded, and have `action.interrupt_id=change-control`.
The Observation must bind that Attempt's exact Result Package in the Run repository
with the validated package hash. Its payload binds:

- `validator_id=forgeway.change-control/1`, `valid=true`, and `artifact_id` equal to the
  opaque `result_ref` (the reference is not reinterpreted as a Package ID);
- `target_ref=workflow:interrupt:change-control`, `basis_package_id` equal to the Run
  input Package, the current `basis_fingerprint`, and `interrupt_contract_version=1.3.0`;
- every `interrupt:change-control:exit:<condition>` in Observation `claim_refs`;
- explicit `invalidated_stage_states`, with unique Stage IDs and exactly one old
  `attempt_ref` or `decision_ref` per item. An empty list is an explicit qualified host
  decision, not a substitute for missing/unknown impact evidence.

Old Attempt refs must resolve to reconciled, Run-local Attempts of their named Stage;
old decision refs apply only to conditional Stages. The listed old Attempt cannot
remain a current `completed`/`running` Stage, and the listed old decision cannot remain
current `skipped`. Stale/absent records may resume; different complete records still
must pass the existing full Stage evidence closure. This prevents reuse of the host's
explicitly invalidated identities, not temporal/causal proof from a new ID, timestamp
or Attempt number. Actual impact completeness and revalidation order remain the
qualified host's responsibility. Do not use persistent `invalidation_events` as a
permanent completed-interrupt certificate or add a new host runtime/trust grant.

## Security and storage

Store snapshots in a verified ignored run-local location such as `.codex/artifacts/<timestamp>-workflow-state.json` unless a named maintained consumer requires another location. Never include secrets, raw credentials, or claim that the snapshot authorizes capability invocation or mutation.

## Recovery readback

The coordinator hands over the existing accepted Task and Requirement references,
include/exclude scope, current repository/content basis, goal and registry identity,
workflow-state path, persistent Delivery Graph location, input/result Package IDs,
Attempt/Observation/Receipt refs, unresolved authorization and environment gates,
and the result envelope defined in [capability-handoff](capability-handoff.md#result-package).
Keep those run-local references in the target project's verified ignored location.

The receiver first checks live authority and basis against the handoff, then runs:

```sh
node tooling/workflow-stage.mjs next --copy-snapshot --state <workflow-state.json> --delivery-db <delivery.sqlite>
```

Read `status`, selected Stage/Attempt, invalidation IDs, findings and
`authorizes_execution=false`. Resolve capability and effective permission separately.
For a terminal Attempt still labeled running, preserve its original evidence and
reconcile the operation's attributable result before creating a new Attempt. Unknown
delivery completion requires exact target-bound Receipt readback; missing evidence is
not a safe-retry decision. A basis change requires owner revalidation before mutation.

`fixtures/workflow-stage/test-core.mjs` closes its writer and invokes fresh CLI
processes against the persisted database. It covers next action, same-Attempt resume,
basis staleness and unavailable capability, then compares all events unchanged.
This is executable process recovery evidence. An actual second AI acceptance remains
a separate target-layer check: give only the fixed handoff to the new context, have it
identify the same next action and missing gates, then compare its output with the
deterministic projection and live target authority. Record its actual identity,
inputs/outputs and effects in the consumer's evidence location.

## Captured native artifact handoff

The native capture host bridge in `tooling/context/native-artifact.mjs` reuses the externally owned typed-artifact input port and the current Package/Run/Attempt/Observation records. The host explicitly selects a Forgeway Run, artifact contract/codec, source identity, scope, permission and capture status. A native session or terminal message is source evidence; it cannot serve as a Forgeway Run ID or independently satisfy business/human-approval gates.

Fixed export reuses Context Projection v1 and Product UI v2. A consumer needs the exact host-verified projection/events/Run/Package/basis attestation. Imported eligible observations still require the existing host trust decision. Missing/changed evidence remains not-verified/stale; readback does not run or resend native work. No new persistent schema or alternate task ledger is introduced.

## CLI v2 snapshot-admission migration

`forgeway-workflow-cli/2` intentionally changes invocation admission for **both**
plain `next` and opt-in dispatch. The earlier invocation without `--copy-snapshot`
now exits 2 with `DELIVERY_READ_ONLY_COPY_REQUIRED` on stderr before reading state
or copying/opening the DB. Add exactly one value-free `--copy-snapshot` to permit
the bounded private copy of a stable completed rollback-journal input; the source
is never opened by SQLite. WAL/live sources need a separately prepared consistent
host snapshot. There is no automatic fallback or implicit copy.

Stage/goal semantics, workflow-state/1 and the plain next-action/1 projection body
remain unchanged after admission; this is not a blanket CLI parity claim. Help has
its own v2 CLI identity. The 31 capability parity cases cover only the separate
capability CLI. Migration fixtures compare both next entry paths and explicitly
reject absent, valued and repeated copy flags without source-byte changes.


### Caller migration and application boundary

For an already completed, fixed rollback-journal snapshot, change the caller explicitly:

```bash
# Direct source invocation; the caller supplies both fixed input paths.
node tooling/workflow-stage.mjs next --copy-snapshot --state <workflow-state.json> --delivery-db <completed-snapshot.sqlite>
# Existing npm script: forward arguments after the npm separator.
npm run workflow:next -- --copy-snapshot --state <workflow-state.json> --delivery-db <completed-snapshot.sqlite>
```

Opt-in dispatch adds `--view dispatch` and the selected Stage's exact capability
snapshots/selection; it does not replace the admission flag or grant execution.
Dispatch is stdout-only and rejects `--output`, including with `--help`. Plain next
retains its existing explicit `--output` behavior. Persisting a projection is not a
new Attempt, Observation, Receipt, or accepted handoff artifact.

`copySnapshot: true` is the corresponding explicit SDK operation. Neither form
upgrades a deployed CLI, installed Skill, loaded session, source revision, or host
binding. The installation owner separately verifies the exact accepted source,
installation bytes, loaded receipt and behavior; source tests alone prove none of
these. Do not silently downgrade to CLI v1, enable a writer, or remove the admission
flag to recover an old caller.

### Failure recovery

| Result | Owner and bounded next step |
| --- | --- |
| `DELIVERY_READ_ONLY_COPY_REQUIRED` (exit 2) | Caller supplies exactly one value-free flag after explicitly choosing to permit the private bounded copy; no automatic retry or implicit copying. |
| `DELIVERY_READ_ONLY_SNAPSHOT_REQUIRED` (exit 2) | Host snapshot owner supplies a separately completed consistent rollback-journal snapshot and matching fixed state/Run/Package basis. Do not delete WAL/SHM/journal, checkpoint a user's live DB, or copy only its main file to bypass this stop. |
| `DELIVERY_READ_ONLY_DRIFT` (exit 2) | Source changed during capture. Stop this projection; source owner stabilizes/re-exports the input, then host rechecks the full fixed basis before a fresh explicit query. Keep the failed evidence. |
| `DELIVERY_READ_ONLY_INPUT`, missing DB, invalid state or malformed metadata | Correct the named path/type/size/schema/basis with its owner; missing/empty DB is never initialized. A missing DB retains the existing exit-3 diagnostic; other input errors retain their reported code/exit. |
| `DELIVERY_READ_ONLY_PLATFORM_UNSUPPORTED` | Current host cannot make the required safe capture. Stop this local path; use an explicitly supported host after a separate handoff, not weaker open flags or permission changes. |
| `state-invalid`, stale/blocked, unresolved applicability/capability, or missing host verification | Follow the returned earliest affected Stage/owner and evidence gaps; a successful query or compatible contract never grants permission to execute or proves readiness/quality. |

An admitted query opens only its private verified copy in SQLite, closes it, and
removes that temporary copy on ordinary completion/error. It does not mutate source
records or perform recovery actions on the input. A process crash can leave only
its owned temporary copy; report its exact ownership before cleanup, never use a
broad deletion or edit the caller's DB. After a corrected snapshot, repeat only the
read-only projection; reconcile any unknown external action separately before an
Attempt can be resumed or retried. Feedback remains an explicit independent task
after completion/stable checkpoint and is never triggered by this migration.


## Synthetic task-loop acceptance boundary

`fixtures/workflow-stage/test-contact-loop.mjs` exercises one disposable contact
search/clear/restore Task through existing Brownfield admission, dispatch, immutable
Attempts, typed-artifact qualification and Delivery predicates. Its four platform
labels and host owner are fixture CODE, not real devices or an HQ bridge. No second
Task ledger, execution service, runtime binding or persistent handoff format is added.

The fixture checks exact Task/Run/input Package/hash/basis reception, re-entry of the
same running Attempt without a second execution, replay deduplication, and an all-of
four-end gate. Every missing end, wrong source contract version, wrong Task, changed
artifact bytes or failed end prevents its mock host from emitting Verification
completion. Accepted evidence advances next to Review; failure preserves an unrelated
Run's evidence and frontier. A changed basis produces stale selection and the fixture
host rejects the old frontier against its current basis.

This does not turn `contract-compatible` into Ready or authorize an executor. The
production host must authenticate the accepted Task and live target basis, intersect
scope/permissions, bind the exact received Package and source/installed/loaded
identity, and reconcile the old writer and attributable terminal result before
recording completion. Immutable `started` Attempts are not silently rewritten by
this fixture: its mock host records a terminal snapshot for the same execution only
after its explicit reconciliation. No generic production settlement/Task-ledger
bridge or real native four-end collector is proved here. A cached view alone cannot
prove that its external target basis is still current.

## Dispatch Task identity projection

The dispatch view projects a unique typed `{ "kind": "task", "id": "..." }`
from the existing Run `input_refs` into `dispatch.input.task_ref`. Repeated copies
of the same ID count as one identity; legacy strings are not interpreted, and no
or multiple distinct typed IDs project `null`. This is an identity reference, not
proof of Task acceptance, Ready, execution permission, or an executor receipt.
The original owner still verifies acceptance, live basis and scope.

Validated Brownfield admission retains its existing Task ref when there are no
typed Task refs. When typed refs exist, every distinct ID must equal the admitted
Task; a conflicting or mixed set returns `input-invalid`.

Only the existing implementation entry condition `task-planning-complete` adds a
missing/ambiguous Task binding check. Discovery/specification do not gain a Task
or Ready prerequisite. Running retains its exact Attempt/input and is reconciled
before any new work; projection creates no Attempt or event. Readiness remains
`not-verified` and `authorizes_execution=false`.
