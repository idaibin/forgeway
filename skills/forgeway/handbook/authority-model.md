# Authority Model

## 单一语义、单一 owner

Handbook 解释架构与依据，强制规则由 standards 持有。基础/领域适用性与工具/人工证据的
分工见[规则分层](../standards/project-capabilities.md#rule-applicability-and-verification)；
专业 Skills 提供执行方法，CLIs 承担确定性检查，Forgeway 组织适用阶段和证据。说明、规则
文本和安装存在都不证明实际执行已遵守。

| 事实 | 权威 | 本体系如何引用 |
| --- | --- | --- |
| 产品目标、用户行为、业务规则 | 产品定义或 feature spec | `product_ref` |
| 需求状态与验收 | requirement record | `requirement_id` 与验收列表 |
| 领域术语、不变量、生命周期 | 项目领域模型 | `domain_refs` |
| 表、约束、索引和数据迁移 | 项目数据库 migration | `data_refs` |
| HTTP/RPC/event wire contract | 项目原生接口定义 | `interface_refs`；可指向 contract-first OpenAPI 或 code-first 生成物 |
| 视觉系统和交互状态 | 项目 `DESIGN.md` 与 feature UI spec | `ui_refs` |
| 设计源与候选预览 | 保留的 source/output identity、revision/hash 和人工 selection/approval | `ui_refs` 与 ignored visual evidence |
| Workflow Stage 顺序、适用性、entry/exit、stop 和 invalidation | `runtime/stages.json` + `standards/workflow-stages.md` | stage/registry version 与派生 next-action projection；不得复制目标事实或授权执行 |
| 仓库导航和影响关系 | 当前 basis 的 Repository Asset Graph snapshot | snapshot/query refs；必须回读 live source |
| 仓库执行指导 | 最近生效的 `AGENTS.md`/项目 guidance | guidance refs；仅在持久规则变化时修改 |
| 内部能力包目录（Skills catalog） | 固定 SHA 上的 skills 仓 catalog 包与 `skills-index.json` 语义契约 | 按 semantic capability ID 引用；宿主运行时加载证据必须包含被加载文件 hash 与 catalog SHA 的对照，安装副本或缓存的存在不构成加载证据；副本与 catalog 漂移登记 Gap，不静默覆盖、不复制正文建第二目录 |
| 实现行为 | 固定 SHA 上的源码 | `implementation_refs` |
| 交付结果 | 自动化、产物、运行、Review 和 Receipt Evidence | `evidence_ids` / result refs |

## 冲突处理

- 目标与实现不一致：登记 Gap，不静默改写任一方。
- Prompt 与 Standard 冲突：Prompt 停止，Standard 优先。
- Stage projection 与目标 Artifact 冲突：目标 Artifact owner 修正事实；Stage projection 失效并重算，禁止把投影升格为产品/API/UI/源码权威。
- YAML/metadata 索引与被引用 Artifact 冲突：Artifact owner 修正索引或目标事实，禁止双写维持兼容。
- 生成物与生成源冲突：生成源优先，重新生成并验证；生成物不能手工成为新权威。
- 缺失证据：保持 `Not verified`，不得推断通过。

## 多格式合同

每种 Forgeway 内部持久格式必须同时具备 owner、producer、非 LLM consumer、版本、validator、drift policy 和 retirement rule；只有满足这些条件的 Forgeway 结构化 Artifact 才进入本仓 `contracts/`。这条规则不限制目标项目在自己的权威路径保存 `draft` 或 `authoritative` OpenAPI；目标项目的状态、owner 接受和验证维度由其原生接口合同与项目索引记录。

`runtime/stages.json` 是 Forgeway workflow kernel 的机器 Registry，不是目标项目 Artifact，也不是 Skill catalog。其 lifecycle、consumer、validator、drift 和 retirement 由 `standards/workflow-stages.md` 声明；next-action 只作为 `authorizes_execution=false` 的派生投影。

## Topology 与位置

Project manifest 拥有 repository/component topology metadata；目标 repository 仍拥有源码、构建和运行事实。Campaign-owned manifest 由固定 `system_commit_sha` 约束，project-owned manifest 由 `manifest_repository_id` 和该 repository basis 约束。两种放置方式不改变上述事实 owner。
