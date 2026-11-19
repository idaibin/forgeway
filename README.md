# Forgeway

Forgeway 为 Codex 提供软件研发标准、交付工作流和本地 CLI。

## 安装到 Codex

```sh
npx skills@latest add idaibin/forgeway --skill forgeway --global --agent codex --yes
```

安装后重启 Codex，再用 `$forgeway` 启用。运行打包、接口 Mock 等 CLI 工具时，在 Skill 目录安装锁定的运行依赖。

```sh
cd "$HOME/.agents/skills/forgeway" && npm ci --omit=dev --ignore-scripts && node tooling/forgeway.mjs version
```

运行依赖验证使用 Node.js 24.22.1 和 npm 12.0.1。开发测试、历史台账和原始验收材料由维护者保存在各自的工作区。

[Skill 入口](skills/forgeway/SKILL.md) · [CLI 说明](skills/forgeway/tooling/README.md)
