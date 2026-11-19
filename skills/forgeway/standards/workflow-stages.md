# Workflow Stage Contract Standard

Forgeway 的交付生命周期 MUST 由统一 Stage Contract 表达。Stage 只定义一次有界推进：它消费已接受输入，选择一个当前语义 owner，返回可校验结果，并在证据不足时停止。Stage 不复制目标项目的产品、领域、接口、数据、UI、源码或运行权威。

## Contract fields

每个线性 Stage MUST 在 `runtime/stages.json` 和对应 `workflows/*.md` 中共同声明：

- 稳定 `stage_id`、`contract_version`、全局顺序与 workflow 引用；
- `required` 或 `conditional` applicability；conditional Stage 不得由文件名、语言、框架或历史运行隐式判定为适用或不适用；
- `execution_kind=kernel|host|capability`：kernel 由确定性内核执行且不得解析 Skill；host 必须引用版本化 adapter contract；capability 必须列出现有稳定 capability ID，多候选必须声明确定性 selector，不得绑定模型、Provider、CLI、安装路径或隐式 fallback；
- 最大 mutation boundary；实际权限仍为 `user scope ∩ host scope ∩ capability maximum`；
- 可检查的 entry conditions、exit conditions、stop states 与 invalidation triggers；
- Brownfield 的引用、扩展、创建、跳过和冲突处理；
- 恢复时如何验证 basis、contract version、result identity 与 Evidence。

Stage 文档 MUST 使用统一章节：`Stage contract`、`Purpose`、`Entry contract`、`Procedure`、`Exit contract`、`Stop states`、`Resume and invalidation`、`Brownfield behavior`、`Validation`。Workflow 只排序和应用已有 Standards，不得在不同 Stage 复制或弱化同一规则。

## Earliest missing stage

Forgeway MUST 从目标 goal 的第一个 Stage 开始顺序计算：

1. 只有能回读同一 Delivery Graph Run、Attempt、Result Package、eligible 且 outcome 满足 Registry 规则的 Observation，以及适用 Receipt 的记录，才算 `completed`。每个 Exit Condition 的允许 producer capability、Observation/payload validator、实际 Result Package target、condition-specific assertion/check identity、kind/outcome 由 `exit_evidence` 声明；复制 claim 字符串、无关 Artifact/check/target 或失败 Observation 不构成证明。
2. Conditional Stage 只有在存在当前 basis 上的显式 `not-applicable` 决定、owner/decision 引用和理由时，才可 `skipped`。
3. `running` Stage MUST 先核对持久 Graph 中同 Run/Stage 的 `started` immutable Attempt，再恢复该 Attempt；不存在、跨 Run/Stage、身份不匹配或已终止而 snapshot 尚未收口时 MUST fail closed，先核对原操作结果，不得静默创建并行 Attempt。
4. `blocked` Stage MUST 保留声明的 stop state、原因和恢复条件。
5. 已完成或已跳过记录发生 basis、外部源码、guidance、产品 authority、Task、合同、结果或决定漂移时，该 Stage 与所有下游 Stage MUST 投影为待失效，并从最早 owner Stage 恢复；历史记录不得覆盖。
6. 只有所有前序 Stage 均为当前 `completed`、合法 `skipped`，或由 host-verified simple-Bug admission 明确覆盖，才能返回下一个 Stage。Admission 必须以 eligible Run-local Evidence 绑定同一 basis、Task、失败检查、预期行为、未变化的 Product/API/Data/UI/Architecture authorities 与 Implementation/Verification 入场点；缺少任一项均 fail closed。

机器投影 MUST 设置 `authorizes_execution=false`。它只判断最近的下一责任，不授权能力调用、源码修改、外部操作、Git、部署或 Production 行为。

## Applicability and goal flows

Goal Flow 只选择生命周期终点，不创建第二套流程：

- `inspect`：到 Project Discovery；
- `to-spec`：到 Spec Readiness；
- `implement`：到 Implementation；
- `verify`：到 Verification；
- `review`：到 Review；
- `deliver`：到 Close。

`to-spec` MUST 保留 Product、Domain、Interface/Data/Architecture 与 UI 的独立 authority lane。它只聚合当前适用 lane 的 readiness，不得把 `product-spec`、`ui-spec` 或目标项目原生合同合并成一个万能 Spec owner。

## Resume and change control

恢复 MUST 依赖持久 Run、Attempt、Result Package、Observation、Receipt 或其他可回读引用，不依赖同一模型的会话记忆。Run-local workflow state MAY 保存阶段投影，但不得成为产品事实、源码权威或执行授权。

Stage 完成链固定为 `Run -> Attempt -> Result Package -> eligible Observation -> Exit Condition/Gate -> Receipt (when applicable)`。不存在、跨 Run、跨 Attempt、跨 Result、ineligible、stale 或 hash mismatch 的任一引用 MUST fail closed。

除第一个 Stage 消费 Run input 外，线性 Stage 默认声明 `input_from=previous-terminal`，并只消费跳过不适用条件 Stage 后最近的已完成上游 Result Package；host-verified simple-Bug admission 的 Implementation 直接消费 Run input。Capability compatibility contract 只固定 capability ID、version、accepted/produced schema、maximum mutation class 与 evidence requirements，不固定 Skills package、owner、Provider 或 CLI。Host Runtime 从一个或多个兼容实现中选择实际 package。Host adapter 必须明确为 `implemented+verified` 或 `external-required+not-verified`；contract ID 本身不证明可调用。

Compatibility MUST 使用显式 catalog 的精确 capability version；其额外输出不自动成为 Stage 必需输入。`ui.contract.specify` 的中立 evidence requirement 由 [UI standard](ui.md) 的 trusted approval consumer 落实，必须绑定当前 producer version 和 immutable Result Package。`frontend.source.implement` 的 change/no-op 均须声明源码 owner evidence。Catalog 中的 preconditions、confirmations、forbidden effects 和 failure/recovery 由宿主及执行 owner 在调用前继续核对；特别是 Git 集成策略与冲突选择。Registry 对齐通过只证明所检验的元数据相容，不能覆盖这些执行条件或证明 runtime adapter 可用。

已接受行为、合同、authority、basis、scope 或 required gate 改变时，Change Control interrupt MUST 先固定旧 basis、受影响 Requirement/Stage、重新验证范围与回滚方式，再失效受影响 Stage。失败 Attempt 和旧 Evidence 不得覆盖或删除。

## Brownfield and document rules

已有项目默认采用 `reference > extend > create`：

- 先读取有效 guidance 和项目原生 authority；存在可用 owner 时只引用或由该 owner 扩展；
- 缺少文档不等于必须创建；只有 owner、真实消费者、放置位置和授权都明确时才新增；
- 从代码、测试或界面反推的产品/领域/设计结论必须标为 Inference，不能自动升格为意图；
- Durable 文档只保存当前有效合同；任务日志、评审、截图、候选、环境快照和模型身份默认进入已验证忽略的 `.codex/` 位置；
- 结构化 sidecar 必须有 owner、producer、非 LLM consumer、版本、validator、drift policy 和 retirement rule；“AI 可以读取”不构成 consumer。
- 已有明确 Bug Task、失败检查、预期行为和固定 basis，且 Product/API/Data/UI/Architecture authority 均由 Host Evidence 确认未变化时，可用 Run-local Brownfield admission 从 Implementation 或已有实现结果后的 Verification 入场；不得要求 Repo Graph、PRD、UI Spec 或 Architecture 文档作为该短路径的前置仪式。

## Task and code flow

Task Planning 与 Implementation MUST 是不同 Stage。Task 默认拆成可独立演示或验证的纵向 slice，每个 slice 包含适用的合同、代码和测试反馈；不得把 schema、backend、frontend、tests 默认拆成长期独立的水平批次。真实宽域机械变更 MAY 使用 expand–migrate–contract，并明确最终集成 Gate。

测试 MUST 随实现 slice 进入反馈循环。类型检查、单测、集成、Artifact、Runtime、Review 和 Delivery 是独立 Evidence 维度；任一通过不得替代其他维度。

## Registry lifecycle

`runtime/stages.json` 的 owner 是 Forgeway workflow kernel；producer 是 Forgeway maintainers；非 LLM consumers 至少包括 `tooling/workflow-stage.mjs`、`scripts/validate-stage-registry-types.mjs`、focused fixtures 和 host coordinator adapter；validator 是 `npm run validate:typed-registry`、`node tooling/workflow-stage.mjs validate` 与 focused workflow-stage fixtures。TypeScript 合同检查补强静态结构与 capability reference，但不取代 Registry 的 canonical 运行时语义 validator。

Stage ID、顺序、applicability、entry/exit、mutation、stop 或 invalidation 变化 MUST 同步更新 registry、workflow、fixture 和相关 runtime/Skill 文档。旧 registry version 只有在所有消费者迁移并通过 replay 验证后才可退役。

## Single-step dispatch view

`next --view dispatch` is an opt-in view of the existing next-action projection,
not a handoff Artifact, execution authorization or a second workflow state.
The existing Stage validator, Delivery closure and drift projection run first.
Original next fields and stop reasons remain visible. Invalid, blocked, conditional,
interrupt, stale and goal-complete projections never select a new owner. Running
projects only its existing Attempt/input; the host reconciles cancellation and
unknown effects before any replacement work.

The view binds the Run input or nearest completed upstream Result Package, skipping
explicit not-applicable lanes and preserving validated Brownfield admission. Package
hashes and repository identity must validate. Only a capability Stage may consume
explicit bounded Registry v3/adapter snapshots; select one Stage candidate first,
then reuse canonical exact-version/IO/mutation/evidence compatibility. An explicit
host selection must still agree with the accepted Task surface. Missing native
discovery or ambiguous candidates remain gaps. Host and kernel Stage ownership do
not change; compatibility cannot prove installed, loaded, authorized or executable.

The CLI consumer uses an existing-file, no-DDL read-only DeliveryStore transaction,
closes it explicitly and never initializes missing/empty/invalid databases. It emits
stdout only and rejects `--output`. Validators are existing next/closure/capability
fixtures plus `fixtures/workflow-stage/test-dispatch.mjs`. This disposable view keeps
`forgeway-next-action/1` and its owner; recompute on any input/contract/evidence drift,
retire only with the existing next-action consumer. No new durable schema is promoted.

The read-only Graph reader currently requires a completed rollback-journal SQLite
snapshot with no WAL/SHM/journal sidecars. It rejects WAL before opening SQLite
(`DELIVERY_READ_ONLY_SNAPSHOT_REQUIRED`): SQLite readOnly may update SHM. The host
must provide a consistent completed snapshot; this command never checkpoints, copies
a live database, or claims live-WAL support. Keep the input stable while reading.

Read-only query admission additionally requires explicit `--copy-snapshot` (SDK
`copySnapshot:true`). This authorizes one bounded private temporary copy, not a
trust label: the reader pins a regular nonblocking/no-follow descriptor, compares
two reads plus identity/size/nanosecond timestamps and rejects journal modes/sidecars.
Only the owned private copy is opened by SQLite; the original path is never reopened
there, so later FIFO/WAL/path replacement cannot redirect SQLite. The copy is removed
on close/error. This is an explicit CLI admission change; omitting the choice fails
before SQLite and is not backward-compatible invocation syntax. Existing next JSON
and Stage semantics remain unchanged after admission. Source authenticity and host
authorization still need independent verification; snapshot copying grants neither.
