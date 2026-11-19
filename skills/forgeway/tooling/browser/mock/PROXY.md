# 本地 HTTP Mock 代理

代理消费现有 `schemaVersion=1` 项目配置，使用与扩展、临时 Mock 相同的匹配器和响应策略。仅监听 `127.0.0.1`；不修改浏览器、系统代理或证书。接入由项目外独立测试运行时持有，API 前缀、上游映射、业务规则和验收脚本保存在该测试工作区；应用源码、开发配置与发布资源保持正式实现。

```sh
forgeway browser mock proxy-start --config project-mock.json --project demo --environment local --scenario populated --url http://localhost:8080/app/ --api-origin http://localhost:8080 --upstream http://localhost:9000 --strip-prefix /api --session /new/private/session
forgeway browser mock proxy-status --session /new/private/session
forgeway browser mock proxy-update --session /new/private/session --config project-mock.json
forgeway browser mock proxy-stop --session /new/private/session
```

`--api-origin` 必须在环境API范围内；一次进程固定一个API origin。`--upstream` 是明确的HTTP(S)目标，与逻辑API origin分开；`--strip-prefix` 按路径段移除请求前缀，再追加到上游基础路径。`--strip-prefix /` 保留完整请求路径。默认分配空闲端口，`--port` 可指定端口，冲突失败，不自动改端口。

`proxy-start` 返回本机 endpoint 和实例状态，退出后worker继续运行。会话目录必须是新目录，权限0700；`state.json` 权限0600，包含版本、endpoint、实例ID、PID和私有token。CLI不输出token。外部测试运行时读取此文件，将请求发送至 endpoint，注入 `x-forgeway-mock-token`；代理在转发上游时移除该头。页面不能获得会话文件或token。外部测试运行时须验证版本、文件权限和loopback endpoint；无活动会话时的原转发行为由外部测试运行时定义，活动代理断连不能静默透传。

状态回读包含配置语义hash、选择、在途数量、mock/pass/block/error计数及最多100条规则ID/结果，不含URL、Cookie或正文。更新只提交同格式配置，固定项目/环境/场景与API边界；非法配置保留原快照，在途请求继续原快照。`proxy-stop` 取消在途请求，关闭监听并回读已停止；已停止状态再次查询仍检查监听不可达。停止目录清理由调用者负责，下次启动使用新目录。

条件回退先请求真实后端一次。匹配指定状态或成功响应的指定空字段时返回样例，其他响应保留状态、字节、压缩编码、Cookie与重定向；不跟随重定向。连接故障返回502，超时返回504，不伪装为样例。真实write+pass配置拒绝；未匹配或范围外请求403，数据面与控制面都要求token。数据面请求和真实上游响应最大16MiB；通过token认证的配置更新不设固定总字节数上限，仍校验配置与环境范围。上游空闲超时10秒、单次数据请求截止75秒。代理处理显式接入的HTTP请求，不接管其他标签页、iframe策略、WebSocket、CONNECT或浏览器全部流量；项目接入范围独立定义。

真实页面验收应使用没有持久扩展的独立浏览器，避免两层Mock覆盖；观察数据来源时回读 `X-Tab-Mock` 与代理命中计数。网络策略验证、页面消费和真实后端集成分别报告。
