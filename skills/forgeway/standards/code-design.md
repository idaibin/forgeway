# Code Design Standard

Applies to source changes in every selected stack. Native architecture and accepted
contracts remain authoritative; these rules do not authorize restructuring a project.

- MUST keep one owner for each business rule, API/data contract and generated output.
  Validate untrusted input at the real boundary; static types are not runtime checks.
- SHOULD prefer the existing public seam, cohesive modules, small explicit interfaces
  and dependency direction toward domain rules. Introduce abstraction only for real
  repeated behavior or variation, not hypothetical reuse. Avoid duplicated contracts,
  pass-through layers and unrelated cleanup in a bounded change.
- MUST make errors and resource ownership explicit: acquisition/release, timeout,
  cancellation and shutdown. Do not swallow failures or blindly retry non-idempotent
  effects; identify the idempotency/transaction boundary when retries are needed.
- SHOULD observe one focused failing behavior through a public API/CLI/component
  seam before a stable change, implement a vertical slice, then regress affected
  consumers. If no honest executable seam exists, record the limitation rather than
  fabricating red-green evidence.
- MUST preserve native runtime, dependency manager, lockfile, module system and
  generation authority unless their migration is explicitly in scope.

Acceptance: identify the changed owner/public seam, native checks actually run,
error/cleanup paths and applicable security checks. Record unavailable source,
build, runtime/browser, integration and deployment evidence as `Not verified`
separately. Passing bootstrap validation is not code quality or security acceptance.

## Structural ownership before implementation

When a scoped change adds, moves or splits modules, components, assets or configuration,
the owner MUST resolve placement before editing, using the existing Task/design/handoff.
Record the responsibility, native owner/path, real consumers, dependency direction,
reuse/extend/new decision and preserved behavior for each affected boundary. Do not
create a separate inventory or require a new approval for already authorized choices.

For a multi-surface feature, distinguish its summary/card, full list, detail and shared
layout responsibilities before naming directories. A working summary or registry entry
MUST NOT stand for the full feature. Keep incomplete and out-of-scope surfaces explicit;
do not create empty pages to satisfy a directory plan. Framework-native conventions and
accepted project exceptions decide physical paths, not a universal folder template.

Split at independently changing business, state/resource-lifecycle or integration
boundaries; keep cohesive code local. A reusable lifecycle adapter can have a real
boundary before it has multiple consumers. File/line counts, one-file directories and
repeated markup alone MUST NOT decide extraction or deletion. Resolve style, runtime
asset, reference-material and tool-configuration ownership by their actual consumers;
use supported native consolidation only when behavior and tool discovery are preserved.

Before closing, compare the resulting owners to this decision; check affected imports,
routes, registries, identifiers, styles, resources, tests and documentation together.
Path migrations MUST pair a bounded search for old references with positive checks of the
new route/import consumers and any runtime identity such as cache include names; preserve
historical evidence rather than rewriting its original basis.
Checks MUST cover actual source formats and known escape paths with compliant and
violating samples where enforcement is claimed. Contextual ownership and preserved
runtime behavior remain separate from lint/type success. Carry unresolved decisions
and affected-consumer verification forward, rather than leaving routine placement
questions for the user to rediscover after implementation.

## Foundation checklist

先按[规则适用性与验证分层](project-capabilities.md#rule-applicability-and-verification)
区分所有任务的基础原则和本次触发的领域细则，再选择检查方式；本表不是所有项目必跑的八道门。

需求、技术设计、实现、测试、审查和交付 MUST 从下表选择当前切片实际涉及的行，沿用
项目已有合同、Task 和验收记录保存适用性、owner 引用、检查及结果；不得另建一套状态账。
表中链接仍是具体规则的唯一 owner。已有项目约定决定目录、技术栈、接口和验证方式；
冲突按有效用户/宿主指令与项目权威处理，安全、权限及证据要求不得由偏好或例外豁免。

| 适用场景 | 必须做什么 | 如何验证 |
| --- | --- | --- |
| 新需求或业务行为变化 | 按 [Product](product-and-requirements.md) 与 [业务场景](business-scenarios.md) 明确目标、范围、角色、业务数据来源、结果和验收；标记未知规则，保留受影响既有行为。删除等操作明确生命周期、关联影响及恢复语义。 | 对照已接受规则走查正常、空数据、拒绝、重复及失败路径；未决含义只阻止其依赖结论，不由实现猜测。 |
| 代码或公共能力变化 | 沿用目录、命名、模块边界和依赖方向；复用已有 owner，检查实际消费者。正式交付不得混入本切片的临时调试内容、伪完成或已确认废弃且无消费者的实现。 | 追踪公共入口及调用方，检查 diff、有效 lint/type/test 和受影响消费者；不依据一次搜索删除未知代码，不扩大清理范围。 |
| 运行环境、配置或依赖变化 | 按 [环境与依赖](#environment-configuration-and-dependencies) 固定版本、命令、配置与环境边界，核对新增依赖必要性、许可证及风险。 | 检查 manifest/锁、命令来源、配置正负例与兼容消费者；安装/启动/构建只在实际授权时执行，未运行不记通过。 |
| 数据、接口、配置或消息格式变化 | 按 [接口与数据](interfaces-and-data.md#data) 明确语义、已有数据和消费者兼容；需要迁移、备份或恢复时明确原 owner、顺序和验证。 | 检查往返映射、旧数据升级、消费者与失败恢复；代码回退和数据恢复分别取证，备份存在不等于可恢复。 |
| 错误路径、日志、外部调用或异步任务变化 | 按 [运行可靠性](#errors-observability-and-performance) 保留真实失败、可定位上下文以及超时、取消、重试和结果未知语义；UI 反馈沿用项目合同。 | 覆盖失败/恢复/重复执行并独立回读副作用；检查关联链和日志脱敏，不用成功提示或 HTTP 状态单独收口。 |
| 大列表、大文件、批处理、资源生命周期或性能变化 | 约束查询规模与并发，释放请求/定时器/订阅/连接/文件；依据实际需求与瓶颈选择优化。 | 在已接受指标和代表性数据下观察耗时、资源、负载及退出/取消后的清理；无基线不声称提升，不默认增加缓存、队列或锁。 |
| 提交、交付或发布在范围内 | 按 [交付就绪](evidence.md#delivery-readiness-and-recovery) 保留适用门禁、变更说明、使用文档及发布/回退条件；具体动作仍单独授权。 | 对齐最终源码/包/环境身份、必选检查结果、授权操作及发布后读回；失败不关闭检查，未执行不写完成。 |
| AI 执行上述任一切片 | 修改前读取当前项目规则、已有实现和授权范围；结束时逐条对照原验收与有效依据；沿用项目技术栈、组件及接口风格。 | 固定 basis 和 include/exclude，核对实际 diff、命令与证据；冲突回到原 owner，不改规格制造权限，不从模型自报推断完成。 |

多租户、国际化、高可用、灰度等按项目真实需要适用；纯 CLI、文档或局部样式变更不因
加载清单而取得 UI、部署或全量测试要求。已有必选门禁不能被此裁剪取消；必要证据缺失
保持 `Not verified`。选择结果可直接引用原验收项，无需为每次小改填写八行新表。

## Environment, configuration and dependencies

- 触及运行方式时 MUST 从项目 manifest、wrapper、锁文件、CI 和运行手册解析实际 runtime、
  包管理器及版本；在原文档给出适用的安装、启动、构建、测试命令及 cwd、配置前提和副作用。
  缺少入口记录具体缺口，不杜撰命令；声明命令不授权安装、启动服务或构建。
- 配置 MUST 与代码职责分离，沿用原生配置 owner，并为必需键提供无真实密钥的示例。
  触及配置读取时 MUST 验证缺失、格式错误和环境不匹配；明确失败，不静默连接另一环境、
  降级到真实生产默认值或使用测试凭据。开发、测试、生产的目标和数据写入范围分别确认。
- 新增或升级依赖 MUST 先核对已有能力，记录必要性、来源、维护/支持状态、项目许可证政策、
  runtime/API 兼容性和适用安全检查；保留锁和真实消费者。不凭包名或“最新版本”断言可靠。
  未决项交依赖 owner 处理，不能把未知风险写成已核验，也不因此重审所有未变依赖。

## Errors, observability and performance

- MUST 保留真实错误和适用统一映射，不吞异常或伪造成功。用户提示由已接受 Product/UI
  决定；诊断信息记录定位所需的操作、失败原因与非敏感关联身份，遵循
  [安全诊断](security-and-privacy.md#operational-diagnostics)。沿用已有日志/追踪 owner，
  避免逐层重复打印同一异常及无界日志量，不把“可观测”作为收集敏感数据的理由。
- 外部调用与异步任务 MUST 定义超时、取消、迟到结果、部分完成及结果未知的处置；重试
  仅用于合同允许且可安全重复的操作，明确次数/时间边界、退避及幂等范围。未知副作用
  先查询或对账，不盲目重放；取消请求不等于远端业务已取消。
- 性能验收 MUST 绑定项目指标、测量范围、代表性数据和实际环境；没有已接受阈值时仅报告
  观察结果，不声称性能达标。优化前固定可比基线和受保护行为，验证清理、错误与取消路径；
  避免全量读取、重复查询和无界并发，不为假设瓶颈增加缓存、队列、分布式锁或框架。

## Project-derived acceptance

Forgeway owns the method for deriving and verifying acceptance; the target project
owns its concrete entries, business rules, data shapes, fixtures and regression
cases. Before changing business source, the owner MUST trace the actual user entry and
affected callers to the relevant component/command, state and interface owners,
then derive the task's preserved behavior and expected changes from accepted
Product/UI/native contracts and confirmed defects. New implementation behavior
MUST NOT become its own acceptance oracle.

For existing-project test-only work, the default MUST be to infer scenarios from
current code, reachable call paths, native interfaces, existing tests and available
runtime observations, then generate and execute scoped tests. A complete PRD or
reconstructed specification is not a prerequisite. Available confirmed rules still
prevail; otherwise distinguish a current-behavior baseline from a provisional
inference. Neither a matching implementation nor a green test approves business
policy. Record conflicts and behavior that code/runtime cannot establish in the
existing test record for later human confirmation; continue independent authorized
checks. Only the dependent business verdict or an unsafe/unauthorized operation
stops. Test authoring does not authorize changing business behavior. For browser
journeys apply [AI E2E](ai-e2e.md#existing-project-default).

The task MUST select applicable normal, failure, boundary, permission, concurrency
and recovery cases from those project authorities and the change's impact. Record
why a category does not apply; missing necessary evidence remains `Not verified`.
Concrete business authority stays with its owning project; verification datasets
MUST live in the [project-adopted isolated test workspace](evidence.md#project-test-asset-ownership)
defined by the Evidence standard. A shared
example or conditional regression pattern MUST NOT become a required business flow
for every project. Verify user-observable results through the project's actual
entry, regress affected callers, and bind evidence to the final candidate. Later
changes invalidate affected checks and dependent conclusions.

For a performance or reuse change, the owner MUST name the preserved request
method/placement/identifier mapping, response membership and field mapping, identity
and selection semantics, permission and failure behavior of affected consumers.
Rendering changes MUST NOT silently change those business rules. Historical
comparison MUST bind the requested full-tree revision; an author's last patch or
a green legacy test is not an independent business oracle. A counterexample to a
field interpretation MUST return to the responsible authority before dependent
behavior or fixtures are changed.

## Cross-version correction transfer

Comparing another checkout grants no mutation authority over that comparison source.
Before changing source, tests or configuration across checkouts, MUST recheck the
canonical target root, branch/revision and scoped paths against the accepted Task.
Use explicit cwd/target arguments; a missing path or familiar filename MUST NOT
redirect a write to a neighboring branch. Stop the affected write on target drift.

When moving a correction between branches, frameworks or client targets, the owner
MUST bind both source and destination revisions, relevant dirty bytes and effective
runtime versions. Transfer the accepted behavior delta through the destination's
existing owners; preserve its platform branches, API payloads, UI and already-correct
guards. Similar filenames or a shared release number do not establish equivalence.
Resolve overlapping fixes into one state owner, rather than retaining two competing
request counters or overwriting target-specific behavior. Adapt lifecycle, model and
event semantics to the destination runtime and verify their actual dispatch.

## Asynchronous state and cached consumers

When changing request, cache, lazy initialization or reusable component lifetimes,
the owner MUST identify the request context and which response may update each
rendered state and cache entry. Cancellation support alone MUST NOT establish
ordering or stale-result protection: overlapping polling, realtime, filter changes
and user actions can still complete out of order. A helper's optional sequence guard
does not protect consumers that never enable it.

For paginated queries, capture the submitted page/query context before awaiting;
late responses MUST NOT read a subsequently changed pager to decide replacement or
append. Query invalidation applies to rows, counts, errors and loading completion
at the accepted reset/exit boundary, including the interval before the next request.
For reusable mutation dialogs, bind submission admission and settlement to the
current operation/session. An old `finally` MUST NOT unlock a newer operation, and
old success MUST NOT close a newly opened dialog. Retain an already-accepted parent
refresh after a completed write when applicable. Check every reachable dismissal
path, including overlay close, separately from component destruction.

Applicable regression cases MUST observe both rendered results and necessary cache
readback across A-to-B response reversal, close/deactivation/reopen and changed
identity/query context. A cached component's deactivation is distinct from unmount;
timers, listeners, queued initialization, in-flight callbacks and teleported content
MUST follow the accepted active-session boundary. Successful empty data, same-context
refresh failure and changed-context failure MUST use their Product-defined outcomes;
do not infer one universal clearing or stale-data policy. Preserve working business
selection, permissions and mutation intent when changing display or initialization.

For accepted refresh/recovery behavior, the owner MUST check admission of a newer
query while a read is busy, ownership of errors and loading completion as well as
rows/counts, and successful empty replacement. A retained success snapshot MUST bind
its query and applicable rows/count coherently from accepted results, preserving
native pagination and aggregation semantics. Do not derive newly accepted values by
immediately rereading a controlled parent after emitting an update: the parent may
not have committed it yet. Test the actual
parent/child update seam when the correction depends on that timing.

Invalidating work on cached departure MUST be paired with the Product-defined
return behavior. When re-entry requires a read, verify departure during the first
pending read, return with the retained query, and a failed return refresh with any
accepted success snapshot. Mounted and activated callbacks MUST NOT duplicate the
first read. Do not add cancellation or return refresh to consumers whose accepted
contract permits different behavior.

For multi-step writes, retain only confirmed intermediate identifiers/checkpoints
within their accepted lifetime; a later failure MUST NOT report whole-flow success
or run a dependent success action. Check whether publishing an intermediate ID
changes a parent key/identity and remounts the component that owns the lock or retry
state. Preserve the native adapter's accepted fulfilled/error semantics; do not
invent a required success envelope, rollback or retry for an unknown outcome.

Component tests MUST exercise the real parent model, keyed lifetime, cached
activation or router seam when that seam determines the failure. A stubbed or
non-rendering component test cannot establish rendered visibility or keyboard/focus
behavior. When an added import breaks an existing test injector, adapt its declared
dependencies without weakening its original assertions; retain an actual lifecycle
test for the changed behavior. Classify missing test dependencies and ambiguous
transient-message locators separately from product failures before retrying.

The [shared motion and overlay lifecycle](./ui-components-and-tokens.md#shared-motion-and-overlay-lifecycle)
rules specialize this boundary for UI overlays; the [functional acceptance inventory](./evidence.md#functional-acceptance-inventory)
owns the corresponding case and evidence requirements.

## Exceptions

SHOULD exceptions follow [project capability decisions](./project-capabilities.md);
safety, authorization and evidence MUST requirements cannot be waived.
