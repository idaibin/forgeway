# Evidence and Completion Standard

## 状态

| 状态 | 可证明内容 |
| --- | --- |
| `Declared` | 正式目标或决定存在 |
| `Source-resolved` | 固定 SHA 上的源码和配置链已定位 |
| `Automated` | 指定命令在记录环境执行并得到结果 |
| `Artifact-resolved` | 实际构建或生成物已检查 |
| `Runtime-resolved` | 获准运行路径被执行，并记录身份、环境和结果 |
| `Gap` | 已知不一致或缺失，具有 owner 和关闭条件 |
| `Not verified` | 所需证据缺失或不可访问；含义是未知 |

证据轴独立：Automated 不自动包含 Artifact 或 Runtime。项目 gate 决定每条 Requirement 需要哪些轴。

An absence claim MUST name the searched root, excluded paths, access limits and
actual source or invocation chain. A bounded miss proves only absence within that
scope; an unreadable credential, unavailable host observation or missing telemetry
MUST remain `Not verified`, not a global claim that a component was never configured,
loaded or used. Inspect the named target and its native manifests before proposing
contract or configuration changes based on absence.

Repository-state claims MUST name the observed checkout, branch/revision and boundary:
staged changes, unstaged tracked changes and untracked files remain distinct. A clean
tracked tree or synchronized ref MUST NOT imply another checkout or all local files
are clean. Retained ignored evidence is not a deletion target merely to obtain a
clean-state claim.

For client flows, the coordinator MUST evaluate project navigation, text entry,
submission and capture independently. A capture failure MUST block only claims
that require pixels; independently authorized semantic operations with satisfied
preconditions MUST remain eligible. A selected-project marker proves navigation,
not accepted text or a submitted message. Submission MUST require accepted input
and its own application postcondition. Non-interference and cleanup evidence MUST
remain specific to each operation.

## Cross-target regression and artifact identity

For content fingerprints, declare the included and excluded input classes and bind
application source, test assets and relevant configuration to their respective
results. Task feedback, logs and generated evidence MUST NOT change an application
source fingerprint when they are not execution inputs; do not exclude configuration,
fixtures or other bytes that affect the claim merely because they are ignored or
generated. When a fingerprint implementation is introduced or changed, verify that
changes to relevant inputs alter the appropriate identity and that writing an unrelated
record leaves it stable. A previous fingerprint remains bound to its original scope;
do not rewrite it or infer byte equivalence from a changed digest alone.

When reusing tests across branches or runtimes, record the original test identity,
explicit target/source root, resolved dependencies, adaptation and excluded cases.
Preserve the original behavioral assertions; direct invocation of an old hook proves
only that function, not destination-framework lifecycle dispatch. A known failing
source and corrected source SHOULD be compared under the same applicable oracle.
Separate assertion failures, harness incompatibility and unexecuted cases; keep raw
runner counts and exits alongside the interpretation, without counting failed
assertions as independent defects or omitting lifecycle exclusions.

For a built client, bind source plus relevant uncommitted patches, toolchain,
environment, native configuration, artifact hash and embedded identity before
reusing build or runtime evidence. A filename, version label, old build directory or
special-purpose patched package MUST NOT establish correspondence with the complete
current checkout. Package inspection does not establish which bytes a device loaded;
installation/loading and business behavior retain their separate evidence axes.

Report Mock, real-service and installed-host results against their respective
versions. When the target device still runs an older build, keep the new build’s
device result unverified. For distributed updates, cover eligible, incompatible and
legacy clients under the project’s platform/runtime/base-version rules. Verify the
offered artifact or absence of an offer, then verify rollout inclusion, exclusion
and recovery on the deployed service and the client that actually loaded the result.

## Project test asset ownership

Verification MUST treat the target application's source and runtime configuration as read-only. Test plans,
cases, executable tests, harnesses, synthetic data, fixtures, Mock rules, adapters,
test dependency/configuration files, temporary profiles, logs, recordings and reports
MUST be maintained in a project-adopted test workspace. A separate Git repository is
the default; an explicit project/user decision MAY place the workspace in the same
repository, provided its test assets, dependencies and runtime are isolated from
application source, public resources, ordinary development configuration and release
artifacts. A directory or ignore rule alone does not prove those boundaries. Verify
the selected roots, dependencies, entry points and release boundaries. Business ownership stays
with the target's accepted Product/UI/API authorities; it does not determine storage.

Keep reusable test cases, scripts, fixtures and test configuration in their adopted
test workspace. Default one-off run reports, logs, screenshots, recordings and raw
evidence to a verified ignored `.codex/` location in that workspace, rather than
maintained `docs/`. An explicit user or project requirement for a durable report
may select another authorized location. Do not move or delete historical records
without tracing their consumers and obtaining the applicable authorization.

Bind each test run to the exact target source checkout, source revision,
relevant dirty hashes and test-workspace revision or content identity. Resolve the source path
through an explicit argument or task-local setting; read the real implementation
rather than maintaining a copied production implementation. Keep credentials outside
fixtures and retained evidence. Retain stable case IDs and affected-consumer coverage.

Checks sharing mutable fixture/output directories MUST use supported isolation or
coordinate exclusive use of those paths before running. Do not run competing suites
in the same checkout merely because their callers are separate sessions. Preserve
the first failure and distinguish a shared-fixture race from product assertions;
a serial pass does not prove the runner is safe for concurrent use.

Verification MUST NOT inject test dependencies, fake API implementations, synthetic
records, demonstration notifications, debug controls or Mock middleware into product
source, development configuration, public resources or release artifacts. Select
an authorized external interceptor or isolated test runtime. Missing runtime support
keeps the affected check Not verified; it never authorizes modifying the application
to make a test pass. A user restriction on Mock overrides all Mock fallback guidance.

A stopped interceptor does not prove cleanup. Check for its hooks, saved fake data,
shared or persistent caches and rendered samples; remove only explicitly authorized
synthetic entries and verify the original response and target state. Preserve real
business data, authentication and unrelated settings. Existing asset migration must
trace its consumers and update discovery and external execution together within the
explicitly authorized scope; a test-content prohibition does not authorize silently
deleting an existing suite or skipping its checks.

## Test and review intent

In Forgeway projects the current agent owns execution and result collection. Resolve a compatible verifier or reviewer using the host's available capabilities. Reuse the project's cases, fixtures and runner. Fix the basis to the requested revision or, by default, the current checkout including relevant uncommitted changes. An explicit request for a plan, cases only or review only limits the work accordingly.

| User intent (examples) | Scope and result |
| --- | --- |
| Test current work (测试、测一下、验收一下) | Execute the current task's cases, directly affected paths and necessary failure branches. For user-visible behavior, exercise the relevant user journey. |
| Regression (回归、回归测试) | Include affected consumers, nearby workflows and relevant previous defects. Use the change impact to select existing cases. |
| Full (全量测试、完整测试、全量回归) | Execute the entire existing test plan for the named system, clients and environments within authorization. Reconcile its inventory with passed, failed, blocked and unexecuted cases. If the inventory is incomplete, report what ran and the coverage gap. |
| Boundary (边界测试、异常测试) | Exercise limits and transitions with explicit expected outcomes, e.g. empty/one/full page, just before/at a threshold, duplicate actions, disconnect/reconnect. |
| Failure and race-condition testing (异常与竞态测试) | Combine business actions, timing and recoverable failures to challenge invariants such as single submission, retained input or correct navigation. A separate request concerning access control or security requires its own scope. |
| Expert review (专家审查、代码评审) | Fix the review basis and original requirements. Use an independent reviewer when available and authorized, otherwise identify the result as self-review. Run targeted checks to substantiate findings. Return findings and remaining uncertainty. |

Preserve combinations: “移动端全量回归并做边界测试” selects the complete mobile plan plus relevant boundary cases; “专家审查并全量回归” requests both outputs. A repetition count applies to each specified scenario.

### Optional scope clarification

Ask only when plausible interpretations materially change the work and context does not settle the choice. Ask about the unresolved dimension alone. If the user already said “全量”, keep full depth in every option. For example, if both clients changed and the target of “完整跑一遍” is unclear, offer both affected clients (default), employee only, or mobile only. Show the actual default, its rationale and the 30-second response window before starting it.

Use a host-native choice dialog when available. During the window, prepare only common work such as identifying builds, cases and prerequisites. On reply, apply it once; on timeout, check for a pending answer before selecting the displayed, already-authorized default. Record the selected scope and whether it came from the user or the timeout. A later reply steers remaining work without duplicating completed cases. When the host can continue asynchronously but lacks a dialog, use the same visible choice in chat. On a blocking-only host, offer the choice without promising automatic continuation; if asking is optional and an authorized default is clear, state the assumption and proceed.

Timeout resolves optional scope preferences only. A required decision, missing authority, permission to change production or destructive action remains pending. Reuse the project's evidence policy for simulator, Mock, live gateway and device results. Product defects go to implementation; the verifier reruns the original failing case and affected regression on the corrected basis.

## Functional acceptance inventory

Forgeway owns these common acceptance rules. A testing capability consumes the
applicable workspace standard and owns test design, execution and qualified results;
the target project owns its business oracles, inventories, cases, fixtures, run logs
and evidence index. Existing project case IDs MUST be reused. Execution guidance
MUST NOT create a competing standards or project-results ledger.

Before whole-application acceptance, the verifier MUST freeze a finite inventory of
registered pages and actual entries, business operations, roles/permissions,
interactive controls and options, configuration branches, cache/state, native
capabilities and interface definitions. Interfaces MUST be counted by definitions
and request operations, never by API-file count. Static references, confirmed retired
assets and unresolved assets MUST remain distinct; no static reference found MUST
NOT establish retirement. Dynamic or otherwise unparsed scope MUST be disclosed.

The project MUST preserve stable IDs and trace interface → request wrapper → shared
component/state/cache → page → operation → case, including indirect consumers.
Generated inventories MUST bind source hashes, extraction scope and limitations.
For business-acceptance verdicts, business meanings and expected outcomes MUST
reference accepted Product/UI/native API authorities. For existing-project
regression or exploration, cases MAY instead bind a current-behavior baseline or
provisional inference to the inspected source/interface/page evidence, following
[the existing-project default](ai-e2e.md#existing-project-default). Freeze and label
that basis before execution. A baseline pass proves regression consistency; an
inference pass supports only that hypothesis. Neither establishes business correctness
or approves a business rule. Missing documentation alone MUST NOT block independent
safe checks; unresolved meaning MUST withhold only the dependent business verdict.
Unknown authorization, unsafe effects or denied environments MUST still stop that
operation. Accepted decisions prevail over inference, and contradictions remain
findings rather than automatic rebaselines. A frontend wrapper MUST NOT become the
backend wire authority.

The target project's catalogue check SHOULD validate ID uniqueness, asset/case references,
declared coverage obligations and source/extractor drift. Its result MUST remain
structural evidence, separate from case execution and runtime acceptance.

Every case MUST bind role/project, prerequisite data, ordered actions, expected
request and rendered outcome, necessary independent readback, cleanup and evidence.
Large combinations MUST use a declared role/project/data/configuration/loading/error
and risk matrix rather than claim infinite exhaustiveness. Whole-scope acceptance
MUST reconcile every included page, interface, control and option; opening a page or
clicking once MUST NOT establish its functional acceptance.

Applicable shared-session checks MUST include first login after cache clearing,
relogin/account/identity changes, project changes and A–B–A, page return, empty/old
cache, slow/failed/out-of-order responses, permission allowance/denial, duplicate
operations and recovery/retry. Changes to interfaces, request wrappers, authentication,
project selection, cache, response parsing or timing MUST resolve affected direct and
indirect callers before selecting regression scope.

For latest-intent navigation or results, use distinct destinations or records, deliver
the older response last while its handler can still run, and assert both the final
state and every navigation or write. When reporting a browser receipt, name the UI observation and the data source. If the source was synthetic or its provenance is unknown, record real-service behavior as unverified. An earlier response still pending leaves the late-delivery claim open. For cached switching, exercise first entry,
return to a cached item and a burst of selections. Measure input to selection,
request start/end and target content update separately; record request counts and
the final selection. Local timings are observations unless the project owns a budget.

For repeated release or recovery checks, reconcile the agreed host, scenario and round against actual case outcomes. Keep the initial failing run and the later candidate on their own build and policy basis. A reload claim needs a new main document, navigation evidence, the executing build identity and usable target content. Record manifest-only loss separately from a whole client going offline and returning online.

For asynchronous forms, bind a receipt to the initiating operation and record. Switch to a different target while the old result is outstanding, release it and observe both forms. For media, capture the intended resource before a fallback can replace it. Verify its response and decode separately from the user's ability to continue with the fallback.

For operations with a durable submission key, exercise a lost reply after commit
in an authorized isolated environment. Query by the original key, replay according
to the contract, and compare row identities and durable effects. Include a changed
payload with the same key and distinguish pending from completed. For scoped access,
use the same fixture across allowed, read-only and out-of-scope identities; compare
service decisions, visible actions and readback for unintended changes.

Case results MUST retain PASS, FAIL, BLOCKED, NOT RUN and N/A independently, with
missing required evidence labelled `Not verified`. These case labels do not replace
delivery metadata Verdict enums. Reports MUST state each denominator, failures,
blocked/unexecuted cases, residual risks and exact recovery conditions. Source,
synthetic tests, Mock, real services, H5, physical devices and builds MUST retain
separate evidence; HTTP 200, a toast or a test count MUST NOT establish a business
journey. Completion requires entry → action → request → UI feedback → necessary
independent readback → cleanup. Production testing MUST NOT imply authority to send
notifications, alter real business records or delete data. Defects retain the original
failure; authorized repairs require the original scenario and affected-consumer retest.

When claiming a new regression guard, verification MUST show that the original
error is rejected for the intended reason and a structurally similar valid case
passes. Missing real or safely reproducible evidence MUST keep the corresponding
claim `Not verified`; a synthetic counterexample MUST NOT be presented as a real
historical incident.

Generated file/module dependencies MUST remain separate from exported-symbol
consumers. A file import MUST NOT establish callers of every export; symbol, alias,
namespace member and callback evidence MUST retain their resolution boundary.
Source-derived case scaffolds MUST retain their labeled baseline/inference basis;
business-acceptance verdicts MUST remain provisional until accepted business oracles
supply the required outcomes. This does not block independent safe regression or
exploratory execution.

Case PASS claims MUST identify the assertions actually executed. An intercepted
request or syntactically usable URL alone MUST NOT establish service reachability
or method/path/payload/response conformance; conformance requires an independent
accepted oracle. A runner that owns failure signaling MUST return a failing status
for failed assertions.

Reruns of target-project inventories and mutable result indexes MUST reconcile the
current case IDs without resetting manual results, investigation notes or
owner-specific recovery conditions. Retained verdicts MUST preserve their original
source/environment basis; changed or missing bindings require explicit invalidation
of current applicability or a blocked index update while preserving the previous
evidence. Mixed records MUST delimit tool-owned sections. Evidence writers MUST
refresh digests only for their declared, owned mutable outputs and validate retained
evidence bindings before accepting a new index. Immutable PackageManifest, Attempt,
Observation and Receipt records follow their existing contracts; do not rewrite them
or refresh their digests to carry a prior verdict forward.

## Runtime prerequisites and entry attribution

Before expanding runtime acceptance, resolve the applicable source/artifact/loading
binding, authorized identity/project context and available prerequisite data. Keep
source checks and independent read-only diagnosis eligible while a device/package or
write-operation prerequisite remains unresolved; follow the project's accepted order.

For a missing feature entry, trace the project's actual chain from identity and project
binding through application authorization, delivered configuration, client filtering
and route resolution, where those stages exist. Correlate actual responses with the
rendered entry; do not infer a server configuration cause from a client empty state.
Normal-entry reachability and direct-route behavior are separate claims. A working
deep link MUST NOT close a missing normal entry or authorize changing permissions.

Select acceptance actions from the project's accepted business scope under
[Business Scenario Standard](business-scenarios.md#applicability-and-authority), not
module names or the mere presence of API methods. Unresolved editing, publishing or
administrative actions MUST NOT become migration defects or automatic feature work;
independently authorized baseline checks may continue with their qualified verdicts.

Where applicable, begin with an existing non-empty read journey through entry, query,
filter/paging, detail and return, including the affected identity/project switches.
Empty-state evidence does not replace that journey. Select writes only with the
authorized role, object, initial state, expected effect, independent readback and
cleanup; synthetic-data labeling follows the target project's policy. External
service or device claims require matching object/time-window observations and the
applicable service/device result, not only a UI value or successful request.

## Reported-defect closure

For a reported runtime defect, verification MUST bind the original entry, action,
role/data context and effective source/runtime identity to its failing operation.
For API failures retain the sanitized method/path, parameter placement and
non-authentication values, response and resulting page state. A plausible source
defect or a different failure MUST NOT be reported as that incident's root cause.
If the original operation cannot be reproduced or its evidence recovered, retain
the incident as unresolved while crediting independently verified repairs. Repeated
repairs under the same unverified explanation require a new discriminating check,
not another equivalent patch or larger green suite.

Fixtures used for interface acceptance MUST discriminate the contract conditions
under test, including identifier mapping, parameter omission/emptiness and response
field meaning when applicable. A path-only success responder or correlated fields
can support UI simulation but MUST NOT establish interface conformance. Include a
valid counterexample to each proposed shortcut; absence of child objects, for
example, does not establish absence of directly attached records. An accepted
missing parameter is not a defect merely because another branch requires it.

Closure MUST reconcile each affected consumer's actual journey and distinguish
list/detail, selection, confirmation and required persistence. A selector pass
MUST NOT close its parent list or a saved-result assertion. A newly observed
counterexample makes only the affected current acceptance claim stale or failed;
retain the old observation and rebind its dependent cases and review. When
resuming, reconcile later evidence and corrections across linked reports before
stating that real verification never occurred or that an old pass is current.

## Evidence 最小字段

- 固定 repository identity 和 commit SHA。
- Requirement、Task 或 Change 引用。
- category、status、执行 owner、环境类别。
- 对命令：相对 cwd、argv、开始/结束、exit code 和日志哈希；阻塞或未运行时不伪造日志。
- 对产物：类型、路径/locator、identity、version 和 SHA-256。
- 对 runtime：目标环境、身份类别、请求/页面/事件结果和可复查 locator。
- Gap、限制、下一步和关闭 owner。

## Verdict

- `Pass`：全部 required gates 为 `pass`，且每个 gate 都有自己的 Evidence ID；关键 Gap 已关闭。
- `Fail`：必选检查已执行且失败，或合同矛盾未修复。
- `Blocked`：仅当明确环境/权限阻止执行并记录 `ENVIRONMENT_BLOCKED`；相关轴保持 `Not verified`。
- `Partial`：已有部分结果但未满足 Pass/Fail；包括 `partial`、`not-run`、adoption mode，或 Portfolio 中的 Blocked 项目。

`not-run` 表示没有执行，`partial` 表示执行或取证只覆盖了部分要求，二者不得互换。Project gate MUST 聚合声明该 gate 为 required 的 component：全部 pass 才是 pass，任一 fail 为 fail；混合结果为 partial。不得用扁平 `evidence_ids` 同时证明多个 1.1 gate。

1.1 中每个 campaign/project required gate 必须至少由一个 component 声明为 required，且不得为 `not-applicable`。Required gate 的 `pass`、`fail`、`partial` 和 `blocked` 都 MUST 绑定非空 `gate_evidence`；只有 `not-run` 可以没有 attempt evidence。同一 project 或 component scope 内，一个 Evidence ID 不得跨不同 gate 复用。

文档、评审或源码存在不能替代测试；构建不能替代运行；本地运行不能替代部署和生产。

## Rule adoption evidence

When maintaining standards or Skill instructions, MUST freeze the original request,
project rules and preserved behavior as the oracle before judging candidate output.
Inventory existing rule owners first; record coverage, overlapping references and
actual gaps in the existing maintenance result. A rule written, distributed or read
is not evidence that the AI followed it.

For claimed behavior, select bounded positive and negative examples from a real
project with fixed source/diff and accepted authority references. Test both detection
of a demonstrated violation and preservation of a permitted neighboring behavior:

| Concern | Evidence to inspect | Legitimate neighboring case |
| --- | --- | --- |
| Duplicate implementation | Existing public owner, reachable consumer and proposed/actual copy of the same responsibilities | Similar markup with different business ownership, or composition/variant using the shared owner |
| Unsupported inline feedback | Original accepted copy/type/timing, current change scope and actual added presentation | Feedback already required by the accepted Product/UI contract |
| Unsupported retry | Accepted recovery contract, actual retry trigger, limits, idempotency and effects | Explicitly accepted bounded retry; its presence alone is not a defect |

Missing accepted authority MUST remain an unresolved verdict, not an inferred defect
or approval. A controlled mutation of a real sample is a synthetic counterexample,
not a historical incident; retain that label and never inject it into application
source. Preserve case provenance, source/installed/loaded identity, input and actual
actions, expected versus observed decisions, false positives and missed detections.
An AI answer correctly describing the action proves only that observed decision;
implementation compliance requires the resulting diff and applicable verification.

Source review can establish an import/call relationship, but interaction, performance
and business effects require actual target observations. Report unexecuted layers as
`Not verified`; no keyword scan, green count or small selected corpus establishes
general effectiveness. Reuse unaffected evidence with a basis/impact rationale;
changed authority, rule or relevant source invalidates the dependent verdict.

## Delivery readiness and recovery

- 交付 MUST 对齐最终 basis 与项目已有的格式、静态、类型、构建和测试门禁，按目标及授权
  判断适用性。开发期不默认启动独立构建；构建仅在已授权的交付/发版要求或显式请求时
  执行。命令来源与未运行/受阻项如实记录，不能关闭检查、降低断言或移除必测项制造通过。
- 提交或交付说明 MUST 关联功能/缺陷和准确变更范围，说明行为变化、验证层及剩余风险；
  影响安装、配置、API 或使用方式时同步原文档。聚焦当前授权变更，保留无关 dirty work。
  声明源码通过不等于已提交、已推送或已发布。
- 部署适用时 MUST 在原发布记录确定包/环境身份、前置检查、发布后验证及回退触发条件、
  owner、目标与方法；对配置和数据影响按 [数据恢复](interfaces-and-data.md#data) 单独
  核对。验证包括原生健康信号和受影响关键业务读回，不把进程存活当作业务成功。
- 发布、安装、回退计划或命令的存在不证明其执行。实际操作及恢复按授权分别取证；未经
  演练的回退/恢复可记录为方案，不能写成“已验证可用”。灰度、高可用及生产演练仅在
  项目明确需要和相应授权时适用。

## Browser testing without foreground interruption

Browser tests, screenshots, recordings and page inspection MUST run in the background.
Playwright automation MUST default to `headless: true` in a task-owned browser/context.
A headed demonstration or debugging session requires an explicit user request with a
bounded target and duration; a headless failure MUST NOT trigger a headed fallback.
For a built-in browser or a task-owned Playwright context, the verifier SHOULD
choose and set the applicable viewport without asking the user to choose dimensions:
use the accepted project matrix or effective host default, otherwise one minimal
representative viewport. Read back the effective state. This does not authorize
shared-state changes beyond the host's policy and the user's task authority.
For an existing local user browser, use its current viewport without resizing or
blocking ordinary inspection on a size mismatch. Only an explicit responsive or
exact-viewport acceptance requirement makes another size necessary; use an
authorized isolated surface when allowed or mark only that dependent claim
`Not verified`. Do not add unrequested breakpoints or silently replace a user-fixed
local surface. The verifier MUST identify any cross-tab effects and record the
final state; it MUST NOT claim task-level isolation for a shared setting.
A viewport size alone does not prove a physical device or its browser configuration;
report those acceptance layers separately.

Execution MUST preserve the user's active app, window and selected browser tab. This
includes indirect effects: page clicks, `window.open`, popups, redirects and extension
preview navigation MUST NOT activate a window or switch the user's selected tab.
Creating a tab with a background flag alone does not prove that its later interactions
preserve focus. Daily browser tabs MUST NOT be reused as automated test targets merely
to obtain session state. Operations explicitly authorized for a local browser/profile
still require a verified background route and the user's existing state boundaries.

The test owner MUST inventory task-created targets and correlate each list-to-detail
case with its resulting page. A passing case MUST NOT be reopened repeatedly for extra
confidence; repeat only after a relevant change, failed assertion or new requirement.
Mock detail pages MUST stay inside the background test surface and MUST NOT accumulate
as repeated tabs in the user's browser. Close only identity-matched task-created pages
and read back cleanup without activating or selecting user windows or tabs.

When the available capability cannot preserve these conditions, stop the affected
browser operation and report its evidence as `Not verified`; continue independent
authorized work without using foreground interaction as a substitute.

Parallel page verification MAY use independent agents when the service, accepted
reference state and target sessions are stable and the work packages do not share a
mutable page, account, Mock state or proxy configuration. Host guidance and actual
runtime capacity determine agent count; Forgeway does not impose a personal number.
Assign one controller and one channel per target page, with separate task-owned
contexts or sessions. Each package returns its target, state, assertions and readback;
the coordinator reconciles them against one accepted basis and owns the final gate.
On drift or failure, close the affected package before dispatching an equivalent
retry. Do not claim parallel coverage from agent count alone.

Testing authority MUST remain distinct from source mutation authority. When portal or
other business source is excluded, fixes remain within the authorized Mock extension,
test configuration and fixture boundaries. Do not edit business components, API
clients, routing, state stores or backend code to make a test pass. A necessary change
outside that boundary requires a separate user decision before implementation.

## Native-client background evidence

Client task delegation, submission, progress queries, waiting and result readback
MUST preserve the user's foreground and input state by default. Naming a client as
the worker MUST NOT imply permission to activate, raise or focus its window. An
explicitly requested GUI action retains its existing bounded authority; it does not
authorize recurring activation for monitoring.

For these operations and required background client gates, the coordinator MUST
carry foreground, keyboard/pointer/clipboard and screen-session constraints through
capability selection, handoff, execution and result validation.
The host selects a current operation-capable owner within effective scope; a static
registry entry or successful capability check MUST NOT authorize input or establish
that the route is focus-preserving. Platform mechanics remain with that owner.

The host MUST coordinate operations that share foreground or global input; distinct
tasks or windows do not establish isolation. Independent background sessions MAY run
concurrently only within their established non-interference boundaries. If the user
changes the active app or a route cannot preserve the constraints, stop the affected
GUI operation without reclaiming or restoring focus; continue independently safe work.

The handoff MUST identify the exact app/build/process/window and operation, expected
postcondition, allowed local effects, test-content ownership, restoration and stop
conditions. The coordinator MUST distinguish ordinary execution from an explicitly
authorized bounded capability qualification. Neither mode permits silent activation,
global input, permission changes or manipulation of existing user browser tabs.

For app-owned session protocols, the executable/protocol instance MAY replace native
window binding. The handoff MUST bind executable/build,
protocol/transport, configuration/account boundary, workspace/session, task scope,
tool and path enforcement, submission identity and progress/terminal correlation.
Reuse current matching qualification evidence; drift invalidates only affected
operations. Received/accepted MUST NOT prove completion. Tool tasks MUST include
actual tool arguments/results and the task postcondition; a read-only task MUST NOT
prove write-tool safety. An uncertain send MUST be reconciled before retry, and
approval, cancellation or session deletion MUST retain their own authority. Protocol
state MUST NOT prove desktop selection, visible synchronization or window capture.
Progress monitoring MUST reuse the bound process/session through a non-activating
route, prefer available events and honor a bounded query budget. An unavailable read
MUST NOT fall back to activating or reopening the desktop. Stop monitoring on a
terminal result or budget exhaustion; exhaustion leaves completion unverified and
MUST NOT cancel, delete or resubmit the task. Qualification and version probes MUST
also respect the foreground constraint; a GUI launcher is not a headless entry.
For a headless CLI, the coordinator MUST also bind exact argv/cwd, process exit and
per-turn output to the returned session identity. Requested mode and tool filters
MUST be checked against effective permission evidence; an unchanged test file or a
read-only observed turn MUST NOT establish enforced write prevention. CLI process
completion and persistent-session completion remain separate observations.
Persisted provider/model/variant records MUST correlate with the exact task turn;
local client attribution MUST NOT be reported as server attestation. An empty final
tool list MUST NOT establish that no tools ran. Endpoint hash equality MUST NOT
prove absence of intermediate mutations; equal database counts MUST NOT prove
content equality. Operational diagnostics follow the
[security and privacy standard](security-and-privacy.md#operational-diagnostics).

For emulator-hosted mobile apps, the target binding MUST instead include the owned
virtual device/serial, guest OS/image/ABI and installed artifact identity. A headless
guest does not require a host window. Host desktop lock/sleep and guest app/device
state MUST remain separate: an authorized device-scoped control route can produce
guest interaction and display evidence without host GUI input. Short locked-operation
evidence MUST NOT prove long unattended execution, locked recording or recovery that
occurred after unlock. An older installed artifact MUST NOT verify current source,
missing native plugins, physical devices or vendor-specific behavior.

Evidence MUST separate capability discovery, actual application result,
non-interference observation, native-window or guest-display pixels and cleanup. A declared writable field,
advertised action, permission preflight or successful return with an unchanged value
MUST NOT satisfy the corresponding state-change gate. Foreground endpoint samples
MUST NOT be described as continuous focus proof; missing keyboard-focus signals MUST
remain explicit. Empty, stale, transformed-thumbnail or ambiguously attributed
captures MUST NOT satisfy full-window visual acceptance.

Ordinary background, occluded, hidden, minimized, other-Space and locked conditions
MUST retain independent evidence when required; an untested condition remains
`Not verified`. A failed postcondition, unsupported operation, environment block and
unexecuted check MUST remain distinguishable. The coordinator MUST keep the same
Task/acceptance item and preserve failed Attempts, unverified axes and cleanup gaps;
it MUST NOT spawn an equivalent retry or change transport to conceal a failure or
policy refusal. Resume only affected gates after the required capability, authority
or environment changes; independently authorized checks continue.

## Evidence volume and retention

Before a large capture matrix, the coordinator SHOULD sample a representative case,
measure its evidence bytes and project total growth from the required cases, states
and retries. Set a task-appropriate capture budget and check growth between batches.
An exceeded budget MUST stop optional bulk capture, not silently reduce required
coverage or turn missing evidence into a pass. Continue bounded checks independently;
report any required capture that cannot be obtained within the available resources.

Capture MUST be scoped to the assertions: relevant elements, state, geometry and
style properties rather than every computed property on every node at every scroll
position. Full snapshots remain appropriate when the investigation requires them.
Unchanged content SHOULD be referenced once by identity; lossless compression is
appropriate only when the evidence consumer can still read and verify it. A summary
MUST NOT replace raw observations needed to reproduce a failure or substantiate a claim.

At close or an authorized cleanup, distinguish current referenced evidence, original
failures and their repair results, superseded diagnostics, reproducible intermediates
and ownership-unknown material. Latest time or runner exit alone MUST NOT establish
valid replacement evidence. Bind a replacement to its case, assertion, basis and
actual verdict; inspect current references and active use before removing an older
owned diagnostic. Keep a concise removal/replacement record and qualify historical
links whose raw payload was removed. Unknown ownership or active use preserves it.
Moving a worktree into an archive MUST NOT itself authorize indefinite copies or
deletion. Cleanup authority remains scoped; immutable Result Packages, accepted
Evidence and their manifests MUST NOT be rewritten or pruned under this rule.

## External typed-artifact input port

Forgeway MAY consume an externally owned validated typed artifact through the
language-neutral typed-artifact input port. The external producer remains the
sole owner of its schema and project semantics; Forgeway MUST NOT copy, parse or
otherwise promote that schema into a Forgeway product, domain, interface or UI
contract.

The consuming `artifact-validation` Observation MUST carry exactly one claim ref
and bind it to exactly one external contract ID/version, producer capability ID/version,
package-relative artifact path and artifact SHA-256. The referenced bytes MUST
be present in that Observation's exact Result Package and MUST hash and byte-count
match its PackageManifest entry. The host MUST provide an explicit external
contract validator/adapter. It MUST attest eligibility and return a receipt bound
to the same contract ID/version, producer capability, claim ref, artifact hash
and Result Package ID. The typed-artifact port authorizer MUST be configured with
an explicit, non-empty set of unique Gate claim refs it owns; missing or empty
ownership configuration MUST fail during authorizer initialization. An Observation containing an owned ref MUST be
evaluated by this port even if its validator ID is malformed, and MUST NOT fall
through to a generic authorizer.

An Observation, producer capability, claim ref, validation receipt, artifact
hash and Result Package that do not agree MUST be ineligible. Missing adapter,
unsupported contract/version, invalid or ineligible external result, stale
Result Package, or package/hash/receipt mismatch MUST fail closed and MUST NOT
satisfy a Gate.

`report.md`、`replay.md` 或 capability snapshot 可以解释一次 handoff，但不能替代 Evidence record，也不能提升 evidence status。真实 capability identity、provider/model/session/transport 和 transcript 仅在验证所需时进入忽略的 run-local evidence，不得成为 portable routing authority。

## Browser Mock evidence

For authorized real-page verification with synthetic data, the verifier MUST fix the
project, environment, tab, origin/path scope, interface/consumer basis and applicable
built-in module inventory before opening the test window. Target projects own their
business meanings; their external test workspace owns the fixtures consumed by Forgeway's browser Mock runtime.

The verifier SHOULD reuse a known working real read when appropriate, with an
explicit pass rule. Unknown protected requests MUST NOT fall through to the network.
HTTP method alone MUST NOT grant read authority. Mock writes and real writes retain
separate semantics; viewing CLI sessions reject write+pass. Iframes are excluded from
this capability's module/data denominator.

The verifier MUST distinguish configuration validation, response transport, visible
page consumption and real-service integration. A non-empty JSON envelope or matched
rule does not prove visible records. Lists, details, selectors, libraries and media
MUST be checked at their actual UI surfaces when applicable; structural leaf lists,
permission flags and intentional empty/error pages retain their native semantics.
The final report MUST reconcile every included module to real or mocked data and
state unresolved modules explicitly. Unused exported endpoints do not create UI
modules, and their transport tests do not establish UI coverage.

When the user requests an inspectable local browser, the verifier MUST retain the
owned browser after startup, verify its active binding and displayed content, and
provide its reopen/resume and stop path. Other browser state, login sessions, target
services and network configuration MUST remain outside this operation's changes.

## Project Mock selection and reuse

On a Mock request, the coordinator MUST first resolve the current project's accepted
Mock approach from applicable project guidance, confirmed user decisions and the
actual configuration/adapter call chain. It MUST automatically match synthetic data
to the target page's interface contract, consumed fields, identifiers, relationships,
query filters and intended interaction. Inspect existing assets before introducing
another transport, fixture store or state adapter. An installed interceptor alone
does not establish the project's accepted choice.

When no accepted transport resolves the choice, use the host-selected browser surface
and its authorized temporary CDP interception for a bounded flow when supported;
an isolated compatible Chromium extension session remains available for inspectable
scenarios. A local HTTP proxy
is applicable only through a project-adopted external test runtime with no source,
development-config, system-proxy or daily-browser mutation. The host's effective
global browser/Mock guidance chooses among compatible routes. Unknown permission,
restoration or isolation is a stop for that route, not a reason to inject a project
hook or silently switch to a less isolated channel.

When the evidence determines the approach, proceed within the authorized scope
without asking the user to select it again. Ask only when a material choice remains
unresolved or accepted sources conflict, offering the relevant viable approaches
and a recommendation. Reuse a confirmed choice as the default for subsequent
authorized Mock work in that project while its target and assumptions remain valid.
Preserve the durable decision in the external test workspace documentation or
configuration, including its scope, persistence and read/write boundary; do not
create another preference registry. Recheck only an actual scope or authority change.

Presentation-only samples MAY be static. Create, edit, delete, toggle and other
saved interactions MUST use shared state for the supported mutations and dependent
reads, or explicitly report the unsupported boundary. Preserve existing Mock edits
and fixtures when extending coverage; a repeated Mock request does not authorize
resetting state, migrating unrelated modules, changing permissions, installing a
browser extension or writing to real services. A default choice supplies method,
not additional authorization.

## Stateful Mock interaction evidence

For an authorized interactive Mock journey, the verifier MUST distinguish static
presentation from stateful behavior. A write success toast or HTTP success alone
MUST NOT count as a completed mutation: re-query the affected list, detail and search
views, then check reload behavior for the declared persistence scope. Failure,
validation rejection, cancellation and timeout require separate state readback;
unknown commit outcomes must be reconciled by reading state, not blindly repeated.

Projects own business reducers, fields, validation, permissions and relationships.
Use the [project state adapter](../tooling/browser/mock/STATEFUL.md) for shared
transaction and persistence handling; do not patch generated interceptor internals.
Select supported rules and mutation scope explicitly. Static samples are appropriate
for read-only presentation, but unsupported mutations remain unverified or return an
explicit failure. Mock completion never proves backend persistence, notifications,
real-account permissions or deployment. Preserve background execution and target
viewport requirements, and record activation separately from generated files.

## Codex PostToolUse observation boundary

The bounded `tooling/delivery/codex-post-tool-use.mjs` consumer MAY observe an
already authorized delivery operation through Codex's native `PostToolUse` input.
The reviewed wire authorities are upstream Codex 0.163.0 commit
`83086188ae0614bd882818ff1aa23f3194962012` and 0.165.0 commit
`360319d8dee62d87e2d59fc0c21805d79519cfed`; their
`codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json` bytes
are identical, not a Forgeway-owned replacement event schema. These fixed-source
reviews do not prove native registration, loaded identity or other versions.
Its response is arbitrary JSON and it has no event timestamp. A tool/hook/turn completion MUST NOT imply delivery
success. Permission fields in event JSON MUST NOT authorize an operation.

A trusted existing CODE owner MUST bind native session/turn/tool IDs to the exact
Task, Run, current successful Attempt, repository, input/result package hashes,
scope, producer, previously authorized target/ref/commit and authorization
reference. It MUST supply independent read-only target readback and current
cancellation/failure/authorization checks. The adapter MUST NOT execute or retry
business actions, load event-selected modules, run maintenance, create another
Task/Run truth, or register hooks. Missing bindings MUST fail closed.

The adapter's first-seen native key, envelope hash and immutable binding hash
MUST persist once as an ineligible existing `runtime-observation`, with no gate or
stage-exit claims. Duplicate delivery MUST reuse that first ingestion time.
Confirmed evidence MUST use `createDeliveryReceipt`, which owns the atomic
Receipt/event/Observation write. Expected target ref and commit equality are
mandatory. Completed duplicates MUST verify the persisted pair without another
readback or evidence rewrite. Changed content, stale work, cancellation, failure
and unknown or negative prior results MUST NOT be promoted to success.
The readback timestamp MUST be a real calendar instant in canonical UTC ISO
milliseconds (`YYYY-MM-DDTHH:mm:ss.sssZ`); merely parseable or automatically
normalized date strings MUST be rejected before any Receipt write.

Adapter-owned intake metadata and `readback.details` use consumer version
`1.0.0`, producer/collector `forgeway.codex.post-tool-use`; the non-LLM consumer
and validator are that module plus the existing DeliveryStore validators. No new
persistent schema, table, queue or deduplication store is introduced. Upstream
wire or binding-contract drift requires explicit review and a versioned consumer
change, never silent reinterpretation. Retirement disables the adapter in its
existing owner and retains historical immutable Delivery records; it creates no
migration or replacement ledger.

The caller MUST reopen the same store and verify exact Receipt/Observation,
derived gates and workflow closure against actual owner state before claiming
acceptance. The adapter's return is not stage completion or execution authority.
Deterministic synthetic port tests MUST be labeled separately from live native
registration, emitted-event, loaded-handler identity and target readback evidence.
Configuration hashes MUST NOT substitute for the external handler's loaded byte
hash. This feature does not authorize host configuration changes or model calls.
