# Native Messaging

Forgeway 的本机 host 与扩展使用 Chrome Native Messaging。项目接口清单、业务判空字段、样例及记录数仍由目标项目配置拥有。本机 host 不执行浏览器脚本或读取浏览器认证资料。

## 命令

先通过 `forgeway browser mock extension --config <file> --project <id> --environment <id> --scenario <id> --url <url> --directory <new-artifact>` 生成调用者自己的扩展目录。以下命令准备独立通道和该产物的 Native Messaging 能力：

```sh
forgeway browser mock native-init --directory <new-channel> --extension-directory <unpacked-artifact> --extension-id <chrome-extension-id>
```

命令为该调用者产物增加 `nativeMessaging`、`alarms` 权限，生成私有通道、可执行 stdio launcher 和 `NativeMessagingHosts/com.forgeway.mock.json`。输出 `registered:false`、`browser_changed:false`；它不向日常浏览器注册，也不升级已加载代码。每个安装实例使用独立产物、通道及注册。当前 launcher 支持 macOS/Linux；Windows 会明确拒绝，需实现可执行 launcher 后另行验收。

本机 host 注册清单由获准安装流程使用 `forgeway browser mock native-register --directory <channel> --registration-directory <authorized-NativeMessagingHosts-directory>` 写入显式指定的官方目录；拒绝覆盖已有注册，不推断日常浏览器默认目录。清单的 allowed_origins 只包含指定扩展 ID，不使用通配符。Chrome 启动 host；扩展主动连接并校验通道身份。本机启动器固定 Node 可执行文件和安装模块路径，Node 或 Forgeway 安装位置改变后需重新准备通道。

已获准加载这版扩展后，AI 可通过 CLI 完成同步，无需管理页导入：

```sh
forgeway browser mock native-sync --directory <channel> --config <project-config> --project <id> --environment <id> --scenario <id> --url <scope-url>
forgeway browser mock native-status --directory <channel>
```

同步只采用所选项目的一个环境和一个场景，保留扩展内其他项目。扩展检查配置、摘要、页面来源权限及自动启用范围后保存并启用。已有页面的桥接器收到新场景；桥未加载的页面报告 `requiresRefresh:true`。流程不打开管理页、不导航页面、不聚焦窗口、不修改 Cookie 或登录资料。

配置更新直接替换自动快照和绑定版本，不经过关闭再启用的中间状态。各页面消息并发处理并在2秒内结束等待；未响应或仍持有旧版本的页面返回 `applied:false`、`requiresRefresh:true`，不拖住在线状态查询。

状态查询必须经在线 host 和扩展响应。结果包含扩展 ID、版本、各项目实际保存摘要、自动启用及作用域内页面的 applied 状态。旧回执不能证明在线。命令超时返回非零，提示结果未验证；不自动重发变更，用新的状态查询核对。host 断开后扩展通过 Chrome alarm 重连；浏览器重启后重新建立连接，保留配置。

## 协议和范围

- `forgeway-mock-native/1`：仅 HELLO/READY/POLL/COMMAND/RESULT；业务命令仅 SYNC、STATUS。帧采用 Chrome 指定的本机字节序32位长度与 UTF-8 JSON。
- host→扩展配置按192 KiB分片，单帧小于1 MiB，完整命令不设固定总字节数或分片数量上限，容量取决于浏览器与系统资源。顺序、数量、大小、请求ID、截止时间及配置摘要必须一致，完整接收后才应用。
- `forgeway-mock-native-channel/1`：native-init 产生 settings，CLI和host消费并校验。私有目录0700、设置及队列文件0600；回执按请求ID原子写入。host 使用单进程占用锁，连接PID仅用于诊断，不作为在线状态证据。
- 未知版本、来源、消息、未授予页面权限、非法配置拒绝。只读验证场景不能放行真实业务写请求。
- producer、consumer、validator 和版本随源码及测试同步，不能静默迁移。首次获得新权限、升级既有插件及当前浏览器的宿主授权是独立安装边界。

## 真实运行验证

```sh
node fixtures/browser-mock/native-browser.mjs --chrome <Chrome-for-Testing-executable> --output <new-evidence-directory>
```

运行器只创建任务自有的1920×1080无界面Profile，在其 NativeMessagingHosts 目录注册 host；测试页面和登录 Cookie 均为合成 fixture。经实际 Chrome→host→CLI→扩展→页面验证同步、分片、更新、刷新、新标签页、在线状态、来源权限拒绝、host崩溃恢复和浏览器重启；结束关闭自有浏览器。该结果不替代当前用户Chrome或目标业务项目验收。

## 官方 DevTools MCP 最小接入

[devtools-mcp.example.json](devtools-mcp.example.json) 使用官方包、`--autoConnect` 与 `--categoryExtensions`。前者要求 Chrome 144+、目标浏览器已通过官方入口启用远程调试；连接授权提示由宿主/用户处理。扩展工具提供 install_extension、list_extensions、reload_extension 等能力。产物目录不在 MCP workspace roots 时，额外指定 `--filesystemRoot=<exact-extension-artifact-directory>`。

该示例仅供宿主配置；不会被 Forgeway 自动安装或启动。当前工具对某个浏览器的访问拒绝仍然有效，示例不授予当前会话连接权限。面向独立无界面验收时可使用官方 `--headless --isolated --categoryExtensions` 启动专用实例。

官方依据：[Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)、[扩展工具](https://developer.chrome.com/docs/devtools/agents/extensions)、[MCP配置参数](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md)。
