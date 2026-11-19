# Topology and Manifest Placement

## Topology

Topology 描述项目的源码与交付边界，不描述部署形态。

| 值 | repository cardinality | component cardinality |
| --- | --- | --- |
| `monolith` | 恰好 1 个 | 至少 1 个；可以有多个逻辑 component |
| `monorepo` | 恰好 1 个 | 至少 2 个可独立定位、构建或验证的 component |
| `polyrepo` | 至少 2 个 | 每个 repository 至少被一个 component 引用 |

Component 是 scope、command 和 gate 的最小定位单位；它不是微服务声明，也不要求改变目标项目目录。拓扑必须由当前目标仓库结构决定，不能从模板或历史评测推断。

For a new project, place the application collection under its governance Git root as
`apps/` (plural), keep the outer directory name custom, and ignore `/apps/` in that
outer root's `.gitignore`; `apps/frontend` and `apps/backend` can each be independent
Git repositories. This convention does not require an existing project or monorepo to
move, and does not rename framework-owned directories such as Remix `app/` or Next.js
`src/app/`.

## Manifest placement

Portfolio entry 必须声明一种 manifest owner：

- `campaign`：manifest 放在 Forgeway campaign 的 `evaluation/campaigns/<campaign-id>/...` 下，其 basis 是 Portfolio 的 `system_commit_sha`。
- `project`：manifest 放在目标 repository 的相对路径，`manifest_repository_id` 必须引用该项目已声明 repository。

两种方式都只放项目实例 metadata。不要把本仓的 `standards/`、`workflows/` 或 Schema 树复制进目标项目；项目通过固定 Forgeway SHA 使用它们。

Validator 只校验条件、相对路径、cardinality 和引用。它不 clone repository、不检查远端、不执行 manifest 中的命令。
