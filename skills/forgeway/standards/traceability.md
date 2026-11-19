# Traceability and Artifact Standard

## Artifact ID

| Artifact | ID 形式 |
| --- | --- |
| Requirement | `REQ-<DOMAIN>-NNN` |
| Task | `TASK-<DOMAIN>-NNN` |
| Change | `CHG-<DOMAIN>-NNN` |
| Gap | `G-<DOMAIN>-NNN`，例如 `G-SAMPLE-NNN` |
| Evidence | `EVD-<DOMAIN>-NNN` |

ID MUST 稳定且不可复用。路径变化通过 Change 更新引用，不创建同义 ID。

产品命名空间整体替换必须由一个独立 Change 固定替换前 basis、证明旧 ID 不再复用，并明确回滚和重新验证门禁。只有存在已验证的外部消费者、持久引用或发布合同，才必须记录一对一终止映射和消费者迁移；没有这类消费者时，不创建推测性的兼容 alias，Git 历史保留旧状态。

每个机器 Artifact MUST 包含 `schema_version`、ID、owner、相关 Requirement、repository identity、固定 SHA 或明确 `Not verified`。仓内路径 MUST 为相对路径，禁止本机绝对路径。

1.1 Artifact MUST 通过稳定 ID 引用 repository 和 component：

- `monolith` 和 `monorepo` 恰好一个 repository；`monorepo` 至少两个 component。
- `polyrepo` 至少两个 repository，每个 repository 至少有一个 component。
- repository/component ID 与 repository identity 在项目内 MUST 唯一；polyrepo 不得用不同 ID 重复同一 repository。所有 Artifact、command、scope 和 manifest repository 引用 MUST 可解析。
- Requirement、Task、Change 和 Evidence 的多 repository basis MUST 分别固定 commit SHA，不得用一个项目级 branch 替代。

追踪索引 MUST 只保存定位信息，不复制被引用 Artifact 的正文。一个 Requirement 的完成判断 MUST 由证据矩阵决定，而不是由链接数量决定。
