# Product and Requirement Standard

## Product

- 产品定义 MUST 描述边界、用户、问题、主流程、失败期望、非目标和成功信号。
- 决策 MUST 区分 `Confirmed`、`Assumption`、`Open`、`Rejected`、`Deferred`。
- 产品与接口资料冲突时，澄清选项 SHOULD 按可观察的产品结果表达，并引用各自依据；仅当各项是该决策真实可选的产品结果时，才提供沿用已确认产品规则、采用已接受的接口约束，或将不一致记为 `Open` 并指定下一位 owner 等选项。选择产品结果不等于确认接口合同或后端可行性，资料未核实时不得推荐为已证实方案。
- Product Artifact MUST 不包含数据库列、DTO 字段、组件 token 或实现计划。
- Feature Slice MUST 有可观察的成功、失败、权限和数据影响验收。
- 涉及业务场景的切片 MUST 按 [业务场景标准](business-scenarios.md#applicability-and-authority)
  在现有 Feature 中记录适用默认、例外与未决项，并将已确认决定传给下游；不从规范采用推导
  对已有产品的批量修改授权。

## Requirement

- ID MUST 使用 `REQ-<DOMAIN>-NNN`，一经引用不得复用。
- Requirement MUST 有单一 owner、产品引用、验收列表和当前状态。
- 每条 Requirement MUST 追到适用的数据、接口、UI、实现、测试和证据；不适用项 MUST 给出原因。
- `Ready` 只表示可进入指定实现切片，不表示已实现或已发布。
- Product readiness 只判断行为、权限、失败语义与可观察验收是否已由
  Product/Requirement owner 确认。它独立于 UI readiness；Product `Ready`
  不表示 UI 已指定或可实现，也不得提升 UI 状态。
- 缺少决定性产品事实或验收时 MUST 保持 `Open` 或 `Not verified`，不得派发实现任务。
