# UI Components and Design Tokens Standard

本标准定义目标项目如何拥有自己的 UI 公共层、隔离第三方组件库，并在确有机器消费者时采用 Design Token 或组件 Registry。它补充 [`ui.md`](./ui.md)，不取代目标项目的 `DESIGN.md`、feature UI spec、真实组件源码、类型或运行证据。

## Authority and dependency direction

- 项目 `DESIGN.md` MUST 拥有共享视觉语义、治理规则、命名边界和采用状态；feature UI spec MUST 继续拥有页面布局、状态、响应式、交互和验收。
- 真实组件源码和类型 MUST 拥有 Props、slots、events、DOM、键盘行为和运行实现。组件文档或 Registry 不得复制完整 API 并成为平行真值。
- 项目采用结构化 Design Token 源时，token 文件 MAY 拥有可序列化的值与引用；`DESIGN.md` MUST 记录其 owner、路径、分层、生成和消费边界，而不是人工复制同一组值。
- 推荐的逻辑依赖为 `Component -> Semantic -> Primitive`。这是 Forgeway 的推荐架构合同，不得表述为任何外部格式强制的唯一分层。
- `Primitive` SHOULD 取代容易误解为跨品牌共享的 `Global`。项目 MAY 将 Primitive 进一步区分为真正共享的 core primitives 与品牌 primitives。
- 业务页面 MUST 消费 Semantic Token。Primitive 只能在 token 定义、生成器或经声明的 adapter 中使用；Component Token 只能由已准入的共享组件按需消费。

## Accepted product feedback

Performance, loading, refresh and recovery changes MUST preserve accepted product
copy, layout and interaction. A real error or a test finding is diagnostic evidence,
not approval to add inline warning text, banners, toasts, retry controls, disabled
states or submission guards. Use the existing feature's accepted failure behavior.
Before changing source, each addition or change to visible copy, controls,
feedback type/timing or its placement MUST trace to the original user request
or an explicitly accepted Product/UI decision in the existing task or authority.
This applies to failure-only paths and shared feedback components. A candidate
spec, implementation or test supplies no approval. A reachable change with no
such authority MUST be corrected before review can pass.

Diagnostic text, test progress, fixture labels and temporary failure notices MUST
stay in external verification evidence rather than the product interface. A synthetic
record, debug control or demonstration notification MUST NOT become application code
or a product interaction. Verification must observe the real accepted failure state,
not alter that state merely to make a test result visible.

Product surfaces MUST NOT render raw exception messages, stack traces, transport
errors, response bodies or internal state as user feedback. This applies to inline
text, dialogs, toasts and shared request handlers, including fallbacks for unrecognized
errors. Use the project's accepted failure behavior and map documented error codes
to approved copy where that behavior calls for feedback. Use server-provided copy
only when the native contract explicitly designates that field for end users and
Product/UI accepts its use. Keep technical details in the existing sanitized
[diagnostics channel](security-and-privacy.md#operational-diagnostics).

For changes that affect failure handling, verification MUST exercise the affected
user entry with a recognized business rejection and an unexpected error where
applicable. Compare the rendered result and notifications with the accepted UI,
including expected absences of extra text, controls and layout regions. Check for
raw diagnostics, preserve user input as specified, and record failure
separately from success and successful empty results.

## Project-owned UI boundary

- 前端项目 SHOULD 声明项目拥有的公共 UI 路径，惯例为 `components/ui` 或框架等价目录，并声明一个或多个稳定 public import。
- 公共 UI MAY 同时持有第三方控件适配、基础组件和无业务规则的组合组件；“第三方／自定义”或封装层数不构成独立目录的充分理由。布局外壳、业务数据与规则按其实际 owner 归属；跨页面复用本身不使业务组件成为基础 UI。具体目录沿用项目决定，不强制建立 `common` 或统一合并已有目录。
- 业务代码 MUST 通过该公共层消费被项目列为受控的 Button、Input、Select、Dialog、Form control、feedback 和其它高频交互组件；不得直接绕过到第三方 UI primitive。
- public import MAY 是逐组件路径。标准不得强制总 barrel；项目 MUST 根据 tree shaking、client/server boundary、bundle 和框架约束决定是否提供聚合入口。
- 使用聚合入口时，内部组件 SHOULD 直接引用其实际依赖，避免回引自身入口形成循环；图表、编辑器等重型能力按项目加载边界单独消费。调整入口 MUST 同步第三方适配白名单、真实调用方、测试 harness 和路径文档，并检查公开消费者及越界反例。
- 本地 wrapper MUST 拥有至少一项真实职责：稳定语义、token 映射、状态策略、可访问性、行为、跨页面复用或底层替换边界。只改名或无差别透传的零价值 wrapper MUST NOT 准入。
- Component Token 不是组件准入前提。仅改变颜色、字体、圆角或间距且第三方主题 adapter 已能稳定满足时，SHOULD 优先使用 Semantic Token 映射而不是再包装一层。
- 原生 hidden input、无交互布局元素和具备明确语义 owner 的专用 DOM MAY 作为项目记录的例外；例外不得被扩展为业务层任意重建基础控件的许可。

## Third-party adapters and escape hatches

- 第三方 UI 库 MUST 只在项目声明的 adapter roots 内直接引用；业务代码必须使用项目 public import。项目 MAY 将图标、图表、地图或编辑器作为不同依赖类别分别治理。
- 第三方库的主题变量 SHOULD 由 Semantic Token adapter 映射；不得在项目 token 源中复制第三方完整内部 token 系统。
- 深层内部 import MUST 默认禁止。只有目标依赖的公开合同明确支持、版本和构建边界已固定且项目 validator 覆盖时，才 MAY 作为有期限例外。
- 对虚拟表格、富文本、地图等尚未准入的复杂能力，项目 MAY 使用 controlled escape hatch。每个例外 MUST 记录精确 consumer path、dependency/import、owner、reason、review condition、expiry 或 retirement decision。
- 逃生通道不得通过宽域 lint disable、目录级永久白名单或无 owner 注释扩散。

## Adapter replacement and consumer preservation

Before replacing a library component or changing a shared adapter, the implementation
owner MUST trace reachable consumers and preserve their accepted value/null shapes,
event payloads and invocation count, callback/Promise failure behavior, slots,
imperative methods, selection identity, overlay mounting and keyboard/focus behavior.
Matching component names or a successful template compile MUST NOT establish API
equivalence. Unsupported props and fallthrough attributes MUST be checked against
the effective rendered consumer; a stale prop or a test matching commented code does
not prove that a required style or interaction still works.

Select the affected consumer seams for regression: for example input/clear, one
upload notification per action, failed validation, pagination slots, merged cells or
image preview. Execute the actual adapter and consumer path where possible; helpers
that bypass their integration do not close that seam. Shared visual changes MUST
also distinguish the shared surface/token owner from approved feature-local
exceptions. Theme verification MUST cover the affected persisted preference and
configuration states, including missing or stale theme values when reachable;
testing only a newly initialized profile cannot prove an existing user's state.

For source-based layout corrections, the owner MUST identify which surface belongs
to each semantic group before changing padding or wrappers. One enclosing card and
several independently surfaced cards are different compositions; using the same
primitive does not establish equivalence. A shared control's library defaults MUST
be checked in its rendered consumers, including effective size, typography, parent
background, value/clear behavior and accessible name. Raw design measurements retain
their own scale and source identity; project dimensions are not portable defaults.

For affected overlays, resolve the library container and content owners for height,
scrolling and safe-area inset. Verify that close, fields and terminal actions remain
reachable at the applicable constrained viewport and with content growth, and that
closing restores focus. Parent and child inset consumption MUST NOT silently double
the accepted safe area. A desktop resize or injected inset proves only that simulated
layout, not a physical keyboard, device safe area or native WebView.

## Components documentation and Registry

- 项目 SHOULD 维护人类可读的 `components.md` 或现有等价文档，记录组件语义、复用边界、必须状态、可访问性底线、准入规则和反例；不得镜像完整 Props、slots 或 events。
- 仅当存在 named owner、producer、非 LLM consumer（non-LLM consumer）、semantic version、executable validator、drift policy 和 retirement rule 时，项目 MAY 增加 JSON 或 YAML Component Registry。
- 同一 Registry MUST 只有一个人工维护格式。其它 JSON、YAML、Markdown 表格或类型投影必须由生成器产生或删除，不得双写。
- Registry SHOULD 只记录稳定机器事实，例如 component id、source owner、public import、status、semantic roles、required states、token groups、underlying dependencies 和 bounded exceptions。
- Registry validator MUST 至少检查 schema/version、路径 containment、重复 id/import、source 与 public import 可解析、声明目录覆盖、受限依赖边界、例外完整性和 stale source references。
- LLM 读取不是单独创建 Registry 的充分理由。若没有非 LLM gate，AI MUST 读取 `components.md` 与当前源码，项目不得创建声称机器权威的 sidecar。

## Optional token pipeline

- 简单项目 MAY 只使用 `DESIGN.md`、Semantic CSS variables 和真实组件源码。标准不得强制品牌、暗色主题、Component Token、token package 或独立构建链。
- 采用结构化 token 源的项目 MUST 声明 source format、supported subset、builder、generated outputs、validator 和消费方。在实际构建验证前，MUST NOT 声称完整兼容某个 DTCG 或工具版本。
- DTCG、CTI 或其它外部约定 MAY 作为格式与命名参考；项目 MUST 明确其实际采用子集。外部标准不得自动成为项目 token authority。
- CSS variables、TypeScript constants、主题文件和第三方 adapter 若声明为 generated，MUST 由同一权威 token 源重建并保持不可手改。
- CI MUST 重新生成并检查漂移；仅验证 JSON 语法不得证明 CSS、类型、主题或第三方 adapter 已同步。
- Token usage gate MUST 区分 Primitive、Semantic 和 Component，而不能只检查 `var(...)` 或禁止硬编码值。业务页面引用 Primitive、未准入 Component Token 或未知 token 时必须失败。
- Token gate MUST 拒绝未知引用、循环引用、Component 到 Primitive 的越层引用，以及 authored CSS custom-property self-reference；生成文件中不存在自引用不能证明手写样式没有自引用。
- 只有至少两个真实项目需要同步发布同一 token 边界，且版本、兼容、发布和回滚 owner 已存在时，才 SHOULD 抽取跨项目 token package。

## Page contracts remain separate

- Design Tokens 只拥有颜色、字体、间距、尺寸、形状、阴影、层级和动效等设计值；不得拥有页面信息架构、权限、状态机、交互流程或验收。
- Page/UI contract MUST 继续记录页面区域、组件选择、loading/empty/error/populated、responsive、权限呈现、交互和验收。
- Markdown 是默认的人类 UI 合同。只有目标项目已声明非 LLM consumer、schema、validator、drift 和 retirement 时，才 MAY 增加 Page UI JSON/YAML；Forgeway 不要求项目为 AI 单独建立该格式。
- Build、lint、token generation 和 Registry validation 只证明各自静态边界。键盘、focus、responsive、theme、视觉和真实交互仍需对应 browser 或 desktop evidence；未执行项保持 `Not verified`。
- 声称视觉等价时，immutable evidence MUST 绑定当前实现 basis、任务拥有的截图字节和 viewport/state；baseline 与 candidate 不得静默覆盖。全图 RMSE、像素相似度或其它聚合图像指标是 diagnostic only，不能替代关键状态、可访问性、computed style 和 geometry 断言。容差必须来自页面合同或已接受基线，不得把某个项目的 `1px` 规则升级为通用常量。
- 证据采集 MUST 到达真实可访问的目标状态或页面。为截图方便而使用不可达 DOM、拼接失真的 full-page capture 或静态 mock，不得证明运行等价；限制必须记录为 `Not verified`。

## Adoption and validation minimum

采用本标准的项目 MUST 在靠近实现 owner 的 adoption record 中声明：

1. UI owner root 与 public imports；
2. 受控组件清单与准入/退役规则；
3. restricted third-party imports、adapter roots 和 bounded exceptions；
4. `DESIGN.md`、feature UI spec、token source、generated outputs 和源码的职责边界；
5. Registry/token pipeline 是否 applicable；不适用时记录理由；
6. 项目原生 lint、registry、token generation、drift、type/test/build 和 runtime evidence 命令；
7. runtime evidence 的 basis、不可覆盖策略、关键状态/geometry/assertion 及聚合图像指标用途；
8. 当前 basis、已验证范围和 `Not verified` 边界。

Implementation owner MUST 在新增公共 UI 组件、直接引入第三方 UI 依赖或新增 token 之前，先核对 adoption record 与当前源码。边界缺失、冲突或 stale 时进入 UI stop state，由 UI/Design System owner 决定，不得由实现 Agent 自行创建第二套组件层或 token authority。

## Shared motion and overlay lifecycle

For an authorized shared-motion change, the target project's Product/UI authority MUST
own preference precedence, unknown/capability-missing behavior and the affected state
matrix. Numeric timing, sampling, thresholds and cache policy MUST remain project-owned.
The implementation SHOULD map one application policy through route, teleported-library
and applicable scripted consumers while preserving loading indicators, positioning,
keyboard behavior and business requests. External embedded surfaces retain their owner.

Reusable module, shell and form/request-session lifetimes MUST be distinguished where
reuse or asynchronous preparation changes an overlay. Verification MUST cover the
changed close/deactivation/reopen boundary using the library's actual callback order;
old responses and completion events MUST NOT affect a newer session. First-painted
shell/mask/content, hit-testing, focus and perceived latency claims require matching
rendered evidence. Component fixtures and zero-duration declarations alone do not
establish those claims. Select only the criteria affected by the change.
