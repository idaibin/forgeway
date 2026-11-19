# Frontend CSS and Markup Standard

本标准适用于目标项目维护的 CSS、Sass、Less 和实际渲染的页面结构。生成、编译、压缩和第三方样式继续由其 producer 拥有，不得手改。目标项目的 Product、feature UI spec、`DESIGN.md` 和源码仍是语义权威；Forgeway 只定义交付门禁。

## Contract before correction

- 选定蓝湖、Figma、截图、原型或 accepted current surface 的 UI 修改，MUST 在源码前更新 Product/UI 合同。视觉源 identity、revision/hash、viewport/state、`use`/`ignore`、原始测量和证据等级 MUST 保留。
- 每个实质差异及后续补充纠偏 MUST 绑定稳定 acceptance ID、单一实现 owner 和验证方法。后来的截图、inspect 值或用户纠正 MUST 形成新合同 revision，不得只追加临时 CSS 覆盖。
- 设计源目标、当前 runtime 和接受后的 target MUST 分开。computed CSS 只能证明当前实现，不能反向改写设计合同。

## Layout and box ownership

- 页面布局链 MUST 明确 shell、content/page、panel/component、control、inner-scroll 和 overlay owner。每个轴的 page-edge inset 只能有一个 owner，每个内部间距只能有一个 owner。
- 一维排列和对齐 SHOULD 使用 Flexbox；真实二维行列关系 SHOULD 使用 Grid。不得为了减少声明而把二维 Grid 改成 Flex，也不得用多层 margin 补偿父级错误的布局选择。
- 父级 SHOULD 使用 `gap` 和 padding 管理子项分布；可复用组件 MUST NOT 重复父级已经提供的外边距或页面 inset。`min-width: 0`、`min-height: 0`、basis、overflow 和 breakpoint 只有在追踪容器及渲染效果后才可删除。
- 同一响应式责任 MUST 保持在一个稳定 owner；页面局部不得以更高 specificity、`!important` 或晚到覆盖修补共享壳层。

## Rendered wrapper gate

- 每个实际渲染 wrapper MUST 独立拥有至少一项职责：文档语义或 accessible name、layout/containing block、scroll/clipping/stacking、component state/event、transition/teleport、稳定 ref/test hook 或已证明的复用。
- 只转发 width、height、padding、background 或 class 的相邻 `div > div` MUST 被合并到最近的语义或布局 owner，除非它仍是 flex/grid item、positioned containing block、scroll owner、stacking/container-query owner、slot/attribute fallthrough target、条件/循环 key、event target 或 accessibility relationship。
- 页面 MUST 只有一个有效 `main`。`section` SHOULD 有 heading 或 accessible name；`nav`、`aside`、`header`、list、button 和 link 必须按真实语义使用。
- 删除 wrapper 前 MUST 比较渲染前后的元素顺序、landmark/heading、accessible name、attribute fallthrough、event/focus order、flex/grid item、containing block、scroll owner、selector 和 overlay 关系。

## CSS ownership and cascade

- 每项 layout、spacing、typography、state、overflow 和 responsive 职责 MUST 只由一个 selector、token、utility、variant、prop 或 semantic parent 拥有。
- 半透明表面 MUST 使用 background alpha。已经使用 alpha background 时 MUST NOT 再在容器根增加 `opacity` 模拟同一效果，因为它会同时降低文字、图标、焦点、子元素和组合状态；只有合同明确要求整个子树弱化的 disabled、ended 等状态 MAY 使用元素 opacity。
- 删除或移动声明前 MUST 分类其有效 owner：active、inherited、user-agent default、project reset duplicate、identical base duplicate、responsive override、computed no-op 或 defensive invariant。只有已证明重复、被遮蔽、默认或 computed no-op 的声明才能从本次 owner 删除。
- Sass/Less 嵌套 SHOULD 只用于直属 BEM element、pseudo state、modifier 和局部 media scope；MUST NOT 使用 DOM 形状嵌套、跨组件 reach-through 或 specificity escalation 建立隐式依赖。

## Verification

- 格式化、预处理、lint、build 和 selector 比较只证明静态边界，不能满足 browser Gate。
- 选定视觉源的一次有效同 viewport/state 对照覆盖全部 required viewport/state 且通过后即可结束，不得为凑次数重复未变化的检查，也不得为强制两轮而虚构 mismatch。实际修复后仅复验受影响状态，并保留纠正前的失败和纠正后的 runtime evidence；新要求或证据失效时复核对应范围。项目明确要求的额外轮次 MUST 保留。
- UI 合同要求的 breakpoint、hover、focus-visible、loading、empty、error、disabled 和 overflow 均是独立目标，不能由桌面默认态代替。
- 视觉完成 MUST 同时具有 acceptance-to-owner mapping、一次有效同 viewport/state 对照、适用的 computed geometry/style 和全部 required viewport/state；缺失项保持 `Not verified`。
