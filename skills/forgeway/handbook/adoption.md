# Adoption Guide

## 接入一个项目

1. 从 [项目发现](../workflows/00-project-discovery.md) 开始，区分新项目与现有项目，解析每个 repository 的真实 Git 根、固定 SHA、有效指导、原生命令和 Artifact owner。
2. 发现并引用项目已有的产品、设计、接口、数据、源码、测试和运行权威；按 [项目资产模型](../product/project-assets.md) 标记 `referenced`、`extended`、`new` 或 `not-applicable`。
3. 只有存在持久消费者时才选择 [manifest placement](./topology-and-manifest-placement.md)：由 campaign 持有，或放在目标项目 owner 接受的相对路径；不强制 `delivery/`、`forgeway/` 或 `.forgeway/`。
4. 仅为缺失且已确认 owner、消费者和放置位置的 Artifact 使用模板；语言 profile 只描述证据期望，不改写通用状态和完成定义。
5. 为一个小型纵向需求完成产品确认、Requirement、适用的 UI/接口/数据/架构合同和 Task，再进入实现。
6. 运行目标仓原生测试、构建、数据库、API 和 UI 验证，按 component 生成 Evidence。
7. 独立审查，修复 findings，再重跑受影响 gate；Git delivery 仍需单独授权。

## 不做什么

- 不从产品 Markdown 自动生成数据库或业务实现。
- 不在本体系中复制 OpenAPI、DTO、SQL 列表或设计 token。
- 不猜 Maven、Gradle、Cargo、npm 或运行命令。
- 不把 branch 名当固定 basis；必须解析 commit SHA。
- 不把高权限 happy path 当权限验证。
- 不因接入 Forgeway 而复制整个 standards/workflows/prompts 树到目标仓。
- 不把源码观察自动提升为产品意图，也不为便于 AI 读取而创建没有 owner 或消费者的资产。

## Profiles

- [Java full-stack](../standards/profiles/java-fullstack.md)
- [Rust full-stack](../standards/profiles/rust-fullstack.md)
