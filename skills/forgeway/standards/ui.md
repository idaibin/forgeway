# UI Standard

项目拥有的公共组件层、第三方 UI adapter、可选 Component Registry 与 Design Token
分层 MUST 遵守 [`ui-components-and-tokens.md`](./ui-components-and-tokens.md)。该标准不改变
本文件中的 UI readiness、视觉来源、页面状态和 browser evidence 边界。
维护的页面结构、CSS/Sass/Less、布局 owner、wrapper 和按需视觉纠偏 MUST 同时遵守
[`frontend-css.md`](./frontend-css.md)。

- 每个有 UI 影响的 Requirement MUST 引用项目已接受的视觉源或 `DESIGN.md`，以及 feature UI spec。
- 每个 Requirement MUST 显式记录 UI `applicable` 或 `not-applicable`；后者 MUST
  有 owner/decision reference 与理由。
- 对 UI-applicable Requirement，UI readiness 只判断选定视觉源或 `DESIGN.md`
  边界、feature UI spec、适用状态、responsive、accessibility 与未决 UI 决策。
  Product readiness 不得替代或提升 UI readiness。
- UI spec MUST 描述入口、布局结构、组件、交互、加载、空、成功、失败、重试、无权限、不可用和提交中状态。
- MUST 记录 responsive、键盘、焦点、语义标签、对比度和错误恢复验收。
- 页面隐藏操作不能证明后端授权；权限必须同时由服务端强制。
- 生成截图、DOM 断言、console/network 记录或桌面窗口证据时，MUST 绑定固定 basis、viewport/运行环境和身份类别。
- 没有选定视觉源时，UI 状态保持 `Not verified`；模板不得自行发明品牌 token 或布局。
- 蓝湖、PSD、图片、mockup 或现有页面等设计源 MUST 保留稳定 identity、revision/hash、
  rights/use、viewport/state coverage 与证据限制。inspect/layer metadata 可作为
  `source-extracted`；仅从画布或截图估算的值保持 `visually-inferred`。
- 多页面还原在编码前 MUST 逐页读取选定设计及可用标注，分别界定摘要、完整列表和详情的范围；不能以一张相似页面或组件测试代替其他画板。运行对照 MUST 固定相同视口、数据、页面状态和滚动位置，长页面覆盖下部；原生控件、字体、接口字段和不可用动作的差异单独记录。
- 新项目从设计源提取共享视觉语义时 MUST 使用候选 Google `DESIGN.md`，并经过 official
  lint、completeness 与绑定精确 hash 的非实现者人工确认。页面布局和交互仍属于 feature
  UI spec；不得把整张设计图或页面像素复制为 shared token authority。
- 尚未选定视觉方向的新页面 MUST 先形成 ignored candidate UI spec 和完整预览生成提示，
  再交给可用 Product Design/image capability。生成结果只有在用户确认其 output/spec/prompt
  identity 后才能晋级为 selected source。
- UI preview image 和 browser screenshot 是 Product UI 证据，不是 Createway 内容生产；
  图片/视频/音频/海报等独立内容产出仍属于 Createway。
- Product UI implementation Gate MUST 与 browser verification Gate 分开。Build、typecheck、
  静态 DOM 检查或 UI 文本不得满足 browser Gate；browser Gate MUST 消费绑定同一 Result
  Package 的 `runtime-observation`，覆盖 UI spec 指定的 viewport、交互、responsive 和
  accessibility 证据，并保留 console/coverage 限制。
- 核组件或 token 可用性时，按每个受影响应用实际解析的包、版本及导出核对。
  最新文档、内置目录或相邻应用均不证明当前应用可用；只有这些证据时记
  `Not verified`，浏览器交互仍须独立验收。
- Forgeway 内部 Product UI module MUST 只消费 Delivery Graph 投影或明确的目标项目 API；
  页面不得写回、重算或根据展示状态提升 Gate。
- 项目采用 Google `DESIGN.md` shared authority 时，official format lint 只证明格式可读。仅在项目明确额外采用 completeness 策略时，Forgeway 的
  UI specified/reviewed Gate MUST 同时消费 `ui.contract.specify@1.3.0` 的
  `ui-spec-design-completeness/1` 结果、精确 DESIGN/source/approval artifact hashes、Result
  PackageManifest，以及 host-trusted approval authorization receipt。
- `ready-for-human-approval`、`not-ready`、本地
  `awaiting-trusted-approval-verification`、缺失 adapter、失配或 stale package 均不得单独满足 Gate。
  Forgeway 只引用 token group 名或 official omission reason，不复制 DESIGN token 值，也不复制 browser adapter。
