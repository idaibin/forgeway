# 配置格式

顶层 `{ "schemaVersion": 1, "projects": [...] }`。导入按 project.id 合并并原子保存；同ID项目替换前会提示。项目由 id、name、environments、scenarios 组成。ID使用字母/数字/下划线/连字符；名称为非空文本。规则按数组顺序首条完整命中。

每场景最多1000条规则；配置不设应用层文件字节数或JSON字符串长度上限，实际容量受浏览器消息、内存和磁盘资源约束。模拟详情ID规则放在真实详情读取规则之前。模拟跳转可返回扩展 `preview.html` URL，fragment为URL编码JSON：`{title, source, body, fields?: [{label, value}]}`。title/source各最多200字符，body最多20000字符，fields最多16项，label最多80字符、value最多2000字符；fragment最多128000字符。该页面只展示纯文本项目夹具。

```json
{
  "schemaVersion": 1,
  "projects": [{
    "id": "my-app",
    "name": "我的测试项目",
    "environments": [{
      "id": "local",
      "name": "本地",
      "pageOrigin": "http://localhost:3000",
      "pagePathPrefix": "/app/",
      "apis": [{ "origin": "http://localhost:3000", "pathPrefix": "/api/sample/" }]
    }],
    "scenarios": [{
      "id": "normal",
      "name": "正常",
      "rules": [{
        "id": "list",
        "name": "查询列表",
        "semantics": "read",
        "action": "mock",
        "method": "POST",
        "origin": "http://localhost:3000",
        "path": "/api/sample/list",
        "pathMode": "exact",
        "body": { "category": "ALL" },
        "response": { "status": 200, "delayMs": 0, "body": { "items": [] } }
      }]
    }]
  }]
}
```

- 多域名：同项目可添加多个页面环境，环境的 apis 可包含多个精确 origin。规则 origin 必须属于项目至少一个环境且路径在其 API 范围内。开启后只使用所选环境范围内规则。
- `pathMode: exact`：pathname 精确相等；`prefix`：按路径段范围，例如 `/api` 匹配 `/api` 和 `/api/list`，不匹配 `/api-v2`；`template`：例如 `/api/items/:itemId`，具名参数必须占据完整路径段，只匹配字母、数字、下划线或连字符组成的非空段，固定段及段数必须一致。模板不会匹配额外的操作后缀。不支持正则或 `*`；origin 包含协议与端口，不含结尾 `/`。
- `query` 可省略或为字符串键值条件，例如 `{"page":"1","tag":["a","b"]}`。重复值顺序参与比较。
- `body` 可省略或为对象条件。JSON 对象递归子集匹配，数字、布尔值与字符串不同；数组精确相等。form 条件按字符串，例如 `{"id":"910001"}`；JSON ID为 `{"id":910001}`。带条件但正文无法解析时不会匹配。
- `semantics` 必须明确为 `read` 或 `write`。HTTP方法不能表达业务语义；GET也可能写、POST也可能查。
- `action: mock`：需要 response。status 为200–599整数，delayMs 为0–60000整数，body 默认按JSON序列化。可选 format=json/text/base64；text与base64的body必须为字符串，base64严格解码为原始字节。可选contentType指定MIME（不可换行），缺省分别为application/json、text/plain、application/octet-stream。204/205/304的body必须null；HEAD不返回正文。响应含X-Tab-Mock规则ID。
- `action: block`：不配置 response。浏览器扩展返回 HTTP 403 JSON（`error: FORGEWAY_MOCK_BLOCKED`），Fetch 返回非成功 Response，异步 XHR 发出 load/loadend；HTTP 代理同样拒绝为403，临时执行遵循其宿主阻断机制。阻断均不发送真实请求。`action: pass`：不配置 response，真实发送请求。保存包含 write+pass 时显示确认。
- 未匹配受保护API一律 block。其他来源/路径保持页面原行为。需要真实发送的接口由项目排除在保护范围之外，或加明确 pass 规则。
- 不支持函数、表达式、模板插值、除contentType之外的响应头编辑或自动业务数据写回。可直接编辑JSON、复制项目并改origin复用。
- 配置支持100项目、每项目30环境/50场景、每场景1000规则；文件导入与Native分片重组不按配置总量截断。扩展声明unlimitedStorage存储大配置；会话存储仅保留绑定引用，大快照按版本保存在扩展本地存储，停止时回收。Chrome Native Messaging单帧边界保持，分帧传输不等于gzip压缩。

示例为格式说明；实际项目以自己的正式 API 合同为准。不要将 token、Cookie、认证头或真实敏感人员数据写入配置。

项目模块、样例、生成器和最少记录数由目标项目测试资产拥有。`forgeway browser mock extension` 输出 `default_record_count: 20` 供生成器在项目未指定时取用；项目显式数量优先。运行时不会自动复制业务字段或扩充响应数组。

只读 mock 规则可选 `fallback: {"statuses": [503], "emptyPaths": ["items"]}`。配置存在时先发送真实请求，仅项目指定状态（200–599整数）或成功响应指定路径为空时采用 response。未配置 fallback 的 mock 规则直接返回 response。路径使用点分字段，空路径表示根载荷；缺失字段不视为空。支持 JSON 字符串封装的载荷；空值指 null、空字符串、空数组或空对象。插件不配置默认回退状态或业务字段，不识别身份、登录或具体模块。真实接口是否直接 pass、哪些结果回退、样例数量均由项目决定。网络失败不触发回退，写规则不能配置 fallback。

后台本机通信见 [Native Messaging](NATIVE.md)：native-init 生成调用者通道，native-sync 配置同步，native-status 在线回读。

## 页面提示

工具栏浮窗中的“显示页面提示”Switch控制右下角紧凑的Mock ON标签，悬停可查看场景名。设置保存在扩展本地存储中，默认显示，切换后立即作用于已接入的页面并在刷新后保留。隐藏不改变Mock绑定、场景或进行中的请求。运行状态核验使用保留的DOM标记及配置版本；CLI的`indicator_present`表示标记存在，不代表提示可见。

项目Switch开启后由后台清理并刷新当前页。关闭时撤销同项目全部绑定和自动启用，并清理、刷新所有匹配该项目环境的已打开顶层页面；刷新绕过HTTP缓存，浮窗关闭不打断后台处理。

扩展本地设置由受信任控制面维护，默认不清理：

- `projectPageCacheKeys`：项目ID映射到localStorage整键数组。
- `projectPageCachePaths`：项目ID映射到存储键和JSON字段路径数组，例如对象中的业务缓存字段；未声明字段保留。
- `projectSessionCacheKeys`：项目ID映射到sessionStorage整键数组。

仅在匹配项目环境的当前顶层页面执行；清理后在pagehide末尾再次清理，避免延迟持久化回写。登录资料及用户偏好不应列入清理配置。任一页面失败继续处理其余页面并返回失败列表；无范围匹配、页面导航离开范围或缓存结构损坏时不能宣称该页完成。

For interactive create/edit/delete Mock journeys, use the project-owned [state adapter](STATEFUL.md). Keep business reducers and fixtures in the project; Forgeway owns transactional state and persistence. Require dependent-query and reload readback, and keep static display samples distinct from stateful mutation evidence.
