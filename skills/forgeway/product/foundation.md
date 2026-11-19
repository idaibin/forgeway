# Forgeway Product Foundation

## Product definition

Forgeway 是唯一现行的 AI 原生软件交付产品，产品范围覆盖从 PRD 与产品需求、设计、研发、测试到验收和交付的完整研发链路。它从一个想法、一个空目录或一个已有仓库开始，固定项目事实、权威和目标，再根据项目类型、当前阶段、任务内容、已有资产与验收要求，选择适用的工作流程和专业能力。具体工具与执行方式由宿主在当前可用能力和授权范围内解析；Forgeway 组织各阶段的输入、执行、证据和门禁，形成可复查、可恢复的交付结果。

PRD 是产品需求的一种载体，既有需求和设计资产可直接引用或按需维护。测试是验证证据的一部分；验收依据已确认的需求、适用标准和实际结果判断。当前宿主缺少能力或必要证据时，受影响的交付结论保持 `Not verified`。

Forgeway 从具体问题和可验收结果出发，依据项目现状选择并调整工作路径。功能开发、测试和 Bug 修复可能从不同阶段进入，也可能在诊断后合并处理；只执行当前目标所需的需求或设计维护、Task、实现、检查、回归和验收。文档维护、任务账、仓库资产查询、截图和录屏按实际作用选用，分别保留来源与证据层级，不成为每次必经的清单。发现失败或缺口时，先判断原因、影响范围和可用的授权内修复方式，更新受影响的任务与验证范围并继续执行；只有缺少决定性权限、权威、能力或目标证据时，才暂停依赖它的动作，保留 `Not verified` 和恢复条件。关闭工作仍须回读对应目标的实际结果，并满足适用门禁。

Forgeway 不是只提供规范的资料库，也不是只负责把任务转交给其他工具的协调层。规范、Artifact、工作流、能力匹配、结果校验和门禁都是产品内部能力；用户面对的是一个项目感知的交付入口。

Platform Spec、Project Delivery System（PDS）和 AEF 是历史设计阶段，不是当前产品、外部依赖或运行前置条件。它们的演进记录和设计背景属于 `ai-handbook`；当前执行只以 Forgeway 及目标项目的现行权威为准。

## 用户入口和交付方向

用户可以用两种入口启动同一个 Forgeway 产品：

- **新项目入口**：给出产品想法、目标和可用的空目录。Forgeway 固定范围和 owner，建立缺失的产品、需求、设计、领域、数据、接口、架构和测试资产，并在进入实现前请求必要确认。
- **现有项目入口**：给出已有仓库或目标目录。Forgeway 先固定 basis，发现并引用项目已有的产品文档、源码、迁移、原生接口、设计、测试和运行证据，再区分已存在、需扩展、缺失和不适用的资产，识别 Gap 和需要用户决定的冲突。

已在生效项目指导中采用 Forgeway 的项目，其普通软件交付任务自动进入适用的协调路径，无需每次标注 Skill。未采用的项目也可通过自然语言的软件交付协调请求使用 Forgeway；各专业 Skills 可按职责独立或组合使用，不要求先采用 Forgeway。宿主自动选择不增加授权、不写入采用配置，也不把单个专业任务变成完整流程。具体触发边界见[能力组合标准](../standards/project-capabilities.md#activation-and-independent-skills)。

两条入口都可以沿两个方向推进：

- **自顶向下**：已确认的产品意图 → Requirement → 领域/数据/接口/UI/架构引用 → Task → 实现 → 验证 → 审查 → Evidence → 交付。
- **自底向上**：固定项目 basis → 发现项目资产和实现事实 → 与已有产品意图对照 → 标记 Gap、推断或待决策 → 用户确认 → 补齐或修正产品/需求资产 → Task、实现、验证、审查和交付。

代码、迁移或测试只能证明实现及验证事实，不能在没有确认的情况下自动成为产品意图。自底向上发现的结论必须保留来源和证据等级；缺失、冲突或无法复查的内容保持 `Not verified`，不得静默补全。

## 用户体验与内部能力

Forgeway 自有 CLI 也提供构建产物打包与安装入口：Skill 安装时将 `forgeway` 命令指向已安装运行包，显式构建成功后才可调用 `pack create`。见 [Pack and Skill CLI Installation](./features/REQ-FORGEWAY-003-pack-and-cli-install.md)。

Forgeway 自有 CLI 可提供边界明确的机器能力。浏览器定步录制由调用方先固定流程、目标和权限，CLI 在单次运行中执行并核对 MP4；它不取得目标项目的页面或视觉权威。具体行为见 [Deterministic Browser Recording](./features/REQ-FORGEWAY-002-browser-recording.md)。

Forgeway 内置真实页面 Mock 验证能力：按项目、环境和场景补齐缺失数据，显式保留可用的真实只读接口，并可启动、保留独立本地浏览器。目标项目继续拥有页面模块和业务样例，Mock、真实接口与页面消费分别验收。见 [Browser Mock Verification](./features/REQ-FORGEWAY-005-browser-mock.md)。

Forgeway 也可对已有构建产物执行离线检查，记录文件哈希、可观察架构与 ZIP/TAR 成员和路径安全结果；检查结论只覆盖传入产物。具体行为见 [Artifact Inspection](./features/REQ-FORGEWAY-004-artifact-inspection.md)。

用户只需要向 Forgeway 提供项目或目标，查看已发现的事实和缺口，确认产品决策，授权范围内的变更，并审阅结果与证据。Forgeway 应明确当前可执行的下一步、所需输入、影响范围，以及受阻动作的原因和恢复条件。

专业 Skills 是 Forgeway 内部可复用的能力 owner。Forgeway 根据当前可用的能力合同，把一个已接受的 Artifact package 交给能承担下一阶段的能力；用户不需要手工编排 Skill，也不应把 Skill 名称当作产品流程。能力选择属于宿主运行时事实，不写成固定的 Skill 清单、项目绑定、模型、Provider、CLI、版本、安装路径或隐式 fallback。

当能力不可用或多个能力无法区分时，Forgeway 必须分别返回 `capability-unavailable` 或 `capability-ambiguous`，而不是按品牌、可用顺序或隐藏偏好猜选。缺失能力有宿主可验证的来源且当前授权包含安装时，宿主可按需下载并重新解析；Forgeway 不内置或代管专业 Skills。能力输出必须带 basis、范围、决策、变更路径、证据和终态，才能交给下一阶段。

## Forgeway 负责什么，项目负责什么

Forgeway 负责一条完整的项目感知交付链：

- 固定项目 basis，发现项目组成、已有资产、owner 和适用范围；
- 创建、扩展、引用和维护缺失的项目资产，并把 Gap、冲突和推断显式化；
- 组织产品、UX/UI、领域、数据、接口、架构、测试、实现、验证、审查、Evidence 和交付；
- 为每次 handoff 约束输入 Artifact、能力边界、确认、权限、结果和恢复信息；
- 只在证据满足相应 gate 时推进结论，不把源码、构建或静态检查误报为运行或生产事实。

目标项目继续拥有自己的产品事实、业务规则、领域模型、源码、数据库迁移、原生 API/事件定义、UI 设计权威、配置、测试和运行真相。Forgeway 优先发现并引用这些原生权威，不复制其正文或建立平行 DTO、Schema、设计系统或业务模型。缺失资产可以在得到对应 owner 授权后创建在目标项目认可的位置；Forgeway 不强制统一的 `forgeway/` 或 `.forgeway/` 文档目录，运行期状态与正式项目资产分开处理。

## 事实、意图和决定的分类

| 分类 | 定义与来源 | 处理规则 |
| --- | --- | --- |
| **Implementation fact**（实现事实） | 在固定 basis 上由源码、迁移、原生接口、测试、命令或已授权运行检查直接观察到的事实。 | 保留来源、命令和 evidence；它描述当前实现，不自动改变产品目标。 |
| **Product intent**（产品意图） | 由产品 owner 明确确认，或由目标项目已有产品权威明确表达的用户行为、范围、规则和验收。 | 作为 Requirement 和后续交付判断的产品事实；与实现不一致时登记 Gap 或 Change。 |
| **Inference**（推断） | Forgeway 根据实现事实、现有资产或上下文提出的可能解释、补全或建议。 | 必须标为推断并说明依据；不能冒充已确认意图，也不能直接授权变更或交付。 |
| **Decision required**（待决策） | 会影响行为、范围、权限、数据、失败语义、兼容性或验收，但尚未由有权 owner 选择的事项。 | 停止受影响阶段，向用户列出选项、影响和所需 owner；未确认前不得进入相应实现或交付 gate。 |

权威冲突不通过复制、兼容层或静默改写来解决。目标项目的原生权威、Forgeway 交付合同和外部审查建议必须分别保留；无法判定的关系进入 Gap 或 `change-required`。

## 确认、验证和交付门禁

Forgeway 的门禁是用户和系统都可识别的产品边界：

- **Basis/authority gate**：在开始推断或修改前固定目标身份、basis、范围、owner 和既有 dirty 状态。basis 漂移或权威冲突时停止并返回 `basis-conflict`。
- **Product confirmation gate**：产品行为、范围、规则或验收仍含有未确认的推断时停止并返回 `product-confirmation-required`。
- **Source mutation gate**：源码、迁移、生成物或测试的修改必须有已接受的 Requirement/Task、精确 include/exclude 路径、权限和验证命令；缺失时返回 `source-mutation-confirmation-required`。
- **Verification gate**：自动化、Artifact、运行时和审查证据分层记录。证据缺失或环境未实际执行时保持 `Not verified`，不能以计划、静态文本或模型判断代替。
- **Delivery gate**：commit、merge、push、发布、部署或远端改名必须有独立的交付授权；没有授权时返回 `delivery-authorization-required`，验证通过不等于已交付。
- **Environment gate**：浏览器、登录、数据库、Provider 或生产环境不可用或未授权时返回 `environment-blocked`，不扩大权限、不自动换能力、不重试到改变边界。

每次运行都必须留下可恢复的 basis、Artifacts、决策、结果和 Evidence。门禁只约束依赖它的结论和动作；失败先在授权范围内诊断、修复并复验受影响部分，仍无法闭合时进入 Gap 或 Change，同时继续独立且已授权的工作。任何未验证项都不能被最终结论隐藏。

## 产品完成标准与边界

Forgeway 的一个交付结果只有在以下条件同时满足时才可标记为完成：

- 从新项目意图或现有项目仓库均可进入同一条生命周期，不要求先准备 Platform Spec、PDS 或 AEF；
- 项目原生权威被发现、引用并保持唯一 owner，未因 Forgeway 的便利而复制成第二套事实；
- 产品意图、实现事实、推断和待决策事项可区分，必要确认已经记录；
- 至少完成适用的实现、验证、审查和证据门禁，未执行的浏览器、部署或生产状态仍为 `Not verified`；
- 结果可以依据固定 basis 和持久 Artifacts 恢复，不依赖同一个模型的隐式记忆。

Forgeway 不拥有目标项目业务代码、数据库、原生接口、UI 设计、凭据、部署平台或生产发布；不维护固定 Skill catalog，不绑定某个项目、语言、模型、Provider、CLI 或安装方式，也不以自动修复、自动批准或隐式 fallback 代替用户和项目 owner 的决定。
