# Forgeway

Forgeway 为 Codex 提供软件研发标准、交付工作流和本地 CLI。

## 安装到 Codex

```sh
npx skills@latest add idaibin/forgeway --skill forgeway --agent codex --yes
```

在项目目录运行以上命令，然后重新打开 Codex 会话，用 `$forgeway` 启用。CLI 随 Skill 一起安装。客户端调用时，以实际加载的 `SKILL.md` 所在目录定位 CLI，并以目标项目目录为工作目录，无需另外克隆仓库或配置全局命令。

需要运行打包、接口 Mock 等依赖运行时包的功能时，在实际 Skill 目录安装依赖。安装锁定依赖使用 Node.js 24.22.1 和 npm 12.0.1。以下示例使用上面命令安装的项目内路径。

```sh
npm --prefix "$PWD/.agents/skills/forgeway" ci --omit=dev --ignore-scripts
node "$PWD/.agents/skills/forgeway/tooling/forgeway.mjs" version
```

## 维护与回归

本仓库是 Forgeway 的维护入口。运行规范和 CLI 位于 `skills/forgeway/`，可重跑的项目测试位于 `tests/`。在同一提交中更新实现和相应测试。历史评测、录屏和原始日志按项目归档。

在仓库根目录使用上述 Node 版本和锁定依赖运行首批基准：

```sh
node tests/workspace/test-system-benchmark.mjs
node tests/workspace/test-index-benchmark.mjs
```

HTTP 基准在临时目录调用包内 CLI 生成示例，检查回环服务响应、分页、同用户双令牌和重启读回。12 个负载阶段共校验 1,440 次列表读取，输出逐请求耗时与终态。SQLite 基准使用示例迁移和合成数据，对照全表扫描与现有索引，每次核对同一组 20 条结果。两项基准的耗时仅用于同条件比较。

[Skill 入口](skills/forgeway/SKILL.md) · [CLI 说明](skills/forgeway/tooling/README.md)
