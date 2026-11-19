# Contracts

## Delivery Graph v2 contracts

`package-manifest.schema.json`、`run.schema.json`、`attempt.schema.json`、
`observation.schema.json`、`delivery-event.schema.json`、`gate-policy.schema.json`、
`gate-projection.schema.json` 与 `receipt.schema.json` 共同定义 Forgeway 的本地机器交付层：

| Contract | Producer | Non-LLM consumer | Drift policy | Retirement |
| --- | --- | --- | --- | --- |
| PackageManifest v1 | delivery adapter | `tooling/delivery` 与 CLI validator | 任一文件/basis hash 变化产生新 package；`created_at` 仅为非身份元数据 | 所有 Run 与迁移输入不再引用后按版本退役 |
| Run v1 | host coordinator | DeliveryStore | immutable；重试创建 Attempt | 所有事件已迁移且旧 reader 退役后停止写入 |
| Attempt v1 | capability runtime adapter | DeliveryStore 与 event importer | 每次 retry 新增不可变 Attempt，不复用 attempt number | 关联 Run/event 全部迁移后退役 |
| Observation v1 | verifier/reviewer/receipt adapter | GatePolicy projector | result package 变化投影 stale；validator 计算 `validation.eligible`，不是 producer 自报 | 对应 policy/version 无消费者后退役 |
| GatePolicy v1 | delivery policy owner | GatePolicy projector | 规则变化必须新 version | 所有 Run 离开该 version 后退役 |
| Receipt v1 | repo-delivery/deployment adapter | GatePolicy projector | target/readback 改变产生新 Receipt | 所有关联 Run 可由迁移格式读取后退役 |
| DeliveryEvent v1 | DeliveryStore | event importer 与 `delivery project` CLI | append-only，payload hash/entity closure 不匹配即拒绝 | 所有 event reader 切换后按 event schema version 退役 |
| GateProjection v1 | GatePolicy projector | `delivery project` CLI/host gate consumer | 仅由固定 policy + immutable eligible observations 重算 | policy/event successor 可完整重算后退役 |
| ContextProjection v1 | `tooling/context` project projector | `context project` CLI、validator 与 Markdown/DOT renderer | graph scan、delivery event、result package、typed artifact hash 或 Observation artifact binding 变化必须重算；Observation 的 artifact hash 必须闭合到其绑定 Result Package | CLI 与全部 renderer 切换到可完整重算的 successor 后退役 |

Schema validator 和 `fixtures/delivery-v2/test-core.mjs` 是格式与语义 validator；Markdown
报告只是投影视图，不是消费者或状态 authority。

`tooling/delivery/design-completeness.mjs` 是现有 Observation v1、PackageManifest v1 与
GatePolicy v1 的 UI shared-authority semantic consumer；它不新增 DESIGN schema。owner 为
Forgeway Delivery Graph；仅在项目采用额外 `ui-spec-design-completeness/1` policy 时适用，
项目自身共享 UI 规范不自动要求 Google DESIGN.md 或该 policy。producer contract 为
`ui.contract.specify@1.3.0`，非 LLM consumer
为 GatePolicy projector，consumer version 为 `forgeway-ui-design-completeness/1`，validator/eval
为 `fixtures/delivery-v2/test-design-completeness.mjs`。DESIGN/result/source/approval bytes 或
Result Package 改变会拒绝或投影 stale；当 UI Gate 不再消费该 claim ref 且相关 Run 全部迁移后退役。

These JSON Schemas validate delivery metadata. They do not define a target project's API, database, domain model, or UI component contract.

`project-profile.schema.json` defines the optional personal profile at `project-docs/collaboration/profile.local.json`. Its owner, producer, consumer, validator, drift and retirement rules are defined by [Project Collaboration and Personal Profile v1](../standards/project-collaboration.md). It stores multi-select roles and expression preferences only; it never grants permission or records installed Skills.

`workspace.schema.json` is a bootstrap-only contract, separate from Project delivery
metadata. Owner: Forgeway workspace tooling; producer: `forgeway init`; non-LLM
consumers/validator: `tooling/workspace.mjs` (`workspace check` and `resolve`). Version,
source-PackageManifest drift checks and explicit retirement rules are defined in
[Workspace Bootstrap v1](../standards/workspace-bootstrap.md). An initial workspace
has no invented application commits, owners, Product acceptance or delivery readiness.
Optional `project_type` and application `stack` fields record explicit standards
selection; omitted legacy fields resolve as undecided (or the fixed HTTP demo stack)
without rewriting records. This does not change Project delivery profile semantics.

| Schema | Producer | Consumer | Drift rule |
| --- | --- | --- | --- |
| `project.schema.json` | adopting project owner | validator and delivery coordinator | project paths/commands must resolve at fixed SHA |
| `requirement.schema.json` | product/spec owner | implementation, review and validator | stable ID; acceptance and trace updates require Change |
| `task.schema.json` | delivery owner | Agent/implementer and validator | command arrays and scope must match authorized task |
| `change.schema.json` | decision owner | affected artifact owners | impacted requirements and revalidation are mandatory |
| `evidence.schema.json` | verifier | reviewer and Portfolio reporter | immutable attempt; never overwrite failed evidence |
| `portfolio.schema.json` | campaign owner | portfolio validator | expected project count and fixed SHAs must match inputs |
| `portfolio-result.schema.json` | portfolio reporter | project owners and system reviewer | all-selected-project Pass rule and per-project gates are validated |

Schema versions `1.0` and `1.1` share stable artifact URN `$id` values. Version 1.0 remains accepted without migration; version 1.1 adds topology, repository/component references, manifest placement and gate-specific evidence. Producers MUST emit one declared version and MUST NOT mix shapes. A JSON Schema `default`, if later introduced, is annotation only and must never populate or migrate data.

Only Project and Task additionally accept `1.2`, with the explicit
[repository-coordinate and migration contract](../standards/tasks-and-implementation.md#project-and-task-12-coordinates).
Other artifact versions and Package path identities are unchanged; acceptance by
the schema validator does not authorize an unsupported execution consumer.
