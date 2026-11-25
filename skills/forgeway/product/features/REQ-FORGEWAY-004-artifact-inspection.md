# REQ-FORGEWAY-004 Artifact Inspection

## Goal

Forgeway 为已有交付产物提供统一的只读检查入口。调用方明确给出文件路径和可选预期，CLI 返回可复查的产物证据，不触发构建、解压、执行或发布。

## Confirmed behavior

- `forgeway artifact doctor` 检查 Python 3.10+、`file` 和可选的 `lipo`。缺少 Python 运行时，Forgeway 返回运行时错误；`file` 或 `lipo` 不可用时，检查结果只声明实际取得的观察。
- `forgeway artifact inspect <path>...` 对每个文件报告存在性、非空性、SHA-256、文件类型和可检测架构。ZIP/TAR 还报告成员、成员总数及不安全路径；`--max-members` 只限制返回的成员列表，不改变成员存在性断言。
- 检查规则版本为`0.2.1`。归档含符号链接或硬链接即判`archive-safe-paths`失败：TAR按成员类型识别符号链接和硬链接，ZIP按`external_attr`高16位的文件类型识别符号链接，不依赖creator平台标识。不解析或读取链接目标；归档内目标、外部目标、链接链与循环均拒绝。命中成员名按归档顺序写入`unsafe_paths`，不受`--max-members`截断限制，JSON `ok=false`且退出码为1。ZIP无通用硬链接类型，格式扩展未声明的链接语义不在该检查保证范围内。
- 可重复传入 `--expected-arch <arch>` 与 `--require-member <member>`。任何已执行的断言失败时，JSON `ok` 为 false 且退出码为 1；正常通过为 0。输入或运行时错误单独返回非 0，不伪装为检查失败。
- `--max-members`只接受一个十进制正整数字符串，数值不超过JavaScript安全整数范围；缺值、重复值、小数、科学计数及十六进制表示均返回`ARTIFACT_INPUT_INVALID`、退出码2。Python参数解析拒绝也归为输入错误；运行时不可用或返回无效结果为退出码3。传给Python的路径和预期值保持字面含义，不让Python将其解释为新选项。
- 输入文件保持原样，检查器不提取归档内容，也不执行归档中的文件。哈希和成员信息只证明该次读取的文件内容，不代替构建身份、签名、设备运行或部署验收。
- Forgeway 随 Skill 分发原 `artifact-verify` 检查器的逐字节副本，由 `forgeway artifact` 调用；旧独立命令不属于本次安装命令的覆盖目标。

## Contract lifecycle and verification

Forgeway CLI 是命令 owner 和 producer，`tooling/artifact/inspector.py` 是检查规则 owner，调用该命令的脚本与宿主是非 LLM consumer。JSON 保留原检查器的 `{command,data,ok}` 输出与 `data.schema_version: 1`；`tooling/artifact/index.mjs` 校验运行时及结果一致性，`fixtures/artifact/test-core.mjs` 检查通过与失败路径，并可对原独立 CLI 做同请求对照。规则或输出语义变化必须同步更新版本、消费者和 fixture；逐字节副本与原来源漂移时停止宣称等价。只有确认无有效消费者依赖后才能退役该输出合同。

独立维护源为`clis/artifact-verify/artifact_verify.py`及其`artifact_verify:main`入口；两份源码以同一规则版本逐字节维护。`0.2.0`收紧归档安全断言，JSON字段结构仍为schema 1；`unsafe_paths`同时表示不安全成员名和被拒绝的链接成员名。`fixtures/artifact/archive-links.test.mjs`覆盖新规则，通过显式`FORGEWAY_ARTIFACT_BASELINE`绑定独立源码入口进行同请求JSON及退出码对照；未绑定时不声称双入口运行等价。此合同不保证任意平台解压器或私有ZIP扩展的提取安全。
