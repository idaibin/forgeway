# Forgeway Capability Handoff Contract

Forgeway task dispatch supplies an accepted delivery Artifact and a semantic
capability request to the host. Forgeway defines domain contracts and gates; the
host selects the execution owner, loads applicable Skill instructions, and uses
its native tools. A Skill or Stage is not an agent or process; selecting either
does not create a new agent.

When the host has a global Skill/capability prompt, that native mechanism owns
discovery, progressive instruction loading, and owner selection. Forgeway submits the semantic
capability request and consumes the returned contract/result; it does not bypass the
host by importing a remembered package or treating Registry v3 attribution as an
instruction to load one.

This contract does not define a model router, provider registry, command registry,
queue, retry engine, or multi-agent runtime.

For cross-version correction work, carry both source/destination bases, preserved
target behavior and applicable regression refs under
[cross-version correction transfer](../standards/code-design.md#cross-version-correction-transfer).
Verification consumes the same bindings under
[cross-target evidence](../standards/evidence.md#cross-target-regression-and-artifact-identity);
a source-branch test result cannot approve the destination by itself.

## Machine discovery seam

When the host supplies an explicit Capability Registry v3 path or payload, the
versioned Forgeway CLI may inspect a capability by stable ID and return its package,
accepted/produced schemas, maximum effects, failure codes and evidence requirements.
The inspection result always states `static_manifest_authorizes: false`; selection and
effective permission remain a host operation over `user scope ∩ host scope ∩ capability
maximum`. Forgeway does not vendor or mirror the Skills catalog, assume an install path,
or bind provider/model/CLI identity into portable authority. Missing IDs return
machine-readable `CAPABILITY_MISSING`.

Distribution readback packs Forgeway, installs it into a disposable consumer and invokes
`forgeway capability inspect` against the separately versioned registry. That proves the
cross-repository contract seam, not a live host adapter or permission grant.

For runtime discovery, the host asks each enabled candidate for its runtime-local adapter
manifest (Forgeway exposes `forgeway capability adapter`), combines those manifests in a
run-local file, and resolves the capability by providing the registry, adapters, and identity. Resolution requires an exact capability version
and compatible input/output schemas. Neither the portable Registry nor the adapter manifest
contains or authorizes an executable path: the host owns executable discovery, invocation,
effective scope, and permission. Zero compatible adapters returns
`CAPABILITY_ADAPTER_MISSING`; multiple matches require an explicit host selection.

### Project dependency preflight

Apply [Project Standards and Capability Dependencies](../standards/project-capabilities.md)
to compose shared, project, profile, application and feature rules without copying
Skills. `capability check` batches the existing exact-version resolver over the
host-selected current slice. It requires explicit Registry v3 and adapter snapshots
and at least one required or optional exact-version capability requirement. Explicit
per-capability adapter selection resolves ownership; there is no global implicit
first-match selection, version range or package installation. Concrete arguments
belong to the [CLI usage](../tooling/README.md#capability-dependency-check), not this
portable contract.

The command reads each input once and emits one JSON report to stdout. Exit `0`
means all required metadata contracts have a selected compatible adapter; exit `3`
means required compatibility is blocked, with the complete report still on stdout.
Invalid arguments, malformed contracts and IO errors exit `2` with the normal
`forgeway-cli/1` error envelope on stderr and no partial success report. Optional
availability/selection gaps are warnings; malformed snapshots are never warnings.
Unknown options, duplicate requirements, missing versions and undeclared selections
are rejected. This read-only command emits stdout only and does not write files.

Report status values are `compatible`, `capability-missing`, `version-unsupported`,
`adapter-missing`, `selection-required` and `selection-invalid`. Counts and
`compatibility_satisfied` summarize only the explicitly selected requirements;
`authorizes_execution` is always false. Schema incompatibility produces
`adapter-missing`; incompatible mutation boundaries remain invalid contracts.

| Check report lifecycle | Contract |
| --- | --- |
| Owner | Forgeway capability handoff owner |
| Producer | `forgeway capability check` over host-supplied snapshots and requirements |
| Non-LLM consumer | CLI exit-status integration and `fixtures/capability/test-check.mjs` |
| Version | `forgeway-capability-check/1` |
| Validator | Shared Registry/adapter/resolution validation plus executable CLI result assertions |
| Drift policy | Changed requirements or snapshot bytes require a new check; `registry_sha256` and `adapters_sha256` bind input bytes, not live installation state |
| Retirement rule | Stop emitting v1 only after downstream exit-status integrations and fixtures adopt a successor |

Reports are run-local evidence, not a project dependency lock or a delivery gate.
Actual package revision, installed/enabled state, host guidance loading and execution
permission still require host evidence. A native host without Registry v3 may use
its native discovery contract; this optional CLI seam does not replace it.

| Runtime adapter manifest lifecycle | Contract |
| --- | --- |
| Owner | Forgeway capability handoff owner |
| Producer | Enabled runtime candidate through its native adapter-inspection operation |
| Non-LLM consumers | `forgeway capability resolve` and host capability selection |
| Version | `forgeway-runtime-adapters/1`; each adapter and capability is independently versioned |
| Validator | `capability resolve` structural/schema compatibility checks plus repo-graph CLI fixtures |
| Drift policy | Regenerate from currently enabled runtimes for every host discovery; never reuse it as installed-state proof |
| Retirement rule | Retire only after all host resolvers consume a successor and compatibility fixtures preserve the previous failure behavior |

## Routing inputs

The coordinator derives one routing request from the fixed run envelope and the
first unfinished lifecycle stage:

- fixed repository/component basis and effective guidance;
- accepted input Artifact references and their current states;
- one required semantic capability;
- expected output Artifact kinds and evidence categories;
- read, artifact-write, source-write, external-write, or Git-delivery boundary;
- include/exclude scope and unresolved confirmation gates;
- stop conditions and the result contract.

Validated Requirement and Task records define domain scope and basis, not native
execution permission. User/host approvals, sandbox constraints and tool-specific
authorization remain independently required. Human analysis or implementation-plan
Markdown may explain the records, but cannot replace, silently widen, or conflict
with the Task record.

## Optional reference inputs

Apply [optional Handbook references](../standards/project-capabilities.md#optional-handbook-references)
only after current project authorities establish a concrete reference need. A
metadata hit is not a new execution owner or an accepted artifact. The existing
owner may separately read the selected fixed source; carry its locator/hash,
declared evidence/rights, applicability and unresolved limits in the existing
handoff input references. Misses add no body/Skill/Agent call, and reference content
cannot modify this handoff's authority or active gates.

## Live capability contract

For client task delegation, submission, monitoring and result readback, apply the
default background boundary in the [native-client evidence rules](../standards/evidence.md#native-client-background-evidence),
as for an explicitly requested background client gate.
Carry the accepted foreground/input/session constraints, operation-specific target
and postcondition, qualification authority when applicable, disposable-state ownership,
restoration and stop conditions in the existing Task/handoff. The host resolves an
operation-capable owner from current metadata, including for observation-only work;
its maximum effects never expand this Task's permission. Validate the returned
application result, non-interference coverage, capture and cleanup independently.
For app-owned session APIs, carry current qualification references, exact workspace/
session, allowed tools/paths/effects and their enforcement limits, request/turn
identity, query budget and approval/reconnect policy. Resolve submission or progress
work through the client operation owner within existing authority; delegate target
source changes only within the separately accepted implementation scope. Validate
accepted, running, approval and terminal observations separately, reconcile ambiguous
submissions before retry, and retain user sessions when ending owned transports.
For a headless CLI route, include exact invocation/cwd, configuration-source binding,
direct exit and output locators, requested versus observed permissions and exact-SID
continuation policy. Keep command-specific denylist semantics and measured mode
mismatches in the runtime qualification evidence; do not promote a mode label to an
isolation guarantee.
Keep app-specific routes and measured limitations in runtime evidence, not a second
Forgeway platform adapter catalog or a copied external Skill.

The host may consider a candidate only when its current metadata or owned contract
establishes all fields needed for this run:

| Field | Meaning |
| --- | --- |
| semantic capability | The delivery responsibility it owns, independent of product name |
| accepted inputs | Artifact kinds and readiness states it can consume |
| produced outputs | Artifact kinds, source changes, findings, or evidence it returns |
| mutation boundary | Read-only, artifact, source, external, or Git effect it may perform |
| authorization needs | Product, source, external-send, runtime, or delivery confirmation required before execution |
| evidence class | Source, automated, artifact, runtime, or review evidence it can directly produce |
| terminal contract | Attributable completion, partial, blocked, failure, and cancellation states |

These fields are evaluated at run time and are not copied into a Forgeway catalog.
Capability identity, provider, model, executable, account, session, and transport
belong to host-local evidence when they are relevant to verification.

## Matching algorithm

1. Freeze the current basis, authority owners, scope, accepted Artifacts, and dirty
   exclusions.
2. Select the first lifecycle row whose entry evidence is not satisfied.
3. Derive the required semantic capability, accepted inputs, expected outputs,
   mutation boundary, evidence class, and confirmation gates.
4. Ask the host for currently available capability metadata. Do not infer candidates
   from repository name, language, path, framework, or a previous run.
5. Reject candidates that cannot accept the inputs, exceed the authorized mutation
   boundary, omit a required output/evidence contract, or require an unconfirmed
   external/environment action.
6. Select exactly one remaining semantic owner. If none remains, return
   `capability-unavailable`; if ownership is still ambiguous, return
   `capability-ambiguous` with the missing discriminator.
7. Give that owner the smallest Artifact package. Do not pass unrelated history,
   secrets, raw credentials, or authority to choose a later stage.
8. Validate the returned result against the original basis, scope, output contract,
   evidence rules, and terminal state before routing again.

## Handoff package

A handoff reuses existing Forgeway Artifacts instead of creating a second task truth:

- Requirement IDs and accepted product/contract references;
- applicable [foundation checks](../standards/code-design.md#foundation-checklist),
  native owners, domain triggers, verification commands and contextual/runtime
  evidence boundaries under [rule applicability](../standards/project-capabilities.md#rule-applicability-and-verification);
- applicable [business scenario decisions](../standards/business-scenarios.md#acceptance-and-handoff),
  exceptions, reuse-owner references and the same acceptance IDs, when that slice has them;
- applicable [structural ownership decisions](../standards/code-design.md#structural-ownership-before-implementation),
  affected native paths/consumers, preserved behavior and checks for additions, moves or
  decomposition; keep them in the existing Task/design rather than a new directory ledger;
- validated Task ID, basis, include/exclude scope, dependencies, outputs, commands,
  and stop conditions;
- explicit confirmation and environment gates;
- input Artifact references with owners and current evidence states;
- expected output references and evidence categories;
- concise open decisions, limitations, and risks.

The package may include a bounded human-readable summary composed under
[task handoff wording](../standards/project-collaboration.md#task-handoff-wording).
The receiver must reconcile it with the structured Task and current target
authority before mutation.

## Result package

Every owner returns one attributable result envelope:

```text
status: pass | partial | gap | change-required | <stop-state>
basis: <repository/component SHAs plus worktree state>
owner: <selected semantic capability>
scope: include [...] / exclude [...]
inputs: [<accepted Artifact references>]
outputs: [<produced Artifact/source/finding references>]
evidence: [<Evidence IDs and exact achieved levels>]
decisions: [<confirmed decisions only>]
limitations: [<Not verified boundaries>]
next: <next stage candidate or explicit stop reason>
```

For a run that needs durable operator results, use these existing format profiles:

- `report.md`: human-readable outcome, decisions, limitations, and verdict;
- `evidence.json` or equivalent YAML: one Evidence record, or a run-local index whose
  referenced records each validate against the current Evidence contract;
- `replay.md`: ordered inputs, commands/actions, gates, and observable outcomes needed
  to understand or repeat the run without secrets;
- `forgeway-capability-contract.md` or an equivalent capability snapshot: run-local
  routing evidence showing why the selected capability matched. It is not a portable
  provider registry.

File names are conventional, not new authorities. Evidence IDs and the fixed basis
remain the machine trace; a report or replay cannot upgrade an evidence level.

## Stop states

- `input-not-ready`: an earlier Artifact or product decision is not accepted.
- `basis-conflict`: repository, component, worktree, or authority changed.
- `capability-unavailable`: no current capability satisfies the contract.
- `capability-ambiguous`: multiple candidates remain without an evidence-based owner.
- `confirmation-required`: the next mutation or external action lacks authorization.
- `result-invalid`: the returned basis, scope, outputs, evidence, or terminal state is
  missing or conflicts with the dispatched package.
- `evidence-incomplete`: execution occurred but the required proof does not support the
  claimed result.

None of these states authorizes fallback, retry, provider switching, scope expansion,
or a later-stage owner.

## Single-step consumer

The opt-in [dispatch view](../standards/workflow-stages.md#single-step-dispatch-view)
connects existing next-action, Package refs and canonical capability compatibility.
It is not a capability invocation: live authority, applicable PRD/business/API
acceptance, permissions, actual loaded identity and unknown side effects remain host
checks. Ordinary evidence-grounded technical choices need no repeated confirmation;
unresolved intent, material contract conflicts and indispensable missing conditions
return to the existing Product/API/Domain owner before dependent implementation.
Independent unaffected work may continue. Existing spec-readiness and Change Control
own acceptance and downstream invalidation; this view adds no parallel rule system.

Dispatch never triggers collection, feedback analysis or maintenance. Only normal
execution records already required by the task remain in its original Run/Attempt.
Independent post-task maintenance follows
[coverage and learning](../standards/maintenance.md#maintenance-coverage-and-learning).
No trusted usage aggregation consumer is supplied by dispatch; unknown source
versions, coverage, cost and loaded/effect evidence remain Not verified.

## Promotion boundary

Forgeway currently uses Requirement, Task, Change, Evidence, and result envelopes for
handoff. Add a structured `handoff` Artifact only after the explicit experiment in
`evaluation/experiments/ai-artifact-handoff-v1/` demonstrates a repeated, machine-
consumed field gap that cannot be represented without duplicating an existing owner.
Any promoted format must satisfy the authority model's producer, non-LLM consumer,
validator, version, drift, and retirement requirements.

## Direction evaluation baseline (portable constraints)

Capability-direction evaluations compare the same task on the same fixed basis
across the existing paired-evaluation three-arm protocol: A is the fixed native
executor, B is A plus the fixed Skills Bundle, and C is B plus Forgeway; B and C
must use exactly the same Bundle. The protocol authority is
`evaluation/experiments/skills-forgeway-paired-evaluation-v1/README.md` (pinned
as `ai-handbook@772139f2f7fe45289163765ff1d2418ef967f8ab:experiments/skills-forgeway-paired-evaluation-v1/README.md`),
operationalized by `buildGroupPlans()` and `verifyGroupParity()` in that
experiment's `tooling/contract.mjs`; the A arm is the native counterpart
control. Each evaluation must define, before execution:

- real target-layer behavior that will actually be exercised, per arm;
- executable quality hard gates: failures that no cost saving can compensate;
- quantified manual rework: human time and rework units for the same task, per arm;
- full cost: model input/output/cache usage, tool executions, verification runs,
  failed retries, and human time; unknown prices stay `unknown` and no saving is
  claimed from token or volume deltas alone;
- normal-cache accounting: warmed-path cache behavior recorded separately from
  cold-path evidence;
- recovery semantics for failure, permission refusal, and interruption: resume
  point, preserved evidence, and required re-authorization.

A cache or catalog hit is evidence of availability only. Fixed capability names
and their evaluation order are run-local queue state and never part of this
portable contract. Actual runtime loading requires host loading proof per the
authority model's catalog row; installed copies, caches, or catalog presence are
install comparison, not loading evidence.

## Bounded maintenance

Maintenance follows [the maintenance standard](../standards/maintenance.md).
Diagnosis and config are not authorization. The host supplies the exact owner,
authorization binding, single-writer lease and independent result observations.
Source, install, dependency, loaded and behavior claims remain separate.
Missing native management capability produces a blocked handoff, never an
implicit shell command or a second writer.


## Explicit existing-project reconstruction

An explicitly requested standalone product/API evidence rebuild may select the
existing owners' `product.evidence.reconstruct` or `api.evidence.reconstruct`
capability. These are observed-projection outputs, not substitutes for normal
`product.contract.specify` / `api.contract.specify` acceptance. Resolve their exact
registry/adapter versions and bounded input as usual; missing runtime bindings remain
not-verified. No Stage is added and no automatic reconstruction is triggered by next.
The professional profile owns source evidence, coverage and unresolved semantics;
Forgeway only references its native artifact through the existing typed input/context
ports. A normative wire consumer uses the owner-acceptance adapter; observed candidates
cannot satisfy it or the original spec-readiness gates. User manuals reuse the existing
source-grounded writing owner, not a new documentation agent or second product/API
schema. Source/content/acceptance drift invalidates dependent claims as usual.
