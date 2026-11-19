# Change Management Standard

- 影响产品行为、验收、接口、数据、UI、权限、运行或证据门禁的修改 MUST 有 `CHG-*` 记录。
- Change MUST 引用原 basis、受影响 Requirement、变更原因、影响范围、决定 owner 和重新验证 gate。
- 变更 MUST 不覆盖历史失败证据；新的 attempt 使用新 Evidence ID 并回链 Change。
- 兼容、迁移、切换、回滚和退役只在有真实消费者或持久数据时要求，并分别保留证据。
- 紧急修复 MAY 先执行已授权的最小安全变更，但在关闭前必须补齐 Change 与验证链。
