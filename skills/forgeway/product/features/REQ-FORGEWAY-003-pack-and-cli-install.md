# REQ-FORGEWAY-003 Pack and Skill CLI Installation

## Goal

Forgeway 在 Skill 运行包内提供 CLI 和开发产物 ZIP 打包能力。宿主按实际加载的 Skill 目录定位并调用 CLI，保留任务工作目录。

## Confirmed behavior

- `forgeway pack doctor` 检查离线依赖；`forgeway pack create <directory>` 在构建完成后压缩现有产物。打包不启动构建、不发布、不修改产物目录。
- 默认项目名前缀取调用目录名；可指定 `--project`。默认输出到桌面；可用 `--out` 指定已有目录。文件名为项目短名加上海时间，ZIP 解压后保留产物目录顶层，拒绝同名覆盖、源内输出、符号链接和特殊文件。
- `--dry-run` 只预览。正式打包在输出目录内暂存，使用 Info-ZIP 压缩、测试并实际解压比对结构和文件大小，再计算 SHA-256，以不覆盖的硬链接发布。
- Finder 紫色标签仅在显式 `--tag` 时应用。
- `build:product-ui:pack` 是显式构建并打包入口：只有构建命令成功退出才调用打包；普通 `build:product-ui` 的行为不变。其他项目在自己的已授权构建成功后显式调用 `forgeway pack create`。
- Skill 安装器按 `package.json.files` 复制运行包，并在本机安装目录记录每个已安装文件的 SHA-256。后续只更新与该记录一致的文件，保留本地改动；无安装记录的旧副本可用 `--update-from-head`，但仅允许更新与当前 Git HEAD 逐字节一致的文件。
- 默认安装仅管理 Skill 副本。显式 `--runtime-dependencies` 在该副本内安装锁定的生产依赖。显式 `--bin-dir` 先核对依赖，再在指定目录创建命令，拒绝覆盖同名文件。包内 CLI 的使用不依赖全局命令或新增环境变量。
- 升级时对比旧安装账本和当前分发清单，只移除旧账本归属且SHA-256仍匹配的退役文件；未知文件保持。退役路径越界、非规范路径别名、符号链接、目录或本机改动均在写入前拒绝，原文件和安装账本保留。已经不存在的退役文件可从新账本移除。`--check`只报告待退役数量，不执行删除；结果的`retired`与`maintenance`分别计数，`removed`为实际删除总数。

- 仅更新文档等文件且未请求依赖安装时，若旧收据已验证、分发锁文件未变，安装器只读复核现有依赖树与锁库存后保留验证状态；复核失败在复制文件前停止，不自动重装依赖。锁文件变化时不得沿用旧验证。

## Contract lifecycle and verification

`forgeway-pack/1` 由 Forgeway CLI 生产，非 LLM consumer 是调用该 CLI 的脚本或宿主；`tooling/pack.mjs` 验证输入与实际 ZIP，`fixtures/pack/test-core.mjs` 验证只读路径。格式版本或语义改变须升级版本并更新消费者；旧版仅在明确保留消费能力时继续有效，移除前确认无调用方。实际 ZIP 及已安装命令的行为须分别回读；dry-run 不证明压缩成功。
