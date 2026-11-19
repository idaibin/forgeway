# REQ-FORGEWAY-005 Browser Mock Verification

## Goal

Forgeway 内置浏览器 Mock，供真实页面验证缺失、异常或场景数据；用户能启动独立本地浏览器并直接查看有数据的页面。目标项目原生接口、页面模块与样例仍由目标项目维护，Forgeway 不内置业务 DTO 或项目配置。

“项目接口 Mock”、Web/H5 页面接口 Mock 等请求可直接选择本能力；项目是否采用 Forgeway 完整交付流程不改变该有界入口。执行仍先核对项目已接受的 Mock 方式、目标页面、接口范围和宿主授权。普通页面操作由浏览器能力负责；Forgeway 仅承担本能力的 Mock 运行、合同和证据边界。自然语言命中描述与 CLI 可用不证明宿主模型已实际选择本 Skill，加载和执行须分别验收。

## Confirmed behavior

- Chrome工具栏角标在当前标签页Mock开启时显示绿色ON；已绑定页面刷新及重新握手后同步恢复，关闭或离开项目范围时清除。角标独立于“显示页面提示”设置。

- 点击 Chrome 工具栏图标打开宽 360px、最高 480px 的浮窗，内容包含项目列表、当前标签页的开启状态与Switch开关，以及“显示页面提示”Switch。项目行使用轻分隔线，标题16px、项目名14px、状态12px，沿用现有绿色强调色；右侧Switch使用绿色开启、灰色关闭的滑动样式及switch语义，支持键盘焦点与空格切换。操作期间禁用控件；失败恢复原开关状态并显示错误，页面不适用或配置不明确时禁用。浮窗不展示配置、环境/场景选择、导入导出或日志。开启复用当前绑定或已保存自动环境的场景；只有一个匹配环境和一个场景时可直接开启，存在歧义则提示在扩展选项页完成配置。扩展本地`projectPageCacheKeys`可按项目ID声明需失效的localStorage缓存键，默认无缓存清理；仅接受非空字符串数组，`projectPageCachePaths`可按项目ID和存储键声明需失效的JSON字段路径，保留同键的身份及用户偏好字段；`projectSessionCacheKeys`可声明sessionStorage需失效的临时业务键。开启时清理并刷新当前页；项目关闭时撤销同项目全部绑定和自动启用，对所有匹配该项目环境的已打开顶层页面（包括未绑定但已读入共享Mock缓存的页面）执行定向缓存清理并绕过HTTP缓存刷新，使页面重新消费对应接口响应，清除已渲染及已声明持久缓存中的旧数据；刷新失败时保留真实开关状态并提示手动刷新。自动绑定关闭时先捕获现有绑定，再撤销自动配置并向已绑定页面发送停用消息。刷新及缓存失效由后台持有，浮窗关闭不会中断其他标签页的处理；页面离开项目范围时拒绝清理，单页失败继续处理其余页面并报告待手动刷新的页。完整管理页作为扩展选项入口和 CLI 自有会话控制面。

- Native同步更新自动快照时保持连续启用，不先撤销既有页面。页面消息最多等待2秒并并发处理；旧版本指示器不能作为新配置已生效的证据。

- 请求路径支持精确、路径段前缀和具名路径段模板。模板中的 `:parameter` 仅匹配一个由字母、数字、下划线或连字符组成的非空段；固定段和段数必须一致，不能放行额外的操作后缀。项目声明具体模板及只读语义，Forgeway 不推断业务操作。

- `forgeway browser mock validate` 校验项目/环境/场景和规则；`extension` 返回随运行包分发的扩展路径；`open` 启动专用 Chrome 与管理页，导入配置、预先绑定一个目标tab，再导航到用户给定URL，配置在页面最早请求前生效。
- 浏览器按请求保持打开。`status` 回读同一专用会话的实际绑定与脱敏日志；`stop` 只关闭与会话目录身份一致的浏览器。已有用户浏览器、登录、代理、服务和Dimensions不受影响。
- 页面域名、路径、tab与API范围固定。单条请求由规则决定mock/pass/block，未知受保护请求默认阻断。允许已核实的真实只读接口显式pass；不按HTTP方法猜测语义，也不自动把失败请求透传。
- 项目场景最多1000条规则，配置不设固定总字符数或文件字节数上限，容量取决于浏览器与系统资源。列表与详情须保持同一条目身份：模拟ID先匹配其详情规则，真实ID使用项目核实的详情读取规则。
- 扩展提供只读模拟详情页 `preview.html`，项目在模拟跳转响应中返回该扩展资源URL，fragment为URL编码的JSON `{title, source, body, fields?}`；`fields`为`{label,value}`数组。页面明确标记“模拟数据”，以纯文本呈现项目提供的内容，不执行HTML、不读取账号或配置、不请求网络、不提供业务操作。非法或超限数据展示错误。真实条目保持原详情入口。
- 浏览器扩展对显式 block 和未匹配的受保护请求返回 HTTP 403 JSON（`error: FORGEWAY_MOCK_BLOCKED`），保留 `X-Tab-Mock` 规则标识并单独记录 block；不发送真实请求。Fetch 返回非成功 Response，异步 XHR 发出 load/loadend；网络故障、取消与超时继续使用原生错误语义，真实认证响应原样保留。
- 提供JSON、文本、base64字节、状态、延迟、query/body条件、fetch/异步XHR及取消；支持配置导入导出与多项目管理。iframe不属于本能力验收范围。
- 页面提示采用右下角紧凑浅色胶囊，12px绿色文字“Mock ON”，悬停显示完整场景名；浮窗“显示页面提示”默认开启，保存在扩展本地设置中，跨页面及重启生效。隐藏只影响提示呈现，不改变配置版本、绑定或进行中的请求；运行状态标记保留，状态核验区分标记存在与可见。
- 页面仅展示Mock ON；命中、真实放行和阻断分开记录。写操作只模拟或拒绝，write+pass仍须其独立授权。页面有数据须由真实页面列表/详情消费证明；配置数量与直接传输测试不替代UI。
- 配置、浏览器入口URL和认证资料不进入Forgeway标准或fixtures。会话目录为调用者指定的新目录，含专属profile与明确来源权限的扩展副本；默认不安装到日常浏览器；用户明确要求持久使用时可生成指定范围的安装目录。

- `resume` 在已有专用标签页重新导入配置、预绑定并导航，入口限制为原会话域名。浏览器由独立 Playwright Core 进程持有；CLI 退出后保留，启动失败或超时关闭其自有浏览器。

## Format lifecycle

配置schemaVersion=1的owner/producer是目标项目测试配置维护者，consumer/validator为内置扩展core.js与CLI。规则未知字段或版本拒绝；扩展和CLI复用同一validator。字段变化须同步validator、管理页说明与测试，不能静默迁移。配置保留在项目允许位置，业务合同漂移由其owner更新并重新验证；旧版本只在仍有明确consumer时保留，否则按正常退役流程删除。

本机会话元数据使用`forgeway-browser-mock-session/1`，producer是open/resume，consumer是resume/status/stop，validator是session loader。仅记录本地浏览器身份、配置hash与目标origin/path，不保存入口query/hash、认证头或Cookie。未知版本/目录身份/浏览器profile不符时拒绝操作；会话不作为跨宿主交付合同。实现变化同步测试；没有已运行会话的版本可直接退役。

## Acceptance

浏览器验收遵循[后台测试规范](../../standards/evidence.md#browser-testing-without-foreground-interruption)。默认使用任务自有无头/后台目标，截图、录屏和检查均不抢占用户浏览器，不激活窗口、不切换用户标签页；点击、`window.open`、弹窗和重定向的间接影响同样受限。模拟详情按用例关联、一次打开并核验，已通过的用例仅在相关变更、失败或新增要求后复验，不反复打开或堆积详情页。收尾只清理身份已核实的任务自有标签页，并回读关闭结果；不得通过恢复焦点或选择用户标签页收尾。后台能力不足时，停止受影响操作并标记 `Not verified`，不得转为前台操作。

门户 Mock 验证与修复的允许范围为已授权的扩展、测试配置和夹具；门户业务源码不在修改范围。不得为验收修改门户组件、API封装、路由、状态仓库或后端；确需改动时先取得单独授权。

1. CLI帮助、配置校验、未知字段拒绝、extension路径和分发回读可用。
2. 原始页面在首个fetch/XHR前接管，正常/慢响应/错误与媒体按配置返回，未匹配阻断，显式只读pass实发；其他tab不受影响。
3. open命令退出后浏览器仍打开，status回读ON；stop只关闭其专用profile。浏览器身份不符、配置非法和来源不匹配拒绝且不改目标。
4. 页面模块清单分别记录live/mock、数据消费与空态；iframe不计；未进入UI的旧导出接口不冒充页面模块。
5. 源码、配置、Mock UI、真实接口、安装与生产证据分开；真实项目运行记录保留其本地忽略位置。
6. AI 完成配置生成、校验、导入、启用、更新、刷新与重新进入后的模块复验、状态和证据回读。后台模式全程保持用户窗口状态；运行前逐项核对目标浏览器已获允许的操作能力。首次加载初始配置、配置更新和持续回归分别验收；需要人工导入、点击启用或管理页交互才能继续的链路不满足 AI 全流程验收。浏览器工具安全策略仍约束所有操作入口。

## Persistent portal activation

用户可明确为一个项目/环境/场景启用“自动启用此环境”。扩展将经过同一 validator 校验的单环境、单场景配置快照保存在本地；顶层页面刷新、重新打开或浏览器重启后，document_start 拦截器按 origin 和路径段重新绑定，无需管理页保持打开。自动范围不可重叠，write+pass 场景拒绝自动启用。关闭某标签页同时关闭其自动环境，避免心跳再次开启；来源权限移除、项目删除或主动关闭自动启用时撤销相关绑定。iframe 不启用。

管理页复用现有环境/场景选择，提供自动启用/关闭自动启用按钮和已保存范围列表。自动快照与手动快照一样，仅在重新启用时采用新编辑；状态明确展示其所选场景。

`extension --config --project --environment --scenario --url --directory` 生成调用者指定的新目录：范围收敛的扩展、原格式配置种子与静态 document_start 注册。安装后首次后台启动导入种子；之后以本地设置为准，主动关闭后不会被种子重新打开。种子仍使用 schemaVersion=1 配置格式，producer 是 extension 命令，consumer/validator 是扩展后台与 core；仅允许一个项目、环境、场景。配置改变需重新生成并明确启用，旧配置按项目维护者的退役规则处理。

日常浏览器安装使用浏览器支持的扩展安装流程；命令只生成文件，不修改浏览器 Profile 或绕过来源授权。要求后台操作时，禁止激活窗口、原生输入及主动 bringToFront/activateTarget；缺少后台安装能力时分别报告产物验证和当前浏览器安装缺口。门户业务数据留在目标项目配置中，每模块数据量由配置及真实页面消费独立验证。

## Project data ownership

页面模块清单、业务字段、样例内容、项目数量要求和生成脚本由目标项目测试资产维护。Forgeway 的 extension 命令提供 default_record_count=20，供项目生成器在未指定数量时使用；项目显式数量优先。通用运行时按项目配置原样响应，不推断或扩充业务数组。默认数量随 CLI 分发并由公开命令测试校验；变更同步文档与消费者验证。

## AI control in owned sessions

`open --headless` 创建无界面的Forgeway自有会话，导入配置并持久启用所选环境。`open --viewport WIDTHxHEIGHT` 可指定任务自有页面尺寸（默认 1920x1080），并回读实际视口；这不等于完整手机设备模拟。`apply --session --config --url` 与 `resume` 通过已经校验身份的自有会话更新场景、导航并核对启用结果；两者均不调用窗口或标签页激活。该入口只接受由Forgeway创建且身份匹配的会话目录，不接管日常浏览器或改变浏览器工具安全策略。

配置生效结果必须同时满足：保存的配置与输入配置语义一致、所选环境自动启用、目标标签页绑定对应场景、页面仍在环境范围内且显示Mock标识。失败不得返回active；启用失败时撤销本次自动启用及目标绑定。`status` 分别回读配置、自动设置、绑定及页面状态，报告active、stale或inactive，不用本地元数据替代实际扩展状态。

会话元数据中的config_semantic_sha256由open/apply/resume写入，status用于与扩展实际配置核对；对象键排序后计算SHA-256，数组顺序保留。该字段存在时必须是64位小写十六进制。仍在运行的旧会话缺少该字段时config_matches为null，不能据此报告active；apply成功核对后写入当前值。

## Conditional response fallback

项目可为只读 mock 规则配置 fallback：statuses 为项目选择的 HTTP 状态数组（200–599），emptyPaths 为项目选择的业务载荷路径数组。运行时先请求真实接口，仅配置的状态或成功响应指定路径为空（null、空字符串、空数组、空对象）时采用样例，其余响应原样返回。网络错误保持失败。插件不识别业务身份接口，不内置状态白名单、接口排除清单或业务载荷路径；是否放行及采用哪些样例由项目规则决定。写请求不允许 fallback。

自动绑定在 session storage 仅保存项目引用与版本，场景由持久自动配置解析；多个新标签页不得因重复保存完整场景触发存储配额错误。

## Native Messaging control

`native-init --directory <new-channel> --extension-directory <caller-owned-unpacked-directory> --extension-id <id>` 为尚未安装的调用者扩展产物增加 nativeMessaging 权限和专属通道身份，生成私有 stdio host、本机注册 manifest 及队列目录；不向日常浏览器注册、不激活窗口。注册 manifest 通过获准安装阶段的 native-register 命令写入显式指定的目标浏览器官方 NativeMessagingHosts 目录；拒绝覆盖已有注册，不推断默认用户浏览器。原有未带此能力的扩展仍需要获准升级。

`native-sync --directory <channel> --config <project-config> --project <id> --environment <id> --scenario <id> --url <scope-url>` 发送所选项目单环境单场景，扩展复用配置验证、来源权限、自动启用规则，保留其他项目；回读实际保存摘要、自动启用状态和已打开作用域内页面的应用结果。`native-status --directory <channel>` 向在线扩展请求实际状态，不以历史回执代替在线结果。配置更新不导航、不触碰登录资料；页面桥未加载时报告需刷新。

wire protocol `forgeway-mock-native/1` 的 producer/consumer 是内置 stdio host 和扩展 native client；通道格式 `forgeway-mock-native-channel/1` 的 producer 是 native-init，consumer 是 native-sync/status/host。validator 位于对应实现和测试。未知版本/消息/扩展/通道拒绝；变更同步生产者、消费者及测试，不静默迁移。命令仅 SYNC/STATUS，有唯一请求ID与截止时间；输入配置复用 core validator。超过单条 host 消息上限的配置按有界分片传输，校验顺序、大小及完整性后才应用。通道为私有目录，回执原子写入；超时不自动重发，已开始操作的结果不确定时用新状态查询恢复。权限变更仍由获准安装流程处理。

官方依据：Chrome Native Messaging 文档（stdio长度前缀、allowed_origins、nativeMessaging 权限）；Chrome DevTools MCP 扩展工具文档（--categoryExtensions）。当前浏览器的宿主授权、源码、独立运行验证和门户业务验收分别报告。

## Temporary execution

通用临时执行入口复用同一 schemaVersion=1 项目配置、环境、场景、匹配器和项目数据。`withTemporaryMock` 支持 Playwright route 与 CDP Fetch 两个后端，仅接受明确归属的可销毁目标，禁止真实业务写放行。项目提供执行、原响应核验与目标关闭回读；这些回调与业务断言属于项目资产。Forgeway 不内置项目接口、身份规则、数据量或成功字段。

执行按启用→业务回调→撤销→原响应核验→关闭及回读完成。业务回调失败、超时、取消仍进入 finally 清理；取消延迟并终结已暂停请求，报告 pending/timers。撤销或恢复核验失败不得报告成功，目标关闭失败单独报告。关闭目标前不宣称应用缓存已恢复；临时浏览器使用独立非持久化 Context，不导入日常登录态。CDP宿主须明确声明清理操作：原生 Fetch.disable 或宿主提供的 Fetch.enable 空过滤列表；过滤列表清空须再由原响应和目标关闭回读核验。

覆盖当前目标顶层 Fetch/XHR。CDP显式声明资源类型、请求和响应阶段；条件回退在真实响应阶段判定，原请求只发送一次。未匹配受保护请求拒绝，网络错误不转为样例。Document、iframe、Worker、WebSocket与beacon不在范围内。宿主不支持所需响应拦截时报告受影响场景不可执行，不改为忽略项目回退策略。

`forgeway browser mock temporary --config <file> --project <id> --environment <id> --scenario <id> --url <url> --driver <playwright|cdp> --chrome <executable> --flow <project-module> --out <new-directory> [--timeout-ms <100..60000>] [--viewport <WIDTHxHEIGHT>]` 始终启动独立无界面浏览器。视口尺寸限于新建任务 Context，并回读实际尺寸；默认 1920x1080。项目模块导出 run 与 verifyRestored；恢复核验须返回 restored:true。CLI自动关闭Context及浏览器并记录结果，失败退出非零。宿主内置浏览器通过模块API传入已授权CDP适配器和项目回调，不通过CLI连接宿主隐藏端口。该模块API与CLI消费已有配置；本地结果是运行回执，不作为新的交付合同或授权来源。

CDP事件或请求终态确认丢失时保持保护并关闭可销毁目标，不将未知暂停请求放回真实网络；本次恢复明确失败。模块API和CLI的producer/consumer均为临时执行维护者，验证器复用项目配置校验，接口改变同步宿主适配、项目调用和生命周期测试，不隐式迁移。

## Local HTTP proxy

`proxy-start` 启动仅监听127.0.0.1的后台HTTP代理，`proxy-update` 原子更新同一项目/环境/场景配置，`proxy-status` 回读实际配置hash、规则命中计数与在途请求，`proxy-stop` 撤销在途请求、关闭监听并核对停止状态。复用schemaVersion=1校验、匹配与响应策略；业务规则、数量和接入适配归目标项目。每个代理固定一个配置中明确的API origin及上游URL/路径前缀映射；范围外、未匹配请求拒绝，真实write+pass配置拒绝。条件回退实发一次，非命中响应保留状态、字节、重复响应头及登录跳转；网络故障不返回样例。

代理数据面和控制面均要求本机私有会话凭据，开发服务从调用者指定的私有会话目录读取并注入，不向页面分发；不修改系统代理、证书、Cookie、浏览器登录或持久插件。配置更新不扩展既定API和页面范围，不改变上游；失败保留原配置，在途请求完成原快照。日志仅含规则ID及结果，不记录请求头、Cookie、查询或业务正文。请求/响应有大小、时间界限，停机终结延迟和上游连接。

`forgeway-mock-proxy/1`会话格式的producer是后台worker、consumer是代理CLI及项目开发适配；validator检查版本、私有目录/文件、loopback endpoint与实例ID，未知版本或实例不符拒绝。该格式仅描述本地进程身份，不是项目配置。实现变更同步CLI、项目接入和测试，不静默迁移。停止后目录可由调用方按任务资产规则清理。

## Large configuration storage

Request logs read only compact session binding metadata to mark whether a tab has
an active binding; recording a log must not load, validate or clone full scenarios.
This metadata is diagnostic, never request authorization. Rule selection and page
configuration retain their existing validation and scope checks. With an unchanged
binding version, hash/query navigation inside the same origin/path does not reload
the full scenario; a path or version change still rechecks the binding through BOOT.

Configuration import, validation and Native command assembly impose no aggregate byte/character cap. The extension requests unlimitedStorage for large synthetic datasets. Manual bindings store versioned snapshots in local storage and only references in session storage; automatic bindings retain their project references. Publish references only after snapshot storage succeeds, preserve active snapshots on a failed session commit, and reclaim stopped snapshots. JSON shape, scope, trust, write protections and Native Messaging per-frame checks remain applicable. Browser message capacity, available memory and disk remain independent platform boundaries; no unlimited personnel count or gzip-based acceptance is implied.

管理页及快捷弹窗读取运行状态时，GET compact=true仅返回一份完整已保存配置；自动配置与标签页快照只返回项目、环境、场景标识与名称，不重复返回人员规则正文。页面首次BOOT与实际Mock响应保持完整场景。周期心跳通过受来源与顶层frame校验的PING只读取session绑定版本，不重建或传输完整场景；绑定版本或页面URL变化、尚未绑定时再BOOT。关闭、重启、自动启用、来源范围和扩展失效的撤销行为保持。

## Stateful interaction adapters

Mock requests follow [project Mock selection and reuse](../../standards/evidence.md#project-mock-selection-and-reuse).
Accepted project decisions select the default approach for later authorized work;
only unresolved material choices require a user decision. Synthetic data must match
the actual consumer's fields, relationships and queries. Acceptance includes reusing
a known project approach without another selection prompt and preserving existing
Mock state while extending the requested interaction coverage.

An interactive Mock journey that creates, edits, removes, toggles or otherwise saves
state must define the corresponding readback, dependent views and persistence scope.
A static success response cannot establish a successful mutation. Pure presentation
samples remain static. The project owns entities, fields, constraints, permissions,
relationship updates, routes and response envelopes; Forgeway owns the opt-in adapter
lifecycle, transactional commit and scoped persistence.

The extension accepts an explicitly selected project JavaScript adapter via
`extension --state-adapter <file>`. The entry is trusted project code, copied with a
content digest, never executable code taken from responses or JSON configuration.
It uses the versioned API in [STATEFUL](../../tooling/browser/mock/STATEFUL.md).
Existing pass/block matching remains decisive. Unsupported handlers and transports
must not be advertised as stateful. The ordinary browser Mock config keeps version 1.

Acceptance: create → list/detail/search readback → edit → dependent readback → reload
under the declared persistence mode → remove and absence; failure/abort/timeout,
concurrent writes, scope isolation and unsupported operations must not produce a
false success or leak to real writes. Source/model, synthetic browser, actual project
page, backend and deployment evidence remain separate. Generation is not activation;
reload requires checking registration, automatic enablement, binding and page status.
