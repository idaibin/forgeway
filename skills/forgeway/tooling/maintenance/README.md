# Maintenance entry

The [standard](../../standards/maintenance.md) owns rules; the
[workflow](../../workflows/maintenance.md) sequences the existing host owner.

## User entry points

- `forgeway maintenance doctor --source-root /explicit/checkout --installed-root /explicit/install`
  reads bounded actual Forgeway distribution files and the selected install ledger.
  Either root can be used alone. Lock inventory and required exact/file specs are
  read back; unsupported dependency ranges/aliases/peer/optional semantics keep the overall dependency
  claim Not verified even when inventory matches. No repo scripts are executed. Source authenticity,
  the actual writer and host loaded-session remain separate unverified claims.
- `forgeway maintenance doctor --config /private/config.json --source-id registered-id`
  explicitly selects a configured `sources.local_path`. Exclusions are honored;
  locator/host/channel hints never authenticate the source or select a writer.
  Without a registered profile this retains the Forgeway distribution reader.
  Explicit metadata profiles below add bounded source readback, not generic
  Skill/CLI/Plugin execution.
- `forgeway maintenance plan --task existing-task.json --source-root /explicit/checkout`
  accepts the existing Task as JSON or YAML (aliases/custom tags rejected), validates actual Git basis and Package Manifest, then returns
  scoped before-hashes, dependencies, validation commands and required owner steps.
  For a component-scoped Task 1.1, supply `--project existing-project.json` (JSON or
  YAML) for the [root-only mapping](../../standards/maintenance.md#maintenance-placement).
  Missing mappings and nested coordinates stop explicitly; a CLI root does not
  invent them. Legacy repository locators remain host-resolution requirements.
  Explicit Project/Task 1.2 can project one matching nested package under the
  [versioned coordinate contract](../../standards/tasks-and-implementation.md#project-and-task-12-coordinates);
  it does not reinterpret existing 1.1 input or enable execution.
  `--config ... --source-id ... --task ...` also previews one registered
  `skills-package` under the [read-only handoff boundary](../../standards/maintenance.md#maintenance-placement).
  Select its package root and `SKILL.md`; this does not enable SDK execution.
  It is a read-only handoff, not the executable SDK plan. The existing Package
  builder reads the selected checkout using raw HEAD/index/blob comparison, without
  Git status/filter execution (converted bytes are conservatively dirty and
  submodule/unmerged state requires a native collector; at most 2048 files/32 MiB); private exclusions require a host-specific
  bounded Package collector instead of silently ignoring them.
- `forgeway maintenance doctor --input bounded-request.json` remains declaration-only
  for explicit component/configuration requests when a native collector is unavailable.
- `forgeway maintenance config-template` emits the optional format to stdout.
  Host-authorized set/delete APIs exist; portable CLI config mutation is not wired.

Doctor/plan emit stdout only. Exit 0 means complete bounded diagnosis, 3 means
unresolved evidence or a proposed host handoff, and 2 means invalid input. No
approval flag, grant file, executable manifest or automatic host management exists.
The built-in local collector is read-only and cannot supply authenticated source
or executable-owner claims. `local_readback` reports actual observations separately
from the compatibility diagnosis's `Declared` source-authenticity status.

For an explicitly approved native update, use the existing installer's
[one-command Git sync and install](../README.md#repeat-a-managed-forgeway-update)
from an independent source checkout. This is not a portable maintenance SDK plan
or a config-supplied grant. Doctor, plan and metadata profiles remain read-only;
there is no new generic execution adapter, queue or automatic activation.

## Periodic version review

A host scheduler may run a weekly read-only review of explicitly selected local
Skills; the portable CLI does not schedule or discover them. Use the registered
source IDs and bounded metadata profiles above, plus the host's separate installed
and loaded observations when available. Compare Registry capability contract,
canonical package revision/content, installed bytes and loaded identity as separate
columns; inspect dependent CLI/adapter/Forgeway consumer compatibility only for
affected contracts. Report drift and missing evidence without installing, updating,
activating, changing config or converting a version difference into an upgrade
approval. Review trusted usage observations on a fixed window before proposing a
bounded iteration. See [maintenance coverage and learning](../../standards/maintenance.md#maintenance-coverage-and-learning).

## Continue in an existing Codex or other native host

Read the returned exact Task, before hashes and validation commands. The current
host resolves/authenticates the source owner, checks the user's actual request
and existing permissions, and performs the approved source task with its own
native edit/test tools. Capture the changed Result and independent behavior using
the existing Delivery/Context APIs. Recollect if basis, scope or ownership changed;
never feed a CLI handoff back as authorization. SDK callers may integrate the
coordinator below with their real host's authority and durable lease ports.

There is no bundled production Codex/Plugin source-writer bridge or native active
installation switch. The workflow is usable for bounded diagnosis and explicit
host continuation; it does not implement universal automatic maintenance.

Request API version `forgeway-maintenance/2` has `problem`, `scope`, `operation`
(`inspect` or `diagnose`) and explicit `subjects` (`id`, `kind`, `profile`, `name`,
optional registered `source_id` and `owner_hint`). Kinds are only `component` and
`configuration`. Native management surfaces are profiles, not additional kinds.
An optional `relations` list contains only `{from,to,type:"requires-compatibility"}`;
both endpoints must have bound current trusted source facts. Native collectors
report `contract.required_peers` (empty only when no constraints are established),
which is required for an executable plan. Missing is unknown. Retain known peers even if the caller omits a
request edge. Boolean-only `compatible` declarations cannot satisfy a constraint.
The optional native `collectCompatibility(edge, basis)` port must actually read
compatibility evidence and return `{status,basis,sha256,evidence_ref,collector,scope}`.
Only status `compatible` qualifies; basis is `{from,to}`, each containing exact
`subject_id,identity,revision,sha256` from the selected current sources. Collector
and scope must match both endpoints; missing, false/unknown, wrong endpoint or
stale evidence blocks planning. Evidence/source bindings are retained in plan
preconditions and require fresh host readback before execution. No bundled generic
metadata reader supplies this port or a compatibility execution grant. The existing
trusted native collector boundary owns evidence authenticity; JSON/config labels
cannot create one. This is not a relation execution language.

Version 1 requests are rejected with `MAINTENANCE_REQUEST_VERSION`; callers must
choose each new semantic kind/profile and rebind all evidence. Old
`cross-owner-contract` entries become explicit peer components plus compatibility
relations. There is no inferred migration from a name or old category. Task,
Package, Run/Attempt/Observation, install ledgers and native protocols keep their
own existing versions. `--source-root` still selects only Forgeway distributions.

## Explicit metadata profiles (U1)

Register private source hints in the existing config v1 using optional `profile`,
relative `metadata_path` and `ownership` (`self-owned`, `adopted`, `external`).
These fields are declarations, not source authentication or a write grant. Doctor
accepts `--config ... --source-id ...`, or v2 `--input ... --config ...` for several
explicit subjects. No home scan, credential lookup or script/bin execution occurs.

| Profile | Reader / metadata input | Boundary |
| --- | --- | --- |
| `forgeway-distribution` | Existing distribution reader; `package.json` | Existing Forgeway-only source/install diagnosis remains available |
| `skills-registry-v3` | Explicit canonical `skills-index.json`; shared capability validator | Retains every declared package, including invalid rows; no second catalog |
| `skills-package` | Explicit `SKILL.md` frontmatter | Package bytes, not automatic host loading; canonical registry paths are navigation references |
| `node-cli-package` | Explicit `package.json` and declared JS entry bytes | Native string/object bin and semver prerelease/build supported; missing version is unknown; no scripts, dependency import or business request |
| `chrome-mv3` | Explicit MV3 `manifest.json` and named JS/HTML entries | No permission grant, browser access, installation or loaded claim |
| `maintenance-config` | Explicit config v1 file | Configuration axes do not require software installation/loading |
| `native-messaging-host`, `native-host-registration` | No bundled metadata reader | Explicit unsupported/unknown, not MCP and not N/A |

The existing self-owned registration-count CLI is a native Node package metadata
consumer example; this profile does not run its roster/report commands or read
its environment files. Third-party references (including the separate example
MCP dependency) are not managed units. An `external` source is retained as an
excluded reference without reading its path. A self-owned/adopted declaration
still does not authenticate that source.

Each observation binds source ID, selected root, metadata file hashes and snapshot;
registry observations also bind catalog bytes. Profiles emit per-component,
operation and host support from actual handlers. Handler availability does not
assert fixture acceptance, live qualification or authorization. Source authenticity,
installed, loaded and usage remain distinct; missing telemetry means unknown.
The two request kinds and explicit operation select applicable axes. Source-only
metadata success cannot establish a native owner or execution readiness.

Subjects/surfaces remain in the denominator. Identical physical maintenance units
shared by a Skill and CLI are counted once in `distinct_component_units`, while
both surface observations remain visible. This physical deduplication is not a
semantic owner claim. Registry row identities use `skills/<name>` relative to the
catalog's directory, matching the canonical consumer, even if the configured root
is its parent. Keys do not change when closure validation fails. `presence:declared`
marks catalog rows; `presence:physically-observed` marks actual selected package
metadata reads. A declared path does not establish package existence or owner
identity. Closure validation failure remains invalid even with no package rows. Failed sources, invalid package rows and unsupported
readers remain visible; an unreadable catalog cannot claim package coverage.

These are disposable diagnosis projections consumed by doctor and its exit status,
not a new persistent inventory, permission database or usage ledger. Bounds are
256 distinct metadata/entry files, 1 MiB accepted content per file and 8 MiB total
actual bytes including overflow probes and finish re-reads. Each read consumes at
most the opened stat size plus one byte, rejecting overflow; budget must have room
for that probe. Pre-open regular-file and post-open device/inode checks, nonblocking
open, and final size/time/name identity checks reject special files and replacement.
Finish re-reads every selected file within the same total budget. Symlinks,
traversal, aliases and drift fail closed. Only declared JS/HTML entry bytes are read; other structurally safe native entry
formats are unsupported, not diagnosed as invalid package metadata.
Generic metadata profiles cannot enter the existing executable Forgeway plan;
configuration objects cannot enter any source/install/activation plan.

Host adapters can call `readUserConfig` and the explicitly authorized
`writeUserConfig` (null value retires a config). Config is optional; doctor
consumes locator/host/channel hints without trusting them. Values are private,
not copied into Task paths or installed distribution. Format ownership,
producer, consumer, validator, version, drift and retirement are specified in
the standard. Diagnoses and plans are disposable projections, not persistent
authorities; reload requires fresh collection. A serialized diagnosis loses
its in-process collected status.
The SDK captures and revalidates the request before asynchronous collection;
later caller edits cannot change its selected subjects, axes, scope or relations.
Each completed collector response is copied before further collection; later edits
cannot remove known peer constraints or change captured metadata. Collector-owned
objects are not frozen, and non-cloneable response data is rejected as invalid.

Run `node --test fixtures/maintenance/*.mjs` for controlled implementation tests.
These are not M5 live-host evidence.

## Trusted execution and candidate preparation

`planMaintenance` consumes an existing valid Task, a collected diagnosis and an
existing Package Manifest. Source repository ID, canonical identity, actual
revision and aggregate digest must agree. Version drift between related source,
installed and loaded instances remains visible and can motivate a repair;
cross-object identity mismatches cannot produce an executable plan.

`executeMaintenance` requires process-injected `readPreconditions`,
`acquireLease`, `authorize`, `completedDependencies`, `execute`, `captureResult`
and `observe` ports. The host must persist its actual exclusive writer lease and
dispatch state, and enforce the lease at the execution boundary. A production
caller must supply a durable DeliveryStore. Scope includes exact paths only.
The immutable started Attempt and terminal continuation Attempt share the Run;
the latter's events refer to the former. `succeeded` describes execution, not
verification. Its stored maintenance conclusion remains Not verified until the
result-bound, authorized Observations are projected. Unknown execution keeps
the host lease and blocks overlapping operations across new execution IDs.
Result Packages must retain the input repository, HEAD and source root. Root
comparison accepts POSIX `.`/separator aliases, not traversal or absolute paths.
Two omitted legacy roots remain compatible without proving a root identity;
omission and an explicit root are not interchangeable. A mismatched result stays
partial and requires reconciliation before any result-bound observation.
`reconcileMaintenanceExecution` only enables replanning after the trusted owner
proves the old writer stopped and the exact input Package is unchanged.

`prepareDistributionCandidate` uses the existing installer for a separate target.
It requires trusted fixed-source proof and separately authorizes installation
and any runtime dependency refresh. It never replaces the running installation.
`activateDistributionCandidate` requires native `activateOnce` and durable
`readActivationState` ports, exact current host binding, a separate activation
grant, and independent loaded/behavior readback. The host's `activateOnce` must
atomically compare the exact before-binding, fence the owner lease and deduplicate
the stable operation ID across restarts. Its committed receipt binds the exact
operation and proves its writer stopped. Unknown submission retains the owner
lease across candidates until `reconcileDistributionActivation` obtains trusted
stopped-writer readback; hosts without
that primitive remain prepared. No production native host bridge is bundled.

## Installation state and recovery

`forgeway-install/2` is produced by `applyInstall`, consumed by `prepareInstall`
and validated while preparing. It retains v1 file hashes; v1 remains readable
and migrates only after a successful explicit installation. New fields record
the fixed source snapshot (locator metadata remains unauthenticated without
host evidence), runtime verification and loaded=not-verified. Drift is checked
against actual files before every write and before success. Runtime lock changes
force `npm ci --omit=dev --ignore-scripts`, followed by independent `npm ls` and exact lock-path/version/resolved/integrity
inventory plus installed package-version readback. A semver-compatible tree alone
is insufficient. Invalidated recovery ledger bytes are journaled before writing,
so interrupted cleanup remains reconcilable.

The private `forgeway-install-journal/1` is installer-owned recovery evidence,
not a Task or permission record. `applyInstall` produces it before file writes;
`reconcileInstall` validates and consumes it using actual before/after bytes and
modes; `recoverInstall` requires a trusted authorization callback for its exact
target, wrapper and journal digest. A live or stale install lock is never
automatically stolen. Recovery first checks all conflicts, then restores only
matching owned after-state. Later user edits stop recovery. A refreshed
node_modules tree is not rolled back: the restored ledger is explicitly
not-verified and must refresh/verify dependencies before future success.
The journal is retired only after success or verified bounded restoration.

## Independent post-task feedback consumer

The SDK exports `createMaintenanceFeedbackReader` and `reviewMaintenanceFeedback`
from `tooling/maintenance/index.mjs`. Invoke them only in a separate explicit
maintenance task after completion or a qualified stable checkpoint. They do not
run from dispatch, hooks or normal tool calls and never change the business source,
Task, Run, observations, installed runtime or loaded version.

The reader requires a real, currently open read-only DeliveryStore created with
explicit `copySnapshot:true`, plus two trusted host CODE ports: `qualifyRun` and
`qualifyObservation`. JSON values, collector names and flags cannot supply those
ports. The private reader brand cannot be reconstructed from JSON. The caller owns
closing the store. No production host qualification bridge or portable feedback CLI
is wired here: actual usage remains Not verified until that host boundary is supplied.

Run qualification binds the hash of `getRun` (including Attempts), one host evidence
reference and completed/stable-checkpoint state. Observation qualification binds the
whole record hash, host evidence reference, actual implementation source id/revision/
content hash, Task/scenario/acceptance/host/model and standalone lane when applicable.
These are transient host port results, not a new persistent UsageReport. A port must
independently verify its source and task-state evidence; rehashing caller JSON is
not qualification. Eligible/collector metadata alone is insufficient. Unknown source
revision is not the producer's capability contract version.

The request contains only bounded explicit `run_ids`, `observation_ids`, UTC window
and optional `timeout_ms`. The view reuses forgeway-maintenance/2 and emits reference/
number metadata only, with authorizes_execution=false, no private payload/commands.
Deduplicate Observation IDs and identical per-Attempt measurement refs; retain retry
Attempt IDs, failures/cancellation/unknown and separate source/acceptance/Task/scenario/
host/model strata. Unknown binding isolates samples rather than mixing them.
Quality requires a qualified review-finding; command exit zero is process evidence.
Optional measurements require host-qualified exact measurement refs and nonnegative
values; costs additionally need a verified charge ref. Missing values stay null,
conflicts invalidate totals, and absent coverage denominator leaves all rates null.
No prices, source versions, loaded state or improvement are inferred.

The consumer reads a private fixed snapshot and owns only its asynchronous deadline;
ports receive AbortSignal and must be bounded/read-only. This is not CPU/process
sandboxing; real resource-impact isolation remains a host qualification dimension.
Timeout/failure returns a maintenance gap without changing accepted business results.
The view proposes diagnosis through the existing owner; it creates no Task, candidate,
installation, activation or external evaluation. Existing maintenance/independent
comparison/acceptance policies still gate those actions.

Run `node --test fixtures/maintenance/test-feedback.mjs`. Fixtures are synthetic
qualification adapters and never evidence of real user usage or production loading.

Feedback output retains whitelisted `qualifications` linking each accepted Run or Observation ref to its exact record hash and host qualification ref. Raw qualification text is not exported; a reference is traceability to host evidence, not source authenticity by itself.

The SDK timeout is cooperative: it aborts asynchronous qualification and prevents later reads, but cannot preempt blocking synchronous host code. Invoke maintenance in an independent task/process with host-owned resource bounds when that isolation is required; this SDK creates no worker, scheduler or queue. Actual business-task CPU/latency interference has not been benchmarked.


## Canonical Codex local-evidence adapter

`createCodexEvidenceFeedbackReader` adapts the canonical clis/codex-evidence 0.4.0
`sessions snapshot` producer, using trusted host-code `captureSnapshot` and
`qualifyNativeBinding` ports plus its independently selected source SHA256. It starts
no process itself and accepts no executable/module path or JSON trust grant. The host
must execute/read the authorized canonical producer and bind the exact existing Run
hash, native session/turn, snapshot hash and Observation hash/Attempt mapping with
qualification refs. Missing/mismatched mappings fail closed; a JSON collector label
or matching hash alone is not authentic source qualification.

This narrow adapter qualifies a stable checkpoint only. It admits one completed or
cancelled local turn terminal record, preserves Graph failure/retry status and requires
exact source/version/session/hash bindings. Requested models are not provider model
identity; session cumulative tokens cannot be attributed to one Attempt. The adapter
therefore keeps model/cost/usage and quality unknown, even if supplied labels claim
otherwise. Actual Skill/CLI source, Task/scenario/acceptance/host refs require the
host's independently qualified existing mapping; missing remains a partial group.
Other trusted evidence can use the existing general feedback reader instead.

Only an explicit independent post-task maintenance call may use this adapter. No
current-session collector, hook, automatic Task, install, upgrade, or hot replacement
is introduced. snapshot/producer/parser/basis drift requires requalification; the
adapter is retired with its producer protocol. Fixtures are synthetic. An actual
canonical CLI-to-reader fixture is verified separately without private sessions;
that validates the connection, not production user usage or provider billing.


The trusted native binding port returns `{run_sha256, qualification_ref, session_id,
turn_id, snapshot_sha256, observations: Map}`. Each observation entry binds its
`observation_sha256`, `attempt_id`, exact `native_turn_id` and `qualification_ref`; existing independently
qualified source/Task/scenario/acceptance/host refs may accompany it. No default
mapping from a shared session to every Attempt is made. `captureSnapshot` resolves
only that selected session/turn using host-authorized input and returns the canonical
CLI `{ok,data}` envelope. The adapter checks the exact collector source/version and
snapshot hash, then retains safe `native-log:<hash>` and collector-source evidence
refs beside the existing qualification refs. A fresh AbortSignal keys each review's
private context so concurrent reviews cannot overwrite each other's binding map.
The caller passes the resulting opaque reader to `reviewMaintenanceFeedback` in its
separate maintenance task. A plain JSON file cannot create either trusted code port.

Native qualification maps are bounded to 512 entries and copied through a field whitelist; extra raw qualification data is not retained. Each Observation must bind the snapshot turn, even when sessions are shared. Interleaved reviews of distinct checkpoint snapshots have isolated contexts and evidence refs; wrong-turn mappings fail closed.


## Independent retrospective read plan

`planMaintenanceRetrospective(request, {qualifyBatch, resolveSourceWindow,
verifyCheckpoint})` limits source count to 8, record count to 256 and selected-content
bytes to 256 KiB, with a cooperative 1–10000 ms wait budget. These are not serialized
metadata/token byte limits. Field whitelists and lexical checks do not establish an
aggregate byte budget. Native adoption requires host evidence of that budget and
its over-budget handling; without it adoption remains Not verified. Cooperative
timeout does not bound synchronous hashing/serialization.
It reads no paths, bodies, private sessions, Graph event streams or CLI modules.
`qualifyBatch` is trusted host CODE and binds the exact original task/ledger/batch,
acceptance, basis, scope, qualification ref, reconciled effects and terminal state.
No automatic production adapter or CLI command is installed.

`resolveSourceWindow(sourceRef, options)` is a trusted native reader CODE port. It
returns explicit source/owner/subject-kind/revision/lineage, after/through cursors,
revalidated base_anchor, continuous records `{record_ref, sha256, cursor, after,
bytes}`, completeness and stable resume token where partial. JSON `trusted` does
not connect it. Unsupported content readers return unsupported; codex-evidence
snapshot remains metadata only. It must detect old-time late records by native
sequence/revision. A record SHA binds its actual bytes at the host boundary; this
helper cannot independently prove that native reader's content or authorization.

`verifyCheckpoint(previousResultRef, {binding,signal})` verifies the existing private
Result/Package and returns its checkpoint, including result_ref/result_sha256. A
new graph snapshot is permitted when the source's previous immutable anchor still
matches. Per-source watermarks never substitute for one another.

`completeMaintenanceRetrospective(plan, {persistedResultRef,verifyResult})` accepts
only this process's actual frozen plan and trusted Result readback matching its
review_key, exact selected `read_set_sha256` and result SHA. It returns the checkpoint for host persistence, writes
nothing and accepts no finding or business result. Cooperative timeout cannot kill
synchronous code. The workflow owns semantic analysis and separately authorized
[to-task reconciliation](../../workflows/post-task-retrospective.md).

Production status: no authenticated terminal-batch content/Result bridge is bundled.
Supported app `read_thread` can return bounded recent turn summaries and pagination,
but its current probe did not establish stable batch/anchor/hash qualifications.
The fixture ports are synthetic; production content coverage, task writes, loading
and post-adoption improvement remain Not verified.

Checkpoint sources retain only `source_ref`, `lineage`, `revision`, exact
`anchor {record_ref,sha256,cursor}`, `resume_token` and `resume_through`. A partial
committed prefix carries the host's opaque token unchanged and its fixed native
through cursor into the next resolver's `previous`; completion clears both. Tokens
are not inferred from timestamps, record IDs or numeric positions. The host must
validate the native token against that exact source/lineage/anchor/range. A changed
unfinished range is stale. Legacy checkpoints without continuation fields are only
usable when the native reader can resume without missing token metadata; never
invent one. Root/binding/source/anchor extra fields are rejected before retention,
and retained source output is independently whitelisted. These private Result
checkpoint fields are not intended for a public report or credential transport.
