# Delivery Graph v2 core

`index.mjs` is the root JS API for the bounded Delivery Graph core. It uses
Node 24's built-in `node:sqlite`; it has no package dependency and does not
modify Git state.

```js
import { buildPackageManifest, createDeliveryStore } from "./tooling/delivery/index.mjs";

const store = createDeliveryStore();
const input = store.createPackage(buildPackageManifest({ root: process.cwd() }));
const policy = store.registerGatePolicy({
  schema_version: "1.0",
  policy_id: "delivery-v2",
  version: 1,
  failure_behavior: {
    missing: "not-verified",
    negative: "unsatisfied",
    stale: "stale"
  },
  predicates: {
    "locally-verified": {
      applicable: true,
      missing_state: "not-verified",
      negative_state: "unsatisfied",
      stale_state: "stale",
      mode: "all",
      requirements: [{
        id: "tests",
        kind: "command-execution",
        environments: ["local"],
        outcomes: ["satisfied", "pass"],
        min_count: 1,
        package_binding: "result"
      }]
    }
  }
});
const run = store.createRun({
  input_basis_package_id: input.package_id,
  capability_id: "implementation",
  policy_ref: { policy_id: policy.policy_id, version: policy.version },
  initiator: { id: "example", kind: "host" }
});
```

`buildPackageManifest({ include: [...] })` accepts exact repository-relative files
when an authorized Run must bind ignored task evidence such as a candidate spec,
complete prompt, or operation ledger. Included files become ordinary hashed package
entries. Intermediate directories must resolve inside the package root; a final
symlink is represented by its link text rather than dereferenced target bytes.
The producer must also declare them in Run scope; Forgeway does not search
ignored directories or infer additional evidence files.

For bounded raw-byte capture through the existing CLI, use
`node tooling/forgeway.mjs delivery package --root <checkout> --read-only`.
The flag may appear once without a value and selects the same SDK `read_only: true` path: no checkout
clean/process filters, diff drivers or fsmonitor hooks, with the existing
2,048-path / 32 MiB bounds and unsupported-state refusals unchanged. Omit the
flag to retain the default Git-aware capture; `--read-only false` and
`--read-only=false` are invalid rather than silently selecting the default.
It is scoped to `delivery package`; other commands reject it before dispatch
rather than silently treating the request as their normal operation.
`--include` retains its exact-path meaning, not a scope filter. Output remains
the existing PackageManifest; `--output` still explicitly writes that output,
so keep it outside the captured input. Capture is neither an atomic checkout
freeze nor execution authorization, and separate repositories still require
separate manifests and host-verified command/input binding.

Runs, attempts, observations, policies and receipts are append-only. A retry
creates another Attempt and a new result package; observations bound to an old
result package are projected as `stale`. Gate projection reads only policy data
and eligible typed observations, never a report or Markdown view. Package
identity is derived from repository/basis/files; `created_at` is optional
metadata and is not part of that identity. Event `occurred_at` belongs to the
immutable event envelope.

Live creation and event import enforce the same Attempt invariants: a result
package must belong to the Run input repository and every result path must remain
inside Run scope. Import cannot bypass these checks to manufacture a satisfiable
cross-repository or out-of-scope gate state.

Observations require producer capability attribution, collector/version,
permission evidence and a per-kind payload. The delivery validator computes
`validation.eligible` and its package aggregate hash; callers cannot provide a
gate token. Receipt observations are emitted only by `createReceipt`, and a
confirmed readback must include the target identity, result package ID and (for
`git-remote`) a 40-character commit SHA.

The shared Observation validator applies the existing schema's optional `claim_refs`
contract on both recording and event import: an array of unique non-empty strings,
not substring-searchable text. Empty arrays, Unicode and non-empty whitespace strings
remain valid; no new claim namespace or trimming policy is imposed. The record API's
existing null/omitted default remains `[]`; raw imported null is invalid, while an
omitted persisted field remains allowed. Invalid values cannot persist entities/events;
failed imports retain the existing all-or-nothing transaction behavior. Claim-specific
gates treat omitted refs as no matching claims rather than throwing or inventing
claims; projection does not fill or mutate the imported record.

When an Observation supplies `artifact_hash`, the ContextProjection consumer closes
that hash to a file in the Observation's exact Result Package. This binding does not
promote exploration evidence into approval, implementation, or browser acceptance;
each claim remains an independent policy predicate.

When two predicates consume the same observation kind, give their policy
requirements distinct `claim_refs` and require observations to carry the matching
refs. This prevents a generic successful command from satisfying implementation,
local verification, or another semantically different gate merely because its kind
and environment match. Claim refs select eligible evidence; they never authorize it.

## Adopt a bounded native task through the existing SDK

The maintained composition example uses the existing SDK and the fixture host's
native process tool. The maintainer test fixture is outside this runtime package. Its task acceptance, identities and authorizer are **SYNTHETIC ONLY**,
not a production authority implementation. One deliberately failing local
command really runs; the fixture's success means its negative evidence was
classified correctly, not that the demonstrated command passed.

For an ordinary bounded task that the native host has already accepted:

1. Keep the native task reference in `Run.input_refs`, with the exact approved
   source paths in `Run.scope`. An opaque task reference is not a formal
   `contracts/task.schema.json` Task v1, a Requirement, or native permission.
   Do not invent a Requirement or Stage merely to run this SDK composition.
2. Freeze the actual checkout with `buildPackageManifest({ root, read_only: true })`
   and `store.createPackage`. Preserve the repository/basis, file hashes and
   aggregate identity. This option captures raw bytes; it does not sandbox or
   authorize a command. The host must separately constrain the command and
   independently recheck the package after execution.
3. Register the bounded policy and `createRun`, then persist
   `createAttempt({ run_id, status: "started", action: { command } })` **before**
   the host executes its already-authorized native command. Forgeway does not
   acquire tool permission, run a model, install a hook, or schedule that action.
4. The trusted host binds the actual argv, cwd, execution identity, terminal
   status and captured stdout/stderr to that task/Run/Attempt and frozen package.
   Re-read and hash external logs independently before admitting evidence.
   Resolve log references only within the host's bound evidence location, never
   from arbitrary caller paths. Permission fields, claim refs and hashes supplied
   by the caller are not authorization or proof of execution.
5. After a known terminal exit and verified unchanged input, append a terminal
   Attempt with `result_package_id: input.package_id` and
   `events: [{ continues_attempt_id: started.attempt_id }]`, following the existing
   [maintenance coordinator](../maintenance/coordinator.mjs). These two immutable
   records describe one execution, not two tool calls or a retry. Record the
   host-qualified `command-execution` Observation against the terminal Attempt.
   Do not update the started record or invent a successful Attempt to select a gate.
6. Close the writer. Reopen with
   `createDeliveryStore({ filename, readOnly: true, copySnapshot: true })`, verify
   `read_snapshot_sha256` and stored identities, then call `getObservation` and
   `projectPredicates`. The explicit copy is a bounded read operation on a closed
   SQLite source, not a second ledger or permission to repair a live database.

For this read-only baseline, the policy's command requirement uses
`package_binding: "input"` and a task-specific `claim_refs` value. An eligible
nonzero exit projects **unsatisfied**, even though failed Attempts do not replace
the latest successful result package. Unknown exit, spawn failure, interruption,
incomplete logs or unverifiable binding must remain **not-verified**: do not
invent an integer exit code, coerce unknown to failure, or record an eligible
command Observation. The example leaves the unknown Attempt started with no
command Observation; the existing host must reconcile it before any separately
authorized retry.

The example's `stdout_ref`/`stdout_sha256` and `stderr_ref`/`stderr_sha256` are
host-owned fields inside the existing open command payload, not a new Forgeway
schema. Their external bytes are not automatically read or validated by the SDK.
Do not set top-level `artifact_hash` for an external log absent from the exact
source package. Production `authorizeObservation` must verify the real host's
current authority (including cancellation/revocation) and exact binding, not
return a constant grant or reuse synthetic fixture
identities. Reopening checks persistence; it does not reauthorize or independently
recapture the original execution.

No Receipt is created, no Stage is completed, and no delivery or production
acceptance is claimed. This example complements the existing payload/authorization
matrix in `test-core.mjs` and snapshot admission/race cases in
`test-read-snapshot.mjs`; it does not duplicate those matrices.

## External typed-artifact input port

`typed-artifact-input.mjs` consumes externally owned typed artifacts without
importing their schema. The normative contract is in
[`standards/evidence.md`](../../standards/evidence.md#external-typed-artifact-input-port).
Hosts provide `readArtifact(path)` and `validateExternalArtifact(binding)`, then
use `createTypedArtifactInputAuthorizer({ owned_claim_refs })` and
`typedArtifactInputGatePredicate({ claim_ref })`. `owned_claim_refs` prevents a
claimed port gate from falling through to a generic fallback authorizer. It is
mandatory, non-empty and unique; each accepted Observation carries exactly one
claim ref equal to its signed binding.

## DESIGN.md completeness consumer

`design-completeness.mjs` consumes, without copying token values or producer schemas,
the `ui.contract.specify@1.3.0` completeness JSON when the project adopts the
additional `ui-spec-design-completeness/1` policy, plus explicit package-relative
paths for DESIGN.md, selected-source evidence and the local approval record. The caller
must provide `readArtifact(path)` and `authorizeApproval(binding)` adapters; no repository
search or browser fallback occurs. An existing store may also pass `fallbackAuthorizer`
for Observations without the DESIGN completeness claim; malformed Observations that do
claim DESIGN completeness always fail closed. The trusted adapter must return a receipt bound to the
exact design SHA-256, Result Package ID and approval-record SHA-256.
It also receives the three raw approval actor IDs and must return distinct canonical
`approved_by_principal_id`, `proposer_principal_id` and `implementer_principal_id`
values. Forgeway treats those host identities as opaque; it does not approximate the
producer's Unicode casefold rules or trust caller-created actor strings.

Project-native shared UI guidance alone does not activate this consumer or require
Google DESIGN.md adoption. The owning project policy selects applicability; preserve
its existing approval requirements. This consumer remains strict for an explicitly
selected completeness claim, including its trusted approval and artifact closure.

Use `designCompletenessGatePredicate()` in the adopted owning policy and record an
`artifact-validation` Observation with claim ref `gate:ui-design-complete`. Missing
adapters, format-only success, `ready-for-human-approval`, local-only approval,
package/hash/byte-metadata mismatch and stale results remain ineligible or stale, so they cannot
satisfy the projected Gate.

## Protocol contract gate projection

`protocol-contracts.mjs` projects protocol-design and implementation evidence into
independent fail-closed predicates. Call
`protocolContractGatePredicates({ authorityStrategy, phase, hasGeneratedDerivatives })`
with the target
project's selected `code-first|contract-first` authority and `design|implementation`
phase. Both fields are mandatory whenever the gate is applicable. Contract-first
design does not require source conformance; implementation does. Code-first and a
contract-first chain with declared generated derivatives require deterministic
generation. The projection consumes only typed
Observations bound to the Result Package and never parses or owns a target project's
OpenAPI, Controller, DTO, security, or business rules.

## Bounded Codex PostToolUse observation adapter

`codex-post-tool-use.mjs` consumes the native `PostToolUse` command-hook input
reviewed at Codex 0.163.0 (`83086188ae0614bd882818ff1aa23f3194962012`) and
0.165.0 (`360319d8dee62d87e2d59fc0c21805d79519cfed`). Their generated command-input
schemas are identical; the exported `CODEX_POST_TOOL_USE_SOURCE` retains the
original pin. This is bounded source compatibility, not runtime version detection
or support for unreviewed versions. In 0.165.0 an environment-scoped handler can
receive its own `cwd` and a null `transcript_path`; neither path is identity or
authority here, and changed redelivery content still conflicts.
It is **not** a hook registration, generic hooks runtime or production CODE owner.
The normative boundary is [Evidence](../../standards/evidence.md#codex-posttooluse-observation-boundary).

Compose `createCodexPostToolUseIntakeAuthorizer(fallback)` into the existing
DeliveryStore's `authorizeObservation`. It reserves the adapter intake identity
and always denies its gate eligibility, even with a permissive fallback. Existing
receipt authorization remains a separately supplied trusted `authorizeReceipt`.
Call `recordCodexPostToolUse({ store, event, resolveOperation, readTarget, now })`
from the existing serialized, single-writer owner. The two ports are synchronous
CODE functions, never module filenames or fields supplied by the native JSON.
There is no default production implementation of either port.

`resolveOperation({ session_id, turn_id, tool_use_id, tool_name })` must return:

- `binding`: immutable `task_ref`, `run_id`, `attempt_id`, `stage_execution_id`,
  `repository_id`, Run `input_package_id`/`input_aggregate_sha256`,
  `result_package_id`/`result_aggregate_sha256`, `scope`, `producer`, `target`,
  `expected_ref`, and `authorization_ref`. Producer requires capability
  `repository.git.deliver`, its version, actor and the native session ID. Target
  requires `kind=git-remote`, identity and exact `commit_sha`.
- `current`: freshly checked `authorized`, `cancelled`, `failed`,
  `current_attempt_id`, `task_ref`, and `authorization_ref`. These live checks
  are deliberately excluded from the immutable binding fingerprint.

The Task must already be an unambiguous typed Run input reference. The existing
Attempt must be the current successful delivery Attempt for its stage execution,
with an authorized target that already contains the exact identity, `ref` and
`commit_sha`. Missing legacy target fields are a binding Gap, not implicit
permission and not something this adapter patches into an old Attempt.

`readTarget(binding)` independently returns `status`, `identity`, `ref`,
`commit_sha`, `result_package_id` and its actual trusted read-time `observed_at`.
This port requires canonical UTC ISO milliseconds (`YYYY-MM-DDTHH:mm:ss.sssZ`)
with an actual calendar date; numeric/date-only strings, offsets, omitted
milliseconds and dates that normalize to another day are rejected.
Only exact confirmed readback can produce a receipt. The native `tool_response`
is arbitrary JSON, never parsed as command success or readback authority.
`cwd` and `transcript_path` are not read. Decoder bounds are 1 MiB, 20,000 nodes
and depth 32; identity strings must be nonempty.

Intake uses an existing ineligible `runtime-observation`, no exit claims, and a
stable ID/hash. Its first ingestion time persists before readback; interrupted
redelivery reuses it while a new readback has its own actual read time. Completed
redelivery compares the existing Receipt and generated Observation without a new
readback, timestamp or event append. Changed payload/binding, stale/cancelled or
failed work, negative/unknown prior Receipts and authorization revocation fail
closed. A redelivery can reconcile reads, never retry the business operation.

Return values `receipt-recorded`/`receipt-existing` are **not acceptance**:
`authorizes_execution=false` and `reopen_verification_required=true` remain set.
The existing owner must close/reopen the same store, verify the returned Receipt
and Observation via `listReceipts`/`getObservation`, then use `projectPredicates`,
`deliveryClosureFindings` and `projectNextAction` against its actual workflow state.
Missing stage-exit evidence stays missing; this adapter does not complete stages.

Run the deterministic synthetic fixture with
`node fixtures/delivery-v2/test-codex-post-tool-use.mjs`. It supplies test-only
ports; no native hook is configured/emitted, no model or business command runs,
and no actual target is contacted. Live acceptance additionally requires a
separately authorized host registration, authentic emitted event, actual loaded
handler byte hash, trusted owner binding and independent target readback. Native
configuration `currentHash` alone does not hash external handler bytes.

For 0.165.0 registration inspection, use the selected config layers, not plugin
name absence as proof. The upstream config loader resolves user/profile config,
system and enabled project layers; linked worktrees can redirect the hooks folder
to the root checkout. Each distinct folder's `hooks.json` and its layer's TOML
hooks can both contribute. `hooks.state` is a TOML table, not a separate state
file; effective overrides come from User/SessionFlags layers. A bounded metadata
read should inspect only explicit known paths and hook fields, without executing
handler strings or exposing unrelated config. Unexamined scopes stay unknown.

The 0.165.0 `hooks/list` discovery path is not guaranteed side-effect-free:
checking an already-approved plugin can create a missing legacy `.hook-trust`
baseline. Do not use listing to bypass a no-trust-write boundary. This does not
establish that a prior, different `plugin list` command changed trust. Public
`HookMetadata` and `HookRunSummary` expose declaration/status metadata, not an
external handler's loaded-byte SHA; completed notifications are not acceptance.
See the fixed upstream [discovery](https://github.com/openai/codex/blob/360319d8dee62d87e2d59fc0c21805d79519cfed/codex-rs/hooks/src/engine/discovery.rs),
[trust migration](https://github.com/openai/codex/blob/360319d8dee62d87e2d59fc0c21805d79519cfed/codex-rs/hooks/src/engine/plugin_trust.rs)
and [hook status schema](https://github.com/openai/codex/blob/360319d8dee62d87e2d59fc0c21805d79519cfed/codex-rs/app-server-protocol/src/protocol/v2/hook.rs).
