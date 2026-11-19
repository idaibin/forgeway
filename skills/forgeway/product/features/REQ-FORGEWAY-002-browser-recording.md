# REQ-FORGEWAY-002 Deterministic Browser Recording

## Goal

用户在开始前固定目标页面、操作步骤和录制参数，由 Forgeway 内置 CLI 一次执行并输出完整 MP4。录制期间不等待 AI 判断，保留真实动作间隔，不靠后期补帧伪造流畅度。

## Confirmed scope

- `forgeway browser` 是 Forgeway 自有 CLI 能力，随 Forgeway 包内的 `tooling/` 一起分发；它不是外部 CLI/Skill 的固定绑定。
- `validate` 检查流程，`doctor` 检查本机 Chrome、CDP 和 ffprobe，`targets` 列出本机端点的页面，`record` 执行。
- 流程只允许声明式 `wait`、`assert`、`click`、`hover`、`move`、`scroll` 和 `pause`；禁止任意页面脚本步骤和自动探索。前置条件在录制前检查，步骤在录制中顺序执行。
- `--launch-headless` 使用临时 Chrome profile 并在结束后清理；`--endpoint` 仅连接明确指定的本机 CDP 页面 ID，要求页面 URL 与流程完全一致，不修改已有浏览器的 viewport、设备模式或其他标签页。已有页面模式要求 Chrome 事先暴露 CDP；不替用户启动调试端口。
- 使用 Chrome 原生 CDP screen recording 生成 MP4，再用 ffprobe 检查可播放性、帧数、实际帧率及帧间隔。输出路径必须新建；低于阈值返回 `partial`，不声称流畅。
- 失败时不交付半成品；成功视频不自动授权发布、上传或门禁通过。视觉和业务正确性仍按目标页面单独验收。

## Flow format lifecycle

`forgeway-browser-flow/1` 的 owner 和 producer 是 Forgeway CLI 调用方；非 LLM consumer 是 `tooling/browser/index.mjs`；validator 是 `tooling/browser/flow.mjs`。`schema_version` 为精确版本，未知字段、动作和版本拒绝。改变行为或字段时发行新版本并用新 validator；旧版仅在明确保留消费能力时继续有效，删除旧版须先确认无调用方。JSON 文件由调用方保存，Forgeway 不把目标项目页面状态复制成内部权威。

## Acceptance

1. 校验拒绝未知动作、脚本注入字段、缺失目标和无界步骤。
2. 隔离 Chrome 的真实流程完成点击、断言和定时动作，输出 ffprobe 可读 MP4；报告实际帧率和帧间隔。
3. 目标 ID/URL 或 viewport 不符时在录制前停止；现有浏览器模式不设置 Dimensions。
4. CLI `--help`、doctor、validate、record 和适用测试退出状态一致；分发清单包含实现和文档。

现有用户 Chrome 的 CDP 连接、登录态页面操作、页面视觉验收和发布分别需要真实目标证据；隔离 Chrome 测试不替代这些层。
