# Bounded maintenance

Owner: Forgeway maintenance coordinator. This standard implements the bounded
parts of [REQ-006](../product/features/REQ-FORGEWAY-006-maintenance-entry.md).
It does not grant host, repository, installation, or activation permission.

## Evidence and authority

- A request MUST identify its bounded subjects; keywords and names never select
  an owner. The `forgeway-maintenance/2` kinds are only `component` and `configuration`;
  a finite explicit native profile selects the metadata reader. Version 1 requests
  MUST fail with a version error rather than guessed category migration.
- Submitted facts are declarations. Only a host-injected collector can establish
  source, installation, dependency, invocation, owner, or loaded observations.
  Each observation MUST identify its collector, evidence reference and scope.
  An observed hash does not authenticate a source. No loaded observation means
  `Not verified`, even when installed bytes match.
- Related owners are diagnosed together but receive separate existing Tasks,
  Runs and Result Packages. Cross-owner sequencing MUST use explicit dependency
  results; a consumer cannot weaken the producer's contract.
- A plan is a disposable projection of an existing Task and fixed diagnosis,
  not a task ledger or authority. All before hashes, source identity, selected
  owner, guidance, relevant configuration and allowed effects MUST be rebound
  immediately before mutation. Unrelated user changes remain untouched.
- Effective authority is the intersection of the current user request, trusted
  host policy and the selected owner's capability. Repository JSON, config,
  `granted` flags and static adapter manifests MUST NOT authorize execution.
  Only process-injected host functions may acquire a single-writer lease,
  authorize an exact binding, execute it, or observe the result.
- Source writes, installation, dependency refresh, wrapper publication,
  configuration writes, activation, Git delivery and publication are separate
  effects. Missing or ambiguous owners fail closed. No fallback writer is chosen.

The existing native installer CLI is a separate explicit user/host command, not
an executable SDK plan. Its bounded Git-sync update may reuse the install
transaction only within the caller's existing source/target authority and
confirmed consumer window. CLI arguments/config cannot manufacture authorization
or a lease. It MUST preserve dirty/divergent source, retain verified backups,
pass the actual running root, and distinguish updater-code identity, synchronized
source, installed bytes and host loading. It MUST NOT turn ordinary updates into
dependency refresh, branch cleanup, publication or native activation.

### Select the effect and its consumer window

Existing explicit authorization remains applicable to the same target, scope and
effects under the current host policy; do not ask for it again solely because a
repeat update uses another command. Recheck the binding and current restrictions.
An expanded scope, revoked permission, pending platform approval or denied action
still stops that affected action; neither a prior success nor this workflow
overrides it.

- **Git synchronization** changes the selected source checkout only. Use its
  existing native owner, preserve local changes and unique commits, and read back
  the resulting ref/content. A Git-only request MUST NOT be routed to the
  installer's combined `--sync` operation or depend on an installation consumer
  window. Git synchronization proves neither installed nor loaded identity.
  A checkout that is also the installed/running target is not source-only;
  classify its actual effects before choosing this route.
- **Installed-file update** uses the selected component's original installer and
  current source/target binding. The host owns a window scoped to the affected
  installation and its consumers: use the actual owner/session state or native
  component coordination available for that target, with no conflicting writer
  or active consumer that would make in-place replacement unsafe. Unrelated
  processes need not stop. A whole-machine process/open-file scan is neither a
  mandatory universal precondition nor sufficient proof of a safe window. Missing
  or ambiguous target-consumer evidence MUST NOT be treated as an empty result;
  keep that installation pending or prepare the existing separate candidate,
  without hot replacement. Do not weaken the installer's running-root, drift,
  dependency, backup or journal checks.
- **Activation and loaded verification** remain host-owned, separately bounded
  effects. Preparing or updating files does not require fabricating an activation
  bridge, but cannot establish a newly loaded session. When activation is required,
  retain the existing host fence/compare-and-switch requirements; otherwise report
  loaded and behavior as Not verified without repeating a successful file update.

## Maintenance placement

Forgeway's CLI retains its deterministic contract validators and evidence consumers.
Reusable methods belong to the canonical Skills owner; project-specific rules remain
in their target project's authorities. Private user configuration supplies location
and preference hints only, never authorization or accepted learning rules.
The distribution collector remains Forgeway-only. Explicit registered metadata
profiles additionally read canonical Registry v3, selected Skill frontmatter, native
Node CLI package/entry metadata, MV3 manifest/entry metadata and maintenance config.
Profiles MUST NOT execute scripts/bin, scan home or credentials, import target code,
or treat a self-owned declaration as source authentication. Unsupported native-host
readers remain unknown and third-party references remain outside managed units.
Ownership still follows the
[authority model](../handbook/authority-model.md), not executable names or locations.

The existing read-only `maintenance plan` MAY also project an existing Task for
one explicitly registered `skills-package`, declared self-owned or adopted. This
advances U1's metadata-only boundary only to `proposed-host-handoff`, always with
`authorizes_execution=false`; it does not enable the executable SDK profile.
Select the package root with `metadata_path: SKILL.md`, not its whole registry.
Reuse the Task and read-only Package builder to bind actual Git HEAD, repository
identity, package-relative scope and existing before hashes. Reject unobserved
include paths, private exclusions needing host collection, and metadata drift.
Legacy Task repository locators remain unverified. For a component-scoped Task
1.1, the read-only plan requires an explicit valid Project 1.1, binding its hash,
named repository mapping and the Task/Project commits to the observed Package.
Reuse the Context mapping; do not equate a named Project ID with a Package ID.
This 1.1 route accepts only a Package at repository root and referenced components
whose path is exactly `.`. Preserve Task paths; do not add or strip component
prefixes. Missing, ambiguous, cross-repository or non-root coordinates MUST stop
with their specific reason. Nested coordinates require a separately accepted
path contract and affected-consumer validation; they are not inferred from names.
This projection authenticates neither Project acceptance nor source/writer and
does not enable the executable SDK's Task 1.1 mapping. Task 1.0 stays unchanged.
Explicit Project/Task 1.2 follows the
[repository-coordinate contract](tasks-and-implementation.md#project-and-task-12-coordinates).
Its read-only handoff accepts one component whose path exactly equals the observed
Package `basis.source_root`. Scope, expected output paths and validation cwd are
projected to package coordinates; original Task/Project hashes stay bound and
argv is unchanged. This does not enable the executable SDK profile or nested
Context Run/Result projection. Old 1.1 nested input still stops without reinterpretation.
Dirty bytes stay visible in the Package; neither the source hint nor declared Task
owner authenticates the source/writer. Preserve unknown installed/loaded state.
The native owner must rebind source, scope, guidance and current authority before
continuing; other profiles, installation and activation remain outside this route.

## Configuration lifecycle

`forgeway-maintenance-config/1` is owned by the user, produced by the explicit
host-authorized configuration API and consumed by doctor. `validateUserConfig`
is its validator. It stores only source locator hints, host/channel hints,
language and exclusions, plus optional reader profile, relative metadata path and
self-owned/adopted/external declaration; hints never establish trust or permission. There are
no defaults that silently migrate a file. A missing file is valid zero-config
operation. Invalid versions/fields fail without echoing their values. Changes
require an exact prior digest, invalidate affected plans, and are never repaired
automatically. Deletion through the same authorized API retires the file.
The host chooses a private user configuration path outside source/distribution;
the portable CLI does not discover a home directory or write config implicitly.

## Maintenance coverage and learning

The maintenance coordinator MUST cover Forgeway-owned configuration contracts,
Skill entry and distribution, bundled CLI and validators, standards and normative
documentation, workflows, browser Mock and proxy, test fixtures and evaluation
routes as distinct affected surfaces. For a reported failure or proposed improvement,
trace the actual entry, consumer, owner and affected contracts before choosing one
bounded source change. Update the owning standard, workflow, Skill entry, CLI,
fixture and validator together only where their current behavior changes; do not
copy an external owner's implementation into Forgeway. Source, installed and loaded
identities, runtime behavior and target-project acceptance remain separate claims.

Use existing Run/Attempt/Observation and accepted feedback to review actual usage:
selection, stop/failure causes, retries, time, evidence gaps and user-visible outcome.
Only host-trusted telemetry with a fixed window, source and coverage may establish a
usage rate or an improvement. Missing telemetry remains `Not verified`; a local test,
install count, catalog entry or agent self-report cannot stand in for real use. Group
repeated evidence-backed defects by owning contract and acceptance item, prioritize
user impact, make one bounded change, then compare the same observable outcome after
adoption. Do not create a second usage ledger or optimize from anecdote alone.

The host MAY schedule a read-only version review, weekly by default when the user
requests recurring checks. For each explicitly registered local Skill, compare the
canonical Registry capability contract, source package revision/content, installed
package bytes and host-loaded identity only where independent evidence exists;
check dependent CLI, adapter and Forgeway consumer compatibility separately. Report
new versions, drift, incompatible contracts, stale or missing observations by exact
surface. A matching filename, frontmatter, install receipt or package version alone
does not prove loading or behavior. The portable CLI MUST NOT scan a home directory,
install, update, activate or modify configuration because a timer fired. The host
owns schedule, source selection, notification policy and any separately authorized
repair; unresolved identities remain `Not verified`.

### Independent post-task feedback

Feedback maintenance is an explicit independent task after completion or a stable
checkpoint. Read only existing normal execution records and accepted feedback; do
not add in-task telemetry, synchronous analysis, mandatory hooks, hot version swaps
or a standing queue/timer. Running or unstable records cannot support effect claims.
Keep maintenance context, resources and writer ownership separate. A maintenance
failure neither blocks unrelated delivery nor rewrites valid business results or
hides real business failures. Installation/activation remain separate authorization;
failed upgrades or missing loaded/behavior readback stay Not verified. A trusted
read-only usage aggregation consumer is still required; declared trust/collector
names or model reports alone do not provide one.

### Instruction effectiveness comparisons

For an authorized AGENTS, Skill or prompt comparison, bind the exact original task,
source snapshot, effective model/runtime, tools, permissions and applicable external
guidance. Isolate the intended semantic change; preserve unrelated routing and owner
constraints. A paragraph edited in one file can still change several independent
requirements. Compare task quality against acceptance taken from the original task,
not from either candidate's output, and disclose whether scoring was independent.

Keep task outcome, observed behavior, tool calls, raw usage, wall time and verified
charges separate. Record execution order, repetitions, cache/warmup observations and
other changing conditions; retain failed samples and the limits of unmatched fields.
A single sequential pair or a confounded comparison is exploratory evidence, not a
general efficiency or cost claim. Reuse existing evaluation and Observation contracts;
do not create another ledger or alter an oracle to approve a candidate.

### Named instruction workflow modes

The [instruction workflow](../workflows/instruction-optimization.md) defaults to
analysis without source edits or trial execution. Compare mode requires the original
accepted quality oracle, a bounded predeclared trial policy and actual host execution
with equivalent inputs. Mutating task trials require scoped side-effect authority and
isolation. Preserve failed samples; stop at budget limits and reconcile uncertain
submissions before resuming. Use independent, condition-blind quality assessment
before exposing efficiency results. A quality failure rejects the candidate regardless
of speed; insufficient comparable evidence stays inconclusive.

Apply mode binds an accepted exact candidate and quality evidence, rechecks current
source bytes and authority, then writes only the approved semantic diff. Analyze,
compare and apply are distinct outcomes; none grants installation or Git delivery.
Basis/candidate drift invalidates affected evidence. Reuse current Task/Result/
Observation contracts and host capability discovery; missing owners block only their
dependent stage.

## Profile and operation evidence

Each component/profile/operation/host support row MUST derive from a real handler.
Handler availability MUST NOT grant authorization or self-attest fixture/live
qualification. Metadata, source authentication, installation, loaded state and usage
are separate axes; missing telemetry MUST remain unknown. Configuration inspection
MUST NOT require software loaded state; a missing reader MUST NOT become N/A.
Failed sources and declared invalid registry packages MUST remain in coverage.
Skill/CLI surfaces sharing a physical unit may deduplicate that unit, but MUST retain
both surface outcomes and MUST NOT infer semantic ownership from a directory.
Registry identity MUST resolve relative to the catalog directory using the canonical
consumer's package layout, remain stable across validation failures, and distinguish
declared package locations from physically observed package bytes. A validator
closure failure MUST remain invalid even when there are zero package rows.
Metadata readers MUST reject non-regular files before opening, open without blocking
on replacement special files, and recheck opened identity. They MUST bound actual
reads (including overflow probes and finish re-reads), not just initial stat size.

Explicit `requires-compatibility` peer relations replace the old cross-owner label.
Execution planning MUST require the native collector to report `contract.required_peers`
(explicitly empty only when it establishes no peer constraints); absent constraints
are unknown, not an empty set. Known constraints MUST remain required when a
request edge is omitted. A boolean `compatible` label MUST NOT establish compatibility.
The native collector must read compatibility evidence through `collectCompatibility`:
its digest/reference, collector and endpoint scope MUST bind the exact selected
endpoint source identities, revisions and hashes. Missing, stale, mismatched or
incompatible evidence at either endpoint MUST block the plan. A plan MUST retain
these peer/evidence bindings as native host readback preconditions. A configuration object MUST NOT enter component source/install/activate
plans. New metadata profiles MUST NOT silently acquire a generic execution bridge.
Request migration does not rewrite historical hashes, Tasks or evidence events.

## Execution, recovery and evidence

The coordinator MUST reuse Task validation and Delivery Run/Attempt/Observation.
Attempts remain immutable; retries have new identities. An unfinished attempt
must be reconciled before retry, and an uncertain external action MUST NOT be
replayed. Install/dependency/loaded/behavior checks have distinct claim refs;
one exit code cannot satisfy all of them. An executor's success is not an
independent observation. Result Packages must bind the same repository and
Task scope. Installation is not a Delivery Receipt (which covers Git/deployment).

Installation MUST capture a fixed file list, bytes and modes before changes,
reject source drift, recheck target preconditions, preserve unknown files and
modified owned files, and report partial writes on failure. A changed lockfile
requires dependency refresh and independent verification, even if yaml exists.
Successful install state describes target bytes only after verification.
Recovery restores only operation-owned bytes that still match its after-state;
later user edits cause a conflict rather than being overwritten.

Self-update MUST prepare a separate candidate and verify it before a separately
authorized host activation. The running installation is never overwritten.
Candidate failure must leave the old entry executable. No host activation API
means prepared, with loaded and behavior claims still Not verified.

## Delivery boundary

Controlled filesystem/CLI tests are implementation evidence, not live Skill or
Plugin activation. M5 requires two genuinely clean user environments and two
real host capability combinations. Temporary directories, changed mock flags,
or self-declared live provenance do not meet that requirement. Missing real
environments keep M5 pending and prevent an overall live-upgrade pass.

### Feedback consumer boundary

The explicit post-task SDK consumer in `tooling/maintenance/feedback.mjs` reuses this
standard, existing immutable Graph records and the instruction-comparison contract.
Its bounded request and disposable maintenance/2 view are not a new ledger or
UsageReport authority. Trusted host code must qualify completed/stable Run and exact
Observation hashes plus actual source/Task/acceptance bindings; JSON labels cannot
qualify a reader. The currently implemented reader admits only an explicitly copied
fixed Graph snapshot; native production qualification remains Not verified. Consumer
fixture validation is `fixtures/maintenance/test-feedback.mjs`; rerun after source,
acceptance, collector or contract drift, and retire with the existing host maintenance
consumer. This connects evidence to diagnosis only; all existing candidate, independent
comparison and separately authorized adoption/readback gates remain in force.

## Post-task retrospective checkpoint

The independent [post-task workflow](../workflows/post-task-retrospective.md) MUST
reuse the existing Task/Run/Attempt/Observation/Result and to-task authorities. Only
supported host readers or explicitly selected authorized artifacts may supply
content. Metadata-only snapshots, JSON trust labels, a terminal turn, or model
self-reports MUST NOT establish batch completion or full content coverage.

`maintenance-retrospective-checkpoint/1` is derived Result evidence under the
`forgeway-maintenance/2` view, not a task ledger or execution state schema. Owner:
maintenance coordinator. Producer: retrospective helper plus host-qualified private
Result readback. Non-LLM consumer/validator: the next invocation of that helper.
The CODE host verifies original task/ledger/batch/acceptance/basis/scope, native
lineage, immutable anchors and persisted Result hash. Drift of any binding or anchor
invalidates consumption; normal append requires anchor revalidation rather than
whole-Graph hash equality. Retirement: scope ends or a verified successor checkpoint
replaces it; retain historical private Results. Checkpoints are disposable and
rebuildable, never authoritative for business state or authorization.

Each source has its own continuous prefix and native resume semantics. The current
limits constrain source count, record count and selected-content bytes only. Field
whitelists and lexical constraints do not establish a serialized metadata/token byte
budget. Before native adoption, the host MUST prove that budget and over-budget
handling; without that evidence adoption remains Not verified. Cooperative timeout
does not bound synchronous hashing/serialization or preempt host code. Timeout/unread
pages MUST NOT advance coverage. Declared outputs omit bodies, commands, private
paths and private Result text. The host owns private content access and storage.

Only accepted finding_ref + original owner/task/acceptance may reconcile the existing
ledger under separate effective write authority. An inference, repeated title, new
window, report count or successful helper test MUST NOT create another task, change
acceptance or imply improvement. Maintenance failure MUST NOT change business
results. No new collection during business execution, automatic Task creation,
installation, agent invocation, hook or scheduler is introduced.

A partially committed prefix MUST retain its required opaque continuation token
and fixed through cursor with its original source/lineage/anchor; the next reader
validates those together. Completion clears continuation metadata. Missing native
resume metadata MUST NOT be guessed from an anchor. Checkpoint validators MUST
reject undeclared root/binding/source/anchor fields, and output/retention MUST
project the declared fields only, including when a source becomes unsupported.
