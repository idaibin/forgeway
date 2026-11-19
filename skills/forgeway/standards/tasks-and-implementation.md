# Task and Implementation Standard

## Task Planning

- Task MUST 按 [基础检查清单](code-design.md#foundation-checklist) 选择受影响要求，引用
  现有语义 owner、原生检查和预期证据；保留适用必选门禁，不给不相关切片附加完整流程。
- Task Planning 与 Implementation MUST 是独立 Stage；Task 只描述已授权工作的 basis、scope、owner、依赖、输出、命令、Evidence 目标和 stop conditions，不得通过“计划”暗示源码已修改。
- Task MUST 引用当前 Product readiness 为 `Ready` 的 Requirement/Change。UI 为
  `applicable` 时，Task 还 MUST 引用同一 basis 上 UI readiness 为 `Ready` 的 UI
  authority；只有带 owner/decision reference 与理由的显式 `not-applicable` 决定
  可免除 UI 条件。任一适用轴不是 `Ready` 时，不得派发或开始 Implementation。
  Task 同时包含固定 repository/component basis、include/exclude scope、dirty
  exclusions、owner、依赖、输出和验证命令。
- 默认 Task Slice MUST 是可独立演示或验证的纵向 tracer bullet，在一个 fresh execution context 内贯穿适用合同、源码与测试；不得默认按 schema/backend/frontend/tests 拆成长周期水平批次。
- 多 Slice 只记录真实 blocking edges。宽域机械变更无法独立保持 green 时 MAY 使用 `expand → migrate batches → contract`，并明确最终 integration/verification Gate 与旧形式 retirement 条件。
- 多个 Task 都已 Ready 时，Task Planning MUST 保留已接受的业务优先级和必要 Gate；仍有选择空间时，SHOULD 消费 Task owner 给出的有依据顺序与理由。未解决的实质业务取舍返回其语义 owner，仅阻止受影响的选择；排序不得制造依赖、改变 readiness、授权执行或在编排器内另建评分器。
- 测试 seam SHOULD 选择最高、最稳定且可观察外部行为的现有 seam；只有真实缺口才新增 seam。测试 MUST 随对应实现 Slice 进入反馈循环，而不是在所有代码完成后统一补写。
- 修复切片 MUST 回链其真实功能和验收项，保留同一原因的失败记录；更名或换 owner 不重置重试边界。已授权可执行项耗尽时 SHOULD 输出待决策、凭据或真实验收队列及恢复条件，不得为持续运行凭空新增优化范围。
- 持续任务再次派发前，协调者 MUST 先把上一工作包的实际产物、目标层回读、失败终态和剩余缺口归并回原功能与验收项。同一验收项未闭合时，不得按页面、检查项、新轮次或新名称重复派发等价工作。同一工作包同一时刻仅有一个实施 owner，按需要使用一个独立 reviewer；owner 不可用时按 Capability and authority 规则停止受影响执行，完成原工作包归并后，可向重新解析的唯一 owner 明确交接既有产物、失败记录与剩余验收，不重置原验收项或重试边界。有独立授权且边界互不重叠的工作仍可并行。子任务完成和检查数量不得替代原功能验收。
- 命令 MUST 使用 `cwd` 与 `argv[]` 表达；不得把 secret 值写入 Task。

## Capability and authority

- Task dispatch MUST 以当前 Stage 所需的语义能力、已接受输入、预期输出、mutation boundary、authorization needs、evidence class 和 terminal contract 进行匹配；不得按 provider/model/CLI 品牌或固定顺序选择 owner。
- 每次 dispatch MUST 只有一个 owner。无法解析唯一 owner 时必须返回 `capability-unavailable` 或 `capability-ambiguous`，不得静默 fallback。
- 所有 Skills MUST 保持可独立调用；Forgeway 只能根据当前 Run 编排所需 owner 和 handoff，不得把完整流水线变成单个 Skill 的使用前置条件。
- Handoff 只传递最小 Artifact package 和有界上下文，不传递另一 owner 的权限。静态 Registry、历史选择或安装记忆不能授权调用。

## Project and Task 1.2 coordinates

- Project/Task `1.2` explicitly uses repository-relative coordinates. A component's
  `path`, each artifact/output `path`, Task scope `include`/`exclude` path and
  command `cwd` are relative to the repository named by that component. The
  `component_id` binds ownership/repository; consumers MUST NOT prepend its path.
- Paths MUST be canonical (`.` only for the root, no empty or `.` segments).
  Task scope supports exact paths, `*`/`**`, or a literal `prefix/**`; exact paths
  do not implicitly select a directory subtree. Task references MUST stay inside
  their declared component and repository basis. Command `argv` is opaque and
  MUST NOT be rewritten or executed by a read-only projection.
- A pair opting into `1.2` MUST use that version for both Project and Task. Existing `1.0`/`1.1` records keep
  their original consumer behavior; consumers MUST NOT reinterpret or auto-upgrade
  them. Migration requires the artifact owner to confirm every path/cwd and emit
  new accepted bytes/hashes. Updating only the version is not a migration proof.
- Producers remain Project/Task owners; validators and read-only Context and
  maintenance are the `1.2` consumers. Context currently requires repository-root
  input/result Packages. Maintenance may project one component into a Package
  with exactly matching `basis.source_root`, stripping that verified prefix once
  from scope/output/cwd; its before hashes remain package-relative. Mixed roots,
  ambiguous mappings and executable SDK use MUST fail rather than guess.
- Original typed-artifact, Context and maintenance fixtures validate this version.
  Any source, mapping or Task/Project change invalidates the old projection hash;
  retire an old version only after its referencing artifacts and consumers migrate.

## Implementation

- 业务切片 MUST 消费 [业务场景标准](business-scenarios.md) 的适用项目决定；按
  [复用规则](business-scenarios.md#reuse-before-implementation) 定位前后端已有 owner，
  将复用/扩展/新增理由与相同验收引用传入 Result，不复制另一份场景规范。
- 跨业务模块修改 MUST 先只读理解被触及组件、模块或页面的业务、调用方、权限、状态和副作用。当前 Task 不自动授权更改其他模块的既有逻辑或代码；现有实现与新增需求不兼容时，MUST 先呈现原行为、冲突、方案、影响及拟修改范围，取得用户对方案和范围的明确同意，再更新相应合同并实施。已有同范围明确批准可复用，独立已授权工作继续。
- 实现 MUST 使用目标仓原生框架、生成链、迁移机制、模块边界和验证命令；不得为未来猜测增加 fallback、平行 DTO/Schema 或第二套抽象。
- Agent Prompt MUST 引用 Standard、Task 和当前 authority refs，不能复制并弱化规则。
- 实现 MUST 在修改前重新确认 basis、Task、guidance、scope 和 pre-existing dirty work；只能修改当前 Attempt 拥有的路径和生成源。
- 实现 MUST 在修改前重新确认 Product readiness 与适用的 UI readiness 引用仍在
  同一 basis 上保持 `Ready`；任一失效、`Partial`、`Open` 或 `Not verified` 均进入
  stop state，不得由实现 owner 自行提升。
- 前端实现 MUST 在新增公共控件、直接引入第三方 UI dependency 或新增 token 前读取项目
  UI component adoption record 与真实公共组件源码。已声明受控组件时，业务代码不得绕过
  public import；Registry、adapter、escape hatch 或 token 生成链缺失、冲突或 stale 时进入 UI
  stop state，不得现场创建第二套组件层或设计值权威。
- 交付代码、注释与正式文档 MUST 只描述已确认终版；用户排除内容在授权范围内连同活动引用删除，不留否定声明、对话转述或占位。对接文档直接表达终版接口与调用方式，不附加兼容或迁移叙述；真实调用方或数据依赖冲突先按跨模块业务门处理。
- 生成文件 MUST 从权威生成源重建并经过漂移检查，不得手改成为新权威。
- Product、Domain、Interface、Data、UI、`DESIGN.md`、`AGENTS.md`、Repository Asset Graph 和测试只能由各自语义 owner 决定是否更新；Artifact 出现在流水线中不构成修改理由。
- Bug 修复或 Requirement Change MAY 使用当前 basis 的 Graph impact 缩小范围，但 MUST 回读 live source；graph 缺失、stale 或 miss 不得证明不存在。
- 实现完成后 MUST 回填 changed files、受影响 acceptance/ID、命令、结果、Result Package 和仍未验证边界。

## Evidence and handoff

### Task continuity

Use the original task identity and existing ledger/evidence convention. At a material
blocker, accepted decision, verification result or handoff, the authorized owner MUST
leave the current state, evidence and one concrete next action/resume condition readable.
For a material problem, retain the symptom/impact, applicable basis/environment,
confirmed cause or explicitly labelled hypothesis, attempted remedy and its result.
Reference detailed logs rather than copying them. Preserve failed attempts; never turn
an untested remedy into a proven reusable solution. An unchanged checkpoint is a no-op.
This uses existing Task/Result/Evidence fields, not a new schema, hook, parallel ledger
or permission to alter the accepted outcome. Route durable ledger reconciliation to
its existing owner and later knowledge promotion to the native document owner.

- 语法、类型、单测、集成、Artifact、Runtime、Review 和 Delivery 是独立 Evidence 维度；任一通过不得替代其他维度。
- Handoff 结果 MUST 回指原 Task basis/scope，列出输入、输出、Evidence IDs、限制和 terminal/stop state；缺失或冲突时必须标记 `result-invalid`，不得进入下一 Stage。
- Implementation 结束最多证明其真实达到的 Source/Automated/Artifact 状态；不得自报 Runtime、Review、Git、Deployment 或 Production。
