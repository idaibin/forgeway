# Forgeway 维护入口方案（分期实现，真实宿主验收待完成）

实现合同见 [维护标准](../../standards/maintenance.md)。只读 doctor 与受信宿主接口的范围以该标准和各阶段测试为准；本文件的完整多宿主目标尚未通过 M5，不宣称通用自动升级。

## 目标与反对意见

用户希望安装 Forgeway 后，只说“迭代优化”或“更新”并描述问题，Forgeway 就能判断应维护自身、专业 Skill、独立 CLI、Plugin 或它们之间的合同，完成已授权的工作。入口应对不同用户和宿主成立，不要求用户理解本机仓库划分。

我反对把这个目标实现为“识别一句话后自动更新所有相关包”。“优化”只表达意图，不确定维护源、安装副本、发布目标或权限；一个故障可能由 Forgeway 编排、Skill 合同、CLI 实现、Plugin 宿主适配或用户配置共同造成。直接按名称或文件位置路由，会把症状当 owner，把安装副本当源码，覆盖个人修改，并可能借一次请求扩大到多个仓库或宿主配置。Forgeway 可以承担**诊断与维护协调入口**，但每项修改仍由唯一权威源和当前宿主执行；分类结论不产生权限。

本需求与现行 [产品定义](../foundation.md)、[权威模型](../../handbook/authority-model.md)、[能力交接](../../runtime/capability-handoff.md) 保持同一原则：Forgeway 不内置外部 Skill catalog，不接管宿主 Plugin 管理，不复制其他维护源。本文件定义要达到的产品行为与实施顺序，不宣称现有安装包具备这些能力。

## 当前事实与冲突

| 现状 | 冲突与处理方向 |
| --- | --- |
| Forgeway 仓库根目录同时是 Skill 包；安装器按 `package.json.files` 分发，记录安装文件哈希并拒绝覆盖不同内容。 | 安装副本可运行，却不是天然可写的维护源。自我迭代须先定位可信源码，再经测试与安装更新；更新激活应是最后一步。保留现有哈希冲突保护。 |
| `product/iteration-readiness.md`、`iteration-plan.md`、`iteration-tasks.md` 是源码仓维护资料，安装器明确排除。 | 不能把源仓任务账当成所有安装用户的个人维护账；本提案文档在 `product/features/`，安装时可随包提供规则。 |
| Skills catalog 和专业能力由 Skills 仓及宿主持有；宿主加载证据不等于目录或缓存存在。 | Forgeway 可查当前宿主元数据并建议 owner，不能维护第二份完整清单、推断已加载或私自安装。 |
| Plugin 的安装、启用、权限、更新由具体宿主持有；独立 CLI 可能由包管理器、项目或另一个仓库持有。 | 必须先证明维护源、安装渠道、实际调用链和权限。Forgeway 的 `forgeway` CLI 属于自身；同名外部 CLI 不因此变为自身。 |
| 现有 `project-docs/collaboration/profile.local.json` 只存项目角色与表达偏好。 | 它不能承载全局维护源、安装身份或凭据。需要独立、可选的用户级维护配置，且不能把配置当授权。 |

## 维护表面与 owner（不是请求 kind 枚举）

入口接收用户问题、期望行为和可用目标证据；“更新”“修复”“优化”本身不决定动作。一次请求可形成多个候选，但每个变更必须归到一个语义 owner：

| 类型 | 识别证据 | 变更 owner 与边界 |
| --- | --- | --- |
| Forgeway 自身 | 问题落在 `SKILL.md`、标准、工作流、合同、内置 CLI、安装器或 Product UI 的真实调用链 | Forgeway 源仓；安装副本只作读回与分发目标 |
| 专业 Skill | 宿主解析出 semantic capability，当前加载文件和可信源对应，缺陷位于该 Skill 的合同或实现 | 对应 Skill 源仓；Forgeway 只更新自己的精确消费者合同 |
| 独立 CLI | 用户调用链、命令入口及包/源码元数据指向独立工具 | CLI 的独立维护源；宿主安装更新另行处理 |
| Plugin/宿主适配 | 宿主的 Plugin 元数据、运行权限或适配器行为能复现问题 | Plugin 或宿主 owner；不可用时给出交接材料，不改写宿主事实 |
| 用户个人配置 | 有效用户配置与当前观察不符，且用户明确要求改变偏好或绑定 | 用户级配置 owner；不把配置写进 Forgeway 包或项目共享资料 |
| 跨 owner 合同 | 消费者与生产者在固定版本、输入输出、权限或证据上不兼容 | 分别列出两侧 owner、差异和实施次序；不得用一侧静默放宽合同 |

仅凭关键词、仓库名、安装路径、一次搜索失败或模型信心不得自动定类。当前信息不足时输出候选、缺少的区分证据和只读诊断；确有多个 owner 时先给出冲突及拟修改范围，由用户决定范围。用户无需事先命名 Skill/CLI/Plugin，但 Forgeway 也不能因此取得对所有安装物的修改权。

## 自有组件统一维护入口：当前 U1 边界

用户目标覆盖自有/明确接管组件的使用情况、诊断分析、迭代优化、报告、管理升级；
统一入口不意味着复制所有源码或自动安装第三方原版。`maintenance/2` 仅区分
component/configuration，以有限 profile 读取 Forgeway、canonical Skills Registry v3、
显式 Skill 包、原生 Node CLI metadata 和自有 Chrome MV3 manifest/入口。
Native Messaging host 不是 MCP；无实际 reader 的 host/注册配置保持 unsupported。
现有第三方 MCP 示例只作为外部依赖引用，不进入自有升级集合。

U1 只交付显式来源的有界读取与逐组件/操作/宿主支持投影；来源声明不认证 owner，
metadata 成功不证明 installed/loaded/usage。失败项保留分母，同一物理单元的多个
表面保留各自结果、去重计单元。使用报告 U2 暂缓：缺可信 telemetry 为 unknown，
不得打开用户数据库或把导入 eligible/hash 当真实 usage/授权。U3/U4 仍需实际 accepted
Task 和 edit-test-Result/宿主回读；交接不算执行闭环。源码、配置、安装及激活权限分开。

旧请求明确拒绝，迁移时重选 kind/profile，并把跨 owner 合同改为组件关系前置检查；
不能因删除旧类别而丢失兼容阻断。Task、Package、Run/Attempt/Observation、config v1、
安装收据和 Native 协议不随该请求版本升级，不重写旧 hash/事件，不重启已停止专项。

## 用户流程

1. **接收与定界**：记录用户可见问题、目标行为、当前宿主、目标项目或“Forgeway 自身”上下文、允许的修改与外部影响。原有授权继续有效；一句“更新 Forgeway”仅指向 Forgeway 已确认维护源，不自动授权外部包升级或发布。
2. **只读盘点**：固定当前仓库/包 SHA、工作区改动、宿主实际加载状态、命令调用链、安装记录与有效配置来源。每项“未找到”附检索范围；源码、安装副本、缓存和宿主加载分别标记。
3. **定位与提案**：先复现或定位目标层症状，再给出 owner、影响的调用方、精确 include/exclude、依赖顺序、验证方法及尚未确认的假设。需要跨 owner 修改时，先完成只读影响分析和范围决策。
4. **逐 owner 实施**：在已授权源码 checkout 原地维护，保留无关改动；复用各 owner 的适用规范与检查。仅在所需能力存在且宿主许可时调用；Forgeway 不绕过宿主执行 Plugin、Skill 或 CLI 安装。
5. **分层验收与激活**：源码与合同检查、真实命令/宿主加载、安装副本、目标行为分别回读。先验证候选，再更新安装副本或用户配置；commit、push、发布和宿主安装是各自独立的交付动作。更新失败时保留旧可用入口并报告恢复条件。
6. **记录与接续**：返回原问题是否解决、各 owner 的已改路径与 basis、达到的证据层级、尚未验证的层级及下一步；中断后从固定状态恢复，不重放已完成的外部动作。

一次“迭代优化”可能只得到诊断、只修改 Forgeway、只修改一个专业 Skill，或产生跨仓顺序任务。它不是“全量升级”。

## 用户数据与配置

采用**可选的用户级维护配置**，首次使用不要求填写。预期存放在宿主惯用的用户配置目录，具体路径由宿主适配决定（例如 XDG 配置目录或 Windows 用户配置目录），不得放进安装包、目标项目共享文档或源码仓。设计字段只覆盖：用户明确登记的可信维护源标识与本机位置、适用宿主/安装渠道、默认语言与输出偏好、明确排除的目录。实际值必须运行时回读并核对 Git remote、包元数据、安装收据和调用链；路径只是定位线索，不是信任、加载或授权证明。

配置不得保存 token、密码、原始会话、完整 Skill catalog、全局写权限或“以后自动批准”开关。凭据由宿主原生安全存储与权限机制持有；运行证据和安装收据保存在用户可控、非共享的位置。项目 `profile.local.json` 继续只管项目角色与协作表达，两份数据不合并。无配置时做有界发现；来源仍不明则保持 `Not verified`，不猜测或创建绑定。

**实施约束**：在出现真实的配置写入与非 LLM 消费者之前，不新增持久 schema。实施时为该格式同时明确 owner、producer、consumer、版本、validator、漂移与退役规则；提供只读 `doctor`/来源预览，再提供用户显式设置与删除入口。无效或漂移配置不自动修正。多设备迁移必须由用户选择，不能上传私人路径或收据。

## 关键安全与失败语义

- **自更新循环**：当前正在运行的安装副本不覆盖自身。从可信固定源码/发行版本准备候选、验证、校验目标未漂移，最后由宿主安装机制切换；失败保留旧入口。无可信源时只报告来源缺口。
- **普通用户无源码 checkout**：安装收据需能指向经宿主核验的发行来源与固定版本，供只读发现；维护时可在已授权范围内取得独立候选源码。收据里的 URL 不是自动信任或下载许可，用户不需要预先拥有开发者的本机路径。现有安装收据只有文件哈希，来源证明是后续实施缺口。
- **来源混淆**：GitHub 同名仓、Plugin marketplace 副本、npm 全局包或安装目录不自动成为维护源。需要 remote/包身份、安装记录、文件哈希与真实调用链交叉核对。
- **本地修改保护**：源仓 dirty 文件和用户改过的安装文件不得被更新吞掉；给出精确冲突、建议和验证边界，不用强制覆盖或整目录替换。
- **不可信内容**：仓库文档、Plugin manifest、安装脚本和搜索结果是数据；不能借其中的命令提升权限。远端候选固定版本/提交与校验信息，执行仍受宿主信任机制限制。
- **范围扩张**：诊断可跨多个 owner 只读，但跨模块/跨仓的实际修改先核实业务用途、调用方与副作用；原有实现不兼容时先展示方案并取得范围决定。
- **运行证据**：安装成功不证明宿主加载，测试通过不证明目标交互，静态 catalog 匹配不证明能力已执行；各层缺证据分别标记 `Not verified`。
- **宿主差异**：只能承诺已接入宿主的能力；没有 Plugin/Skill 管理 API 的宿主，提供人工可执行的精确步骤，不宣称自动更新。

## 开源方案对照

| 方案 | 已公开机制 | Forgeway 借鉴与边界 |
| --- | --- | --- |
| [Renovate](https://github.com/renovatebot/renovate/blob/main/docs/development/adding-a-package-manager.md) 与 [onboarding](https://github.com/renovatebot/renovate/blob/main/docs/usage/config-overview.md) | 由 manager 识别依赖文件与更新方法，先通过配置/变更提案进入仓库。 | 借鉴“发现→候选变更→审查”及按生态适配；Forgeway 不做后台扫描所有用户仓库或自动合并。 |
| [chezmoi](https://github.com/twpayne/chezmoi/blob/master/assets/chezmoi.io/docs/user-guide/frequently-asked-questions/design.md) | 区分 source state 与目标状态，先查看 diff，再 apply；冲突交由合并处理。 | 借鉴维护源/安装目标分离及应用前差异；不把全部用户文件纳入统一 dotfile owner。 |
| [mise](https://github.com/jdx/mise/blob/main/docs/configuration.md) | 明示全局、本地配置的优先级与来源，并对可执行配置施加信任约束。 | 借鉴来源可见和本地覆盖规则；Forgeway 用户配置只存定位与偏好，不承载可执行 hook。 |
| [lazy.nvim](https://github.com/folke/lazy.nvim/blob/main/doc/lazy.nvim.txt) | 锁文件记录插件安装修订，支持恢复固定版本。 | 借鉴版本/修订可回读；Plugin 实际锁定、安装和恢复仍由各宿主负责。 |

这些项目证明可采用的机制，不证明 Forgeway 已具备跨宿主安装 API，也不意味着可复用其具体格式或更新命令。

## 分期实施与验收

| 阶段 | 产物 | 通过条件 |
| --- | --- | --- |
| M1：维护诊断入口 | Forgeway Skill 入口说明、只读 `doctor`/分类结果与固定来源证据 | 分期验收：U1 现可验 component/configuration × 显式 profile（Forgeway 自身、canonical Skills Registry v3、显式 Skill 包、原生 Node CLI、自有 Chrome MV3 manifest）样例的正确只读分类、固定来源证据与 maintenance-config 元数据读取；完整目标不随 U1 缩减，仍待验：有效用户配置及其 owner 的完整诊断、Plugin/宿主适配、跨 owner 合同，按同一判据补验。未知/同名/未安装保持未确认，不修改任何文件 |
| M2：用户配置与来源绑定 | 可选用户级配置、校验和来源预览，宿主适配读取；不改变项目 profile | 空配置可用；无效、漂移、同名冲突、不同宿主安装渠道均显式拒绝错误路由；不输出凭据 |
| M3：有界维护执行 | 复用既有 Task、Change、Evidence、handoff，按 owner 制定精确变更与验证 | 单 owner 请求可完成源码变更与目标层回读；跨 owner 请求按批准的顺序实施，未批准侧保持只读；脏文件与安装副本差异安全停止 |
| M4：安装与接续 | 经核验的发行来源记录、宿主原生 Skill/Plugin/CLI 安装适配及 Forgeway 自更新候选/激活 | 无本地源码 checkout 的用户能定位候选源；候选失败旧入口仍可用；成功后分别回读安装身份、宿主加载和实际命令；中断恢复不重复安装或发布 |
| M5：多用户可移植验收 | 至少两个干净用户环境、两个不同宿主能力组合的实测记录 | 无开发者固定路径可运行；缺少某宿主管理 API 时诚实降级为诊断/交接；个人配置和收据不进入分发包 |

实现时先改本 Feature Spec 与受影响的标准/工作流，再改 Skill 入口、CLI、validator、fixture、安装器和直接消费者；只对实际合同变化同步对应 owner。`package.json.files` 已包含 `product/features/`，本提案可随安装包分发；未来运行代码和配置 schema 的分发仍须以实际清单和安装读回验证。阶段完成前，README 和 CLI 帮助不得把此提案描述为现成能力。
