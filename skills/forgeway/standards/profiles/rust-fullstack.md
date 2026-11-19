# Rust Full-stack Profile

Rust profile 是证据要求，不是框架模板。

仅作用于明确选择 Rust 的 application。名称保留兼容；前端、桌面签名规则
仅在该组件实际包含对应能力时适用，不自动引入前端框架或 Tauri。

目标项目 MUST 从源码解析并声明：

- `rust-toolchain*`、Cargo workspace、`Cargo.lock`、crate 和 build owner。
- `fmt`、`clippy`、unit/integration/build 的项目原生命令。
- SQL migration、API router/DTO/IDL、生成客户端和前端命令（如适用）。
- runtime/browser 或原生桌面窗口验证。
- Tauri/macOS 项目将构建、Developer ID 签名、公证、stapling 与 Gatekeeper 分成独立 gate。

签名或公证环境缺失记录为 `Blocked` + `Not verified` 待办，不得冒充代码失败或已配置流水线。

实现 MUST 使用公共安全与代码设计基线：可恢复外部输入/IO 错误通过 `Result`
与明确错误映射传播，不用 `unwrap`/`expect`/panic 掩盖请求失败；确属不变量的
panic 必须有局部理由。`unsafe` 必须有安全不变量和验证；异步任务、取消、锁、
连接与文件资源必须明确归属。SQL 参数绑定与动态标识 allowlist 同样适用。

验收补充：输入错误、权限拒绝、数据库失败和任务取消/关闭路径；采用 unsafe
时运行适用检查。未运行的目标平台、浏览器或部署保持 `Not verified`。

参考：[Rust error handling](https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html)。
