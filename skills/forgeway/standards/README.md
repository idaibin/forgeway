# Standards

本目录是强制规范的唯一 owner：

- [工作流 Stage Contract](./workflow-stages.md)
- [Project Standards and Capability Dependencies](./project-capabilities.md)
- [Workspace Bootstrap v1](./workspace-bootstrap.md)
- [Project Collaboration and Personal Profile v1](./project-collaboration.md)
- [产品和需求](./product-and-requirements.md)
- [业务场景与复用](./business-scenarios.md)
- [追踪与 Artifact](./traceability.md)
- [接口与数据](./interfaces-and-data.md)
- [API Contract Skill](./api-contract-skill.md)
- [Default HTTP API Profile v1](./default-http-api-profile.v1.json)
- [UI](./ui.md)
- [前端性能验证](./frontend-performance-verification.md)
- [Frontend CSS and Markup](./frontend-css.md)
- [UI Components and Design Tokens](./ui-components-and-tokens.md)
- [任务和实现](./tasks-and-implementation.md)
- [变更管理](./change-management.md)
- [系统基准测试](./system-benchmarks.md)
- [AI E2E](./ai-e2e.md)
- [维护](./maintenance.md)
- [不可达代码清理](./dead-code-cleanup.md)
- [证据与完成定义](./evidence.md)
- [安全与隐私](./security-and-privacy.md)
- [Code Design 与基础检查清单](./code-design.md#foundation-checklist)
- [Vue profile](./profiles/vue.md)
- [React profile](./profiles/react.md)
- [Node.js profile](./profiles/node.md)
- [Java profile](./profiles/java-fullstack.md)
- [Rust profile](./profiles/rust-fullstack.md)

`MUST` 是体系合规要求，`SHOULD` 允许有记录的例外，`MAY` 是可选能力。Workflow 只按 Stage Contract 排序并应用这些规范，不得建立第二套规则。

采用时先读[规则适用性与验证分层](project-capabilities.md#rule-applicability-and-verification)：
基础原则适用于所有项目，领域规则按当前切片启用；确定性检查与人工/AI 验收分别提供
各自能证明的证据。Handbook 解释、Skills 执行、CLI 检查、Forgeway 协调，均引用原 owner。

Workspace 按显式 project type/per-app stack 消费共用业务场景/安全/代码设计与对应 profile；
映射由 `tooling/workspace.mjs` 唯一维护，CLI 合同见 Workspace Bootstrap。
已有项目保留原生选型与规范，profile 不是自动迁移或框架脚手架。
