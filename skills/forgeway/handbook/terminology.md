# Terminology

| 术语 | 含义 |
| --- | --- |
| **Forgeway** | 当前唯一的 AI 原生、项目感知软件交付产品；从项目入口贯通发现、资产、实现、验证、审查、Evidence 和交付。 |
| **Platform Spec / Project Delivery System / PDS / AEF** | Forgeway 之前的历史设计阶段或名称，不是当前产品、运行时依赖、前置仓库或权威来源。 |
| **Entry** | 用户以产品想法、空目录、已有仓库或明确交付目标启动 Forgeway 的入口。 |
| **New-project entry** | 从想法或空目录建立项目范围、owner、产品意图和缺失资产的入口。 |
| **Existing-project entry** | 从已有仓库或目标目录固定 basis、发现原生资产、识别实现事实和 Gap 的入口。 |
| **Top-down** | 从已确认的产品意图，经 Requirement、合同和 Task 向实现、验证、审查和交付推进的方向。 |
| **Bottom-up** | 从现有项目的固定 basis 和实现事实出发，与产品意图对照并识别 Gap、推断和待决策，再回到确认和交付的方向。 |
| **Project asset** | 由目标项目认可的 owner 维护、能被后续阶段消费或引用的正式项目事实，例如产品文档、领域模型、迁移、原生接口、设计和测试。 |
| **Asset baseline** | 在固定 basis 上发现的项目资产、owner、来源、适用性、状态和冲突摘要；它索引事实，不取代事实本身。 |
| **Artifact** | 由明确 owner 维护、被下一阶段消费并能绑定 basis、状态或 Evidence 的持久产物。 |
| **Authority** | 对某一类事实拥有最终解释权的目标项目 Artifact、实现或明确的 Forgeway 交付合同。 |
| **Target-native authority** | 目标项目自己的产品定义、领域模型、数据库 migration、原生 API/RPC/event 定义、`DESIGN.md`、源码、测试和运行证据；Forgeway 优先引用而不复制。 |
| **Basis** | repository identity、固定 SHA 或明确的当前工作树/空项目状态、范围、环境和 dirty 排除集组成的可复查基线。 |
| **Product intent** | 已由产品 owner 确认，或由目标项目现有产品权威明确表达的用户行为、范围、规则和验收。 |
| **Implementation fact** | 在固定 basis 上由源码、迁移、原生接口、测试、命令或已授权运行检查直接观察到的当前实现事实。 |
| **Inference** | Forgeway 根据事实或上下文提出的可能解释、补全或建议；必须标注依据，不能冒充 Product intent。 |
| **Decision required** | 会改变行为、范围、权限、数据、失败语义、兼容性或验收但尚未被有权 owner 选择的事项；受影响阶段必须停止。 |
| **Requirement** | 具有稳定 ID、owner、可观察验收和追踪关系的产品需求单元。 |
| **Task** | 在固定 basis、授权路径、输出和验证命令约束下可独立执行的变更单元。 |
| **Capability** | 宿主当前可用、能声明输入、输出、权限、变更边界和 Evidence 类型的专业执行能力。 |
| **Skill** | 一种可复用的专业 Capability；在 Forgeway 内部承担产品、领域、UI、实现、审计、审查或交付等语义 owner，不是用户必须手工编排的产品流程，也不是固定目录清单。 |
| **Trace** | Requirement 到领域、数据、接口、UI、实现、测试和 Evidence 的引用关系。 |
| **Gate** | 阶段准入或准出的可判定条件，包括产品确认、源代码修改授权、验证、环境和交付授权。 |
| **Product confirmation gate** | 在行为、范围、规则或验收仍含有推断或待决策时，要求产品 owner 确认并阻止源代码修改的门禁。 |
| **Source mutation gate** | 要求已接受 Requirement/Task、精确 include/exclude 路径、权限和验证命令后才允许修改目标源代码的门禁。 |
| **Delivery gate** | 要求独立授权后才允许 commit、merge、push、发布、部署或远端改名的门禁；验证通过不等于交付。 |
| **Gap** | 产品意图、实现事实或 Evidence 之间已识别但尚未解决的差异。 |
| **Change** | 经过授权、需要改变已确认产品行为、合同、范围或交付基线的变更记录。 |
| **Evidence** | 绑定 basis、来源、命令或运行环境的可复查结果；缺失时保持 `Not verified`。 |
| **Not verified** | 尚未直接获得足够来源或运行证据的状态，不表示通过、失败或已解决。 |
| **Profile** | 某技术栈应提供哪些原生证据的采用指南，不是通用模型、项目或 Skill 的固定分叉。 |
| **Portfolio** | 一组项目采用或交付验证的 campaign 输入与结果；不改变单个目标项目的事实 owner。 |

`OpenAPI`、数据库 migration、生成前端客户端和 `DESIGN.md` 仍属于目标项目自己的原生权威或派生产物。Forgeway 可以记录引用、owner、basis、状态和证据，但不把它们复制成本体系的第二套 API、数据库、领域或 UI 事实。
