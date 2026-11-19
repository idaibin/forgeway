# 临时 Mock

执行脚本、配置、夹具、适配器与产物遵循 [外部测试资产边界](../../../standards/evidence.md#project-test-asset-ownership)，保存在项目明确采用的独立 Git 测试仓库中。应用源码和开发配置仅供读取。

`temporary.mjs` 的 `withTemporaryMock(options, run)` 复用现有项目配置，提供 Playwright route 和 CDP Fetch 后端。业务样例、登录、恢复断言和浏览器宿主仍由调用者或项目拥有。原生 CLI 始终启动新建的非持久化无界面 Context，不复制现有认证资料。

```sh
forgeway browser mock temporary --config project-mock.json --project demo --environment local --scenario populated --url http://localhost:8080/app/ --driver playwright --chrome /path/to/chrome --flow ./tests/mock/temporary-flow.mjs --out /new/result-directory
```

Web/H5 可追加 `--viewport 375x812`（宽和高各 100–8192），只改变本次新建的任务自有 Context；默认 `1920x1080`。命令回读实际页面尺寸并写入结果。它不模拟完整手机硬件、触控或设备像素比，也不修改内置浏览器的共享 Dimensions。
`temporary` 不侧载扩展；扩展会话 `open` 需要允许命令行加载扩展的 Chromium 或 Chrome for Testing，可用性须单独实测。

项目 flow 模块导出 `run({page,context,signal})` 与 `verifyRestored({page,context})`。可选 `prepare` 在导航前设置项目测试前置，`before` 在导航后、接管前读取原响应或完成独立会话登录；run的异常、超时和取消进入清理。原响应核验必须实际请求被替换接口并返回 `{restored:true,...}`，不能只检查删除过滤器的返回值。调用者模块是可执行代码，只执行已授权的项目脚本。

模块选项：

- `config, projectId, environmentId, scenarioId, url`：现有 schemaVersion=1 的项目选择。
- `driver`：playwright 或 cdp；`ownership` 必须为 disposable-task-target。
- Playwright：传入 `page`。只移除本次添加的 handler，不移除同目标其他 handler。
- CDP：传入 `host`，包含 `send(method,params)`、`readEvents(options)`、`pageState()` 与 `clearInterception()`；pageState 返回 `{url,frameId}`，事件分页遵循 cursor/events/truncated。`createPlaywrightCdpHost(page,session)` 提供原生适配。
- `verifyRestored()`：撤销后运行的项目恢复核验；失败不报告通过。
- `dispose()`：关闭任务拥有的目标并回读，返回 `{closed:true}`；Context隔离由宿主负责，不接受用户原标签页。
- 可选 `signal`、`timeoutMs`（100–60000）；默认30000。

返回运行结果包含 status、业务结果、cleanup.pending/timers/errors、restoration、disposal及失败原因；没有成功的原响应与关闭回读不能通过。响应延迟在关闭时取消；已暂停请求终结后才撤销拦截。CLI运行结果写到新输出目录result.json，运行失败退出非零，Context与浏览器在finally关闭。

## Codex 内置浏览器

使用官方 Browser Use 的后台任务页和已授权 `cdp` capability。`createBrowserUseCdpHost(capability)` 已封装该宿主：send/readEvents直接委托 capability；pageState通过Page.getFrameTree读取顶层URL与frame ID，clearInterception使用该宿主允许的 `Fetch.enable({patterns:[]})`。不使用隐藏调试端口、不改变 Dimensions、不激活窗口。

启用仅显式 Fetch/XHR，包含请求和响应阶段；Document导航由宿主管理。宿主权限或响应阶段能力不足时保留相应失败，不降级为无条件Mock或真实网络透传。项目回调通过宿主允许的页面操作/API执行；最后关闭并回读任务页。内置浏览器模块API运行结果与独立CLI分别验收。

## 范围

规则匹配、query/body条件、JSON/text/base64、状态、延迟、直接Mock、只读pass、block及条件回退均消费原配置。条件回退先读取实际响应，原请求只发送一次；未匹配受保护请求拒绝。只覆盖目标顶层Fetch/XHR，不声明iframe、Worker、WebSocket、beacon、Document或整个浏览器流量覆盖。

撤销网络规则不回滚应用缓存。需要完整恢复时必须使用可销毁的独立Context或已验证隔离的任务页，并关闭回读。即使业务断言失败仍撤销、核验恢复与关闭；恢复失败单独报告。临时执行不修改持久插件设置，不覆盖正常用户浏览器的Mock或登录态。

CDP事件丢失或终态命令确认失败时，不清空未知暂停请求后继续真实网络；在保护仍开启时关闭任务目标，恢复核验保持未验证。项目准备、登录与运行均有截止时间，CLI接到正常SIGINT/SIGTERM时进入取消与清理流程，强制进程终止不构成恢复证据。
