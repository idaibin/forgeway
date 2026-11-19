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

开发测试、历史台账和原始验收材料由维护者保存在各自的工作区。

[Skill 入口](skills/forgeway/SKILL.md) · [CLI 说明](skills/forgeway/tooling/README.md)
