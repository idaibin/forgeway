# Forgeway Workflow Runtime

Forgeway projects one next bounded responsibility from a fixed basis. It does not add a queue, retry service, model router, provider registry, command registry, or multi-agent runtime.

## Authorities

- [`standards/workflow-stages.md`](../standards/workflow-stages.md) owns the uniform Stage Contract rules.
- [`runtime/stages.json`](./stages.json) owns machine Stage IDs, order, goals, applicability, `kernel|host|capability` execution kind, semantic capability resolution, maximum effects, entry/exit conditions, stop states, and invalidation triggers.
- [`runtime/workflow-state.md`](./workflow-state.md) defines the run-local resumable selector input; it references Delivery Graph facts and never replaces them.
- `workflows/*.md` applies Standards for each Stage.
- Delivery Graph owns immutable Run, Attempt, Observation, GateProjection, and Receipt facts.
- Target projects retain Product, Domain, Interface, Data, UI, source, test, runtime, and delivery authority.

The Registry is not a Skill catalog and never identifies a model, Provider, CLI, executable, account, session, or installed package.

## Runtime selection

For one Run, the host supplies a current workflow-state snapshot containing the Run input Package, Stage input/result Packages, Attempts, Evidence refs, typed drift events, and active interrupts. The selector reopens the persistent Delivery Graph and validates every referenced entity. The portable contract names the operations, not a host-specific command-line invocation:

```bash
npm run workflow:validate
npm run workflow:next
```

CLI v2 requires explicit bounded-copy admission for both views; see [migration and failure recovery](./workflow-state.md#cli-v2-snapshot-admission-migration). This queries a derived view; it does not execute a Stage or update an installed host.

The selector performs these steps:

1. Validate Registry lifecycle metadata and exact workflow-document parity.
2. Resolve an active Change Control interrupt before normal stages.
3. Select stages from the beginning through the goal's terminal Stage.
4. Accept `completed` only when exact previous-terminal Package lineage, immutable hash, eligible successful Observation kind/outcome/exit claims, and applicable Receipt-derived Delivery outcome match.
5. Accept `skipped` only for a conditional Stage with a current explicit not-applicable decision and reason.
6. Identify the existing immutable `running` Attempt and return its reference for the host to locate, read back and reconcile the same operation before any separately authorized new submission; resume does not mean resubmit.
7. Return a blocked Stage with its declared stop state, or the first incomplete/stale Stage and downstream invalidation set.
8. Return `goal-complete` only when every selected Stage is current completed or validly skipped.

Every projection sets `authorizes_execution=false`. The host still resolves a live semantic capability and computes `user scope ∩ host scope ∩ capability maximum` before invoking one owner.

Forgeway Task/Run/Attempt identities describe domain scope and delivery evidence,
not native session/turn/tool-call identities. Because Attempts are immutable, one
execution may have separate started and result Attempt records; their count is
not a native tool-call or retry count. Keep the explicit host-operation binding.
Native acceptance, execution/completion and business verification remain distinct.

## Stage sequence

```text
project-discovery
  -> product-requirement
  -> solution-contracts      (conditional)
  -> ui-specification        (conditional)
  -> spec-readiness
  -> task-planning
  -> implementation
  -> verification
  -> review
  -> delivery
  -> close
```

Goal terminal stages:

| Goal | Terminal Stage |
| --- | --- |
| `inspect` | `project-discovery` |
| `to-spec` | `spec-readiness` |
| `implement` | `implementation` |
| `verify` | `verification` |
| `review` | `review` |
| `deliver` | `close` |

A later goal does not force every conditional lane to run; it forces an explicit applicability decision. A known implementation task may reuse current completed earlier stages rather than regenerate them. A host-verified simple Bug with a fixed Task, failing check, expected behavior, basis, and unchanged Product/API/Data/UI/Architecture authorities may instead use Run-local Brownfield admission to enter Implementation or Verification without creating Repo Graph, PRD, UI Spec, or Architecture artifacts.

## Capability handoff

Kernel stages execute deterministic projection and are never routed through Skills. Host stages declare either an implemented/verified binding or an external-required/Not verified dependency, including Change Control; a contract ID alone is not callable evidence. Capability stages match Registry compatibility requirements for capability version, input/output schemas, mutation class, evidence and runtime adapter policy; package, owner, Provider and CLI selection belong to the Host Runtime. Implementation selects one compatible `frontend.source.implement`, `typescript.source.implement`, `java.source.implement`, or `rust.source.implement` implementation from `task.surface`, Review uses `repository.change.review`, and Delivery uses `repository.git.deliver` while deployment and Production readback remain separate external-required/Not verified host adapters.

For the selected Stage, the host derives one request from:

- fixed repository/component basis and effective guidance;
- current accepted input refs and Stage entry conditions;
- one semantic capability responsibility and optional support responsibilities;
- expected exit conditions and Evidence classes;
- maximum effect, exact include/exclude scope, confirmation gates, and stop states.

The host selects exactly one current semantic owner for one Attempt. Zero matches returns `capability-unavailable`; unresolved multiple matches returns `capability-ambiguous`. Handoffs transfer bounded inputs, never another owner's authorization. The returned result must include basis, scope, owner, input/output refs, Evidence, decisions, limitations, and explicit terminal/stop state or it is `result-invalid`.

## Resume and invalidation

Resume uses current Run/Attempt/Result Package/Observation/Receipt identities, not model memory. A basis, guidance, authority, contract, source package, environment, Review basis, delivery target, or Receipt change invalidates the earliest owning Stage according to `runtime/stages.json`; all dependent Stage results become stale in the projection.

An accepted behavior/contract/authority/scope/gate change activates the [`change-control`](../workflows/change-control.md) interrupt before normal routing. Historical attempts and evidence remain immutable.

## Evaluation and safety

An evaluation record is loaded only when the request supplies its exact identifier. Repository name, path, language, or framework never selects an evaluation or capability implicitly. Derived Registry/next-action/Markdown projections cannot authorize source mutation, external send, browser/client operation, Git, deployment, or Production.
