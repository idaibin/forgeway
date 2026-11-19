# REQ-FORGEWAY-001 Portable Workflow Validation

## Goal and implementation slice

验证 Forgeway 能否作为独立、宿主可适配的软件交付规范与流程编排层，在不携带真实项目、模型、CLI 或账户状态的前提下处理显式提供的目标仓库。

## Users and scenarios

宿主 Agent 读取固定目标 basis，按当前可用能力选择一个最近 owner，生成或核验交付 Artifact，并在能力、授权或证据缺失时明确停止。

## Confirmed decisions and rationale

- 核心合同语言、框架、宿主、Provider、模型和 CLI 中立。
- 仓库根目录作为 Forgeway Skill 包，随包保留 Forgeway 自有规范、CLI 与合同；显式入口负责路由和交接，不维护外部 Skill 清单或安装状态。
- 找不到能力时返回 `capability-unavailable` 和能力描述；宿主有可信来源及安装授权时按需下载后重新解析，否则由用户通过当前宿主安装或启用。
- 真实项目与外部审查记录只属于运行时忽略证据，不进入 portable source、模板或 fixtures。
- 客户端后台验收按目标、操作与窗口/会话状态分别取证；宿主选择操作能力，Forgeway 传递不抢前台与输入约束，并分别消费能力发现、实际结果、非干扰和恢复证据，不内置平台操作器。
- 手写 OpenAPI 只有在目标项目选择它作为 contract-first 权威并将 owner 接受绑定到精确版本与内容 hash 时成立；生成 OpenAPI 只有在项目已采用相应生成链时成立。权威状态与结构、实现、消费和运行验证分别记录。
- 后台会话协议交接绑定应用构建、协议、工作区/会话、任务与工具/路径权限、提交身份及进度/终结证据；复用匹配的资格验证，运行中任务、审批、断线与不确定提交分别收口，不重放含糊的提交。协议状态不替代桌面同步或截图。
- 客户端的项目导航、输入、发送和截图分别验收；截图失败只阻断视觉结论，继续已授权且前提成立的语义操作。发送依赖文本被应用接受，项目选择不能替代输入或消息提交证据。

## Scope and non-goals

包含独立 Skill 触发、阶段选择、授权门、Artifact 合同、中性模板、静态 portability 校验和合成 fixtures。

不包含 Forgeway 内置外部 Skills、固定模型路由、外部 CLI 注册表、真实项目快照、生产发布或凭据处理。

## Main and failure flows

- Main：冻结目标 basis -> 解析当前能力 -> 选择一个 owner -> 执行或交接 -> 分层验证 -> 输出状态与证据。
- Failure：能力缺失、basis 漂移、contract 无 owner、命令失败、artifact 缺失、runtime 阻塞或证据不完整时，输出明确停止状态和下一 owner。

## Acceptance criteria

1. 不指定 external review 或 evaluation 时，输出不出现任何 Provider、模型、外部 CLI 或项目历史。
2. 仓库名、路径、语言和框架不得隐式选择 evaluation。
3. Skill 不依赖固定 Skill 根目录、目录层级、版本、digest、外部可执行文件或发现命令。
4. 缺少下一阶段能力时返回能力描述和安装/启用提示，不猜测包名或 fallback。
5. 通用模板只包含合成身份、中性 profile 和项目原生命令占位符。
6. 真实项目、账户、模型、CLI 与外部审查 evidence 不进入受控源码。
7. portability 负向 fixtures 能阻止项目、Provider、模型、CLI、宿主路径和固定 Skill 绑定回流。
8. Skill/Schema/semantic/link validators 与合成 fixtures 全部通过；安装产物能找到 Forgeway 自有规范与 CLI。
9. 当验收要求后台客户端操作时，交接保留精确动作、前台/焦点约束、允许副作用与恢复条件；可写声明、调用成功或缩略窗口图不能替代真实结果。未执行状态和能力缺口不得被提升为通过，其他独立验收继续。
   模拟器内的手机 App 绑定虚拟设备、客体系统和实际安装产物，不要求宿主窗口；宿主锁屏、设备操作、录屏、当前源码及真机/厂商覆盖分别取证。

## Open and deferred decisions

- 非 Codex 宿主的具体安装适配器在出现真实消费者后分别定义，不进入 Forgeway Core。
- 远端发布、包命名空间和跨宿主兼容性仍为 `Not verified`。
