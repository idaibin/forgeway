# Tooling

## Pack and installed command

`forgeway pack doctor` checks local Info-ZIP availability. After an authorized build
has completed, `forgeway pack create dist --project project-name` creates a checked
ZIP on the desktop; `--out <existing-directory>` selects another destination.
`--dry-run` previews without writing. `npm run build:product-ui:pack` explicitly
builds Forgeway Product UI and packs its `product-ui/dist` only after build success.
Normal build commands do not package automatically. See
[REQ-FORGEWAY-003](../product/features/REQ-FORGEWAY-003-pack-and-cli-install.md).

The CLI ships with the Skill. Resolve the verified absolute directory of the
loaded `SKILL.md`, then use `node "<skill-directory>/tooling/forgeway.mjs" <arguments>`
from the task's working directory. Examples use the shorthand `forgeway`. A verified
client-registered entrypoint for the same installed package is also usable.

After a Skill-manager install, prepare only this copy's locked dependencies with
`npm --prefix "<skill-directory>" ci --omit=dev --ignore-scripts` when the CLI is
needed. Use `node scripts/install-skill.mjs --target <skill-directory>` for an
owned Skill installation from source. Add `--runtime-dependencies` to install
runtime dependencies in that target. Add `--bin-dir <directory>` only if a standalone
shell command is explicitly wanted. `--check` previews the selected operation.
An owned install records
file hashes for later updates; `--update-from-head` supports old installations
whose files equal this checkout's HEAD baseline. Existing
unrelated commands are never overwritten. For one known, owner-verified local
file drift, repeat `--expected-installed-file <relative-path>=<sha256>` with that
file's exact installed SHA-256. The path must still be an owned file in the current
distribution; every other drift remains a conflict. `--check` reports the
reconciliation without writing. This does not authorize unmanaged, retired, or
additional modified files.

For dependency preparation or retained-runtime verification, use the
[project-managed development toolchain](#development-toolchain-and-checks).
The installer preserves `package.json` and resolves `npm` through `PATH`; the
declared npm's `ci` and `ls` enforce that package's `devEngines`. The `engines.node`
consumer floor does not by itself validate this separate npm process. `--check`
does not invoke npm, so preview success does not verify this prerequisite or minimum-runtime CLI behavior.

### Repeat a managed Forgeway update

Choose the requested effect first. A source-only Git synchronization belongs to
the existing native repository owner; it does not change installed files or wait
for an installation consumer window. The `--sync` command below is **combined Git
sync plus installed-file update**, not a Git-only shortcut. See the
[effect/window standard](../standards/maintenance.md#select-the-effect-and-its-consumer-window).

For installed-file updates, first bind the actual source/ref and target. The
existing `maintenance doctor --source-root <checkout> --installed-root <installation>`
reads source/installed file hashes; `node scripts/install-skill.mjs --target <installation> --check`
previews the current local source's installation counts, snapshot and applicable
reconciliations without writing. These are not approval or persisted apply tokens,
and do not preview a remote revision that has not been synchronized. If the selected
revision changes, recollect the affected source/install delta before applying.

From an independent, owner-approved Forgeway Git checkout, during the existing
host's confirmed component-scoped consumer window, run one original installer command:

```sh
node scripts/install-skill.mjs --sync --target <installation> --backup-dir <new-private-directory>
```

`--source-root` may select another explicit checkout without changing the real
running root. The default is the checkout's `origin` / `main`; `--remote` and `--branch` select
another explicitly approved ref. The remote must match this package's repository
identity. The command pins the observed remote SHA, saves and reads back source
bytes plus staged/unstaged patches, a verified Git bundle, and owned installed
files/ledger, then performs only a fast-forward and the original in-process
prepare/apply/verify transaction. It never imports newly fetched scripts. The
receipt distinguishes the updater file/basis read before sync from the source
commit distributed afterwards. Backups are private recovery evidence, not a new
Task ledger; keep them until the owner accepts the update and recovery path.

Dirty or divergent source is preserved and reported, not stashed/reset/cleaned.
The source must have complete Git history: shallow checkouts are rejected before
remote sync, backup creation or installation; the command never unshallows them.
Ignored files are neither deleted nor claimed backed up. Unknown Git hooks,
filters, submodules, source drift, installed customization and an active/partial
installation stop the affected update. Backup limits fail explicitly, never
silently omit files. Restore source from the bundle plus the two patches/raw
working files only through the existing owner; there is no automatic rollback
that might overwrite later edits. Installation failures retain the original
journal/reconcile/recover semantics and report which Git/install phase ran.
An unconfirmed Git sync reports `source_synced:null`; the owner must reconcile it
before another attempt, not infer that a failed command left the checkout intact.

The host's exact `GIT_PAGER=cat` is accepted for noninteractive output; source Git
commands use `--no-pager`. Other pager values and unreviewed Git overrides still stop.

Standard Git LFS definitions may remain configured without installing or invoking
Git LFS when no examined path selects a filter. Git's own NUL-delimited attribute
queries cover current worktree/index paths before status/diff, then the union of
current and fixed target-tree paths in worktree/index/target views before merge,
including effective info/global and nested attributes. Active filters and unknown
execution definitions still require separate review; no filter is disabled. This
requires Git support for `check-attr --source` and does not promise safety against
concurrent external configuration changes outside the caller's approved window.

This update keeps `binDir:null` and `runtimeDependencies:false`, never changes the
wrapper or runs dependency installation. A dependency-bearing package requires
an already verified identical runtime lock, freshly checked by offline `npm ls`
and the original lock validator in both apply and verify. A changed/missing lock
needs separate preparation. The real running root is passed to the installer:
invoking this from the installation being replaced is rejected, not disguised as
another source. The caller still owns authorization, single-writer coordination
and the consumer window; `--sync` does not create these facts. Success means fixed
source and installed-file readback, **not** host activation/loading or behavior.
Apply the [effect/window standard](../standards/maintenance.md#select-the-effect-and-its-consumer-window)
to target consumers, unknown windows and separate loaded claims. Read the returned
backup, phase and Git/install evidence before any retry.
This command does not publish remote refs, integrate divergent branches, push,
delete branches or manage other products; its source change is only the local
fast-forward described above.

## Artifact inspection

`forgeway artifact doctor` checks Python 3.10+, `file`, and optional `lipo` availability.
`forgeway artifact inspect <path>...` reads existing files and reports SHA-256, file
type, detectable architectures, and ZIP/TAR member names. Repeat `--expected-arch`
and `--require-member` to assert expectations; `--max-members <count>` limits the
reported member list. Rule version `0.2.0` rejects every TAR symbolic/hard link and
every ZIP member whose external file type declares a symbolic link, regardless of
its target. Rejected member names appear in `unsafe_paths`, including members beyond
the listing limit. ZIP private link extensions and actual extraction behavior are
outside this guarantee. An unmet check exits 1. It does not build, extract, or execute
the inspected artifact. Results are JSON and retain the original inspector's
`{command,data,ok}` envelope. See
[REQ-FORGEWAY-004](../product/features/REQ-FORGEWAY-004-artifact-inspection.md).

## Browser recording

`forgeway browser validate --flow flow.json` checks a bounded declarative flow.
`forgeway browser doctor --chrome /path/to/chrome` checks the local recorder.
`forgeway browser record --flow flow.json --out recording.mp4 --launch-headless --chrome /path/to/chrome`
uses an isolated temporary Chrome profile. For an existing Chrome that already exposes
loopback CDP, use `targets --endpoint http://127.0.0.1:PORT` and then `record` with
the same endpoint and `--target-id ID`. The target URL must match exactly; the CLI
does not set browser Dimensions. It requires `ffprobe` on PATH and Chrome with
`Page.startScreenRecording`. Exit 3 means a runtime failure or a recording that
missed the configured smoothness threshold. The flow format and acceptance rules
are in [REQ-FORGEWAY-002](../product/features/REQ-FORGEWAY-002-browser-recording.md).

Example flow:

```json
{
  "schema_version": "forgeway-browser-flow/1",
  "target_url": "https://example.com/",
  "capture": { "frame_rate": 30, "min_fps": 20, "max_width": 1920, "max_height": 1080, "audio": false },
  "preflight": [{ "action": "wait", "selector": "main", "state": "visible", "timeout_ms": 5000 }],
  "steps": [
    { "action": "move", "x": 200, "y": 150, "duration_ms": 400 },
    { "action": "click", "selector": "button[data-action='open']" },
    { "action": "wait", "selector": "[role='dialog']", "state": "visible", "timeout_ms": 5000 },
    { "action": "pause", "duration_ms": 1000 }
  ],
  "max_duration_ms": 15000
}
```

## Machine knowledge and delivery

- `forgeway.mjs` is the versioned non-LLM CLI consumer for Repository Asset Graph,
  Capability Registry v3 inspection/resolution/dependency checks, PackageManifest
  creation and Delivery projection.
- `repo-graph/` owns the rebuildable SQLite asset/edge index plus validated JSONL
  exchange. It indexes project authority; it does not own Product, DESIGN, source,
  contract or runtime truth.
- `delivery/` owns immutable PackageManifest, Run, Attempt, Observation, Receipt and
  data-driven gate projection. Derived reports are never projection inputs.

Run `npm test` to execute Schema semantics plus both machine-core fixtures. The
SQLite stores and rendered maps are run-local outputs and are not committed.

## Development toolchain and checks

`package.json` owns the development Node pin through `devEngines.runtime` and the
npm pin through `packageManager`. pnpm manages the runtime and package-manager
executables; npm retains dependency installation, scripts and `package-lock.json`.
Check `node --version`, `npm --version` and the CLI `--help` from this repository.
The declared runtime engine floor is distinct from the fixed development version;
a pass on the development version does not prove every supported lower version.
CI explicitly prepares the same managed versions before `npm ci`.

During iteration select the affected `test:workflow`, `test:delivery`,
`test:context`, `test:capability` or `test:product-ui:model` script. Typecheck uses
noEmit. Workflow recovery checks create and clean temporary databases and invoke
fresh local CLI processes; they do not require a target-project database.
`npm test` also starts the HTTP demo; run it only when that service boundary is
authorized. Full-suite, browser and installation evidence remain separate.

## Workspace initialization and physical checks

```sh
forgeway init <new-target> --name <display-name>
forgeway init <new-target> --name <display-name> --app api --app admin
forgeway init <new-target> --name <display-name> --project-type fullstack --stack frontend=react --stack backend=rust
forgeway init <new-target> --name <display-name> --project-type backend --app api --stack api=node
forgeway workspace check <workspace-root>
forgeway workspace resolve <workspace-root> --app frontend
forgeway init <new-target> --name <display-name> --starter http-demo
node tooling/demo-run.mjs <workspace-root>
```

The target parent must already exist. Existing targets, symlink paths, `--force` and
`--output` are rejected; repeat initialization never overwrites project decisions.
Use physical paths (on macOS, resolve `/tmp` or `/var` aliases before using them).
Only the new outer Git root is initialized; nothing is committed or installed.
Explicit project types are frontend/backend/fullstack/cli/library. Select every app
with repeated `--stack app-id=vue|react|java|rust|node|vanilla`; unknown, duplicate,
incomplete and incompatible choices fail before creation. Full compatibility and
default-slot rules live in Workspace Bootstrap. No-option bootstrap is undecided,
not detected application code; HTTP demo is fixed fullstack vanilla/Node. Real
framework scaffolding is a separate authorized native capability. Existing projects
retain native layout/toolchain; this init always refuses an existing target.
Applications are nested under ignored `/apps/`; their Git/source owners remain separate.

The portable `.forgeway/workspace.json` stores a stable workspace ID, display name,
application slots and the source PackageManifest identity. `.forgeway/source-package.json`
uses the existing delivery PackageManifest contract, recording actual dirty/untracked
source plus HEAD rather than pretending HEAD contains local changes. Invoke the matching
Forgeway checkout; source drift is reported, never silently rebound. No absolute host
paths, symlinks to external standards, Skill copies, or fake Project manifests are emitted.

To override HTTP defaults, create `.forgeway/http-api-overrides.json` using the existing
override format below. Both `workspace check` and `resolve` validate it. The host calls
`resolve` with the explicit outer root and app ID even when an app has its own Git root;
the output supplies shared authority references and effective HTTP conventions without
assuming parent guidance is automatically loaded. Outer-directory rename requires no
descriptor rewrite. Changing a slot ID/path is an explicit project-owner change.

Exit 0 means bootstrap validity only; check findings exit 3, invalid input exits 2.
The checker never executes project commands or reads application source as instructions.
It verifies the real root, non-symlink slots, root/effective ignore rules, tracked ignored
paths, source package integrity/basis and guidance identities. Checks do not replace the
existing `node tooling/validate.mjs --artifact project <manifest.yaml>` once a project
owner has real commits, owners, contracts and commands to record.

Lifecycle, limitations and required acceptance: [Workspace Bootstrap v1](../standards/workspace-bootstrap.md).
Focused gate: `npm run test:workspace`. This extends the existing Node ESM CLI; no
runtime/package-manager migration or Bun/Deno compatibility claim is made.

The opt-in HTTP demo materializes example backend/frontend source and SQLite migration,
not shared standards. It requires default frontend/backend slots. The run command explicitly executes the
example using only loopback ports and an ignored test database. Maintainer test
fixtures are outside this runtime package. Production authentication,
arbitrary technology stacks, and automatic workflow closure are not provided.

## Default HTTP API convention resolver

`forgeway standards resolve [--overrides relative-profile-override.json]` consumes
the versioned default profile in `standards/` and emits effective convention values,
the fixed default basis/hash, caller override hash (without its path) and whether
caller overrides were applied. It only
accepts explicitly supported response, pagination, Token/external auth and request-ID
parameters; it rejects unsafe names/paths, version mismatch and conflicting values.
It writes only stdout, does not alter caller files or the default profile, returns
`authorizes_execution: false` and makes no project/runtime conformance claim.

The profile is a Forgeway machine format with lifecycle metadata: its source repository
is producer, this CLI is the non-LLM consumer, `tooling/http-api-profile.mjs` is the
validator, the fixed hash/version is the drift rule, and versioned replacement is the
retirement rule. Any byte/lifecycle change requires a new `profile_version`; it does
not replace project-native OpenAPI, DTOs or authentication.
Focused acceptance: `npm run test:http-api-profile`.

Minimal override input (JSON only; it is read but never rewritten):

```json
{
  "schema_version": "forgeway-http-api-override/1",
  "profile_id": "forgeway.default-http-api",
  "profile_version": "1.0.0",
  "convention": {
    "response": { "success_code": 0 },
    "pagination": { "default_page_size": 20, "max_page_size": 100 },
    "request_id": { "response_header": "X-Acme-Request-Id" }
  }
}
```

Allowed overrides are response `code_field`, `message_field`, `data_field`,
`success_code`; pagination `items_field`, `total_field`, `page_field`,
`page_size_field`, `default_page_size`, `max_page_size`; request ID
`response_header`; and auth `mode`, `authorization_header`, `token_scheme`, and
the four `routes` keys. Token mode requires the complete effective
`Authorization: Bearer` convention and login/me/logout routes (refresh is `null`
unless explicitly enabled). External mode, including native Cookie or SSO, requires
all local routes plus Authorization/Bearer fields to be `null`; its real mechanism
remains in the target project's native authority.

The resolver accepts strict JSON only. It rejects duplicate object keys recursively,
including escaped spellings of the same key, before semantic validation; parse errors
do not echo caller-provided JSON.

`validate.mjs` is the Artifact validation entry point in v1. It:

- compiles every JSON Schema;
- validates machine templates and positive fixtures;
- requires every negative fixture to fail;
- enforces Portfolio count/profile/unique-ID rules;
- enforces topology cardinality, repository/component uniqueness and references;
- validates campaign-owned and project-owned manifest placement without reading target repositories;
- binds 1.1 Portfolio Results to repository/component basis and required gates;
- aggregates required component gates, rejects required `not-applicable`, and requires gate-specific Evidence IDs for `pass`, `fail`, `partial` and `blocked`;
- rejects duplicate repository identity values, cross-gate Evidence reuse within one result scope and campaign manifest paths outside their exact campaign;
- rejects absolute or parent-traversal paths and secret-value fields;
- checks repository-local Markdown links;
- emits a concise JSON result and exits non-zero on any finding.

It does not clone projects, guess commands, execute target repositories, modify files, or collect credentials. Target execution remains a separately authorized consumer.

## External read-only validation

```bash
npm run validate -- --artifact project ../target/delivery/project.yaml
npm run validate -- --artifact requirement ../target/delivery/requirements/REQ-DEMO-001.yaml
npm run validate -- --portfolio evaluation/portfolio.example.yaml
npm run validate -- \
  --portfolio-result .codex/artifacts/portfolio-result.yaml \
  --portfolio .codex/artifacts/portfolio.lock.yaml
```

Portfolio Result validation requires the immutable input Portfolio and checks its byte-level SHA-256, campaign, system SHA, profiles, gates, project IDs, project SHAs, modes and Requirement IDs. Unknown flags, missing files and invalid artifacts exit non-zero. Output labels use only the input basename so a recorded report does not leak a machine-local path.

Version 1.1 validates topology-aware Artifact and Portfolio result metadata but does not scan an adopted repository to close IDs across separate files. It never clones or executes a target repository. The host MUST perform cross-file closure for an explicit target; a bundle index will be added only when a real non-LLM consumer proves the need.

## Capability dependency check

The host supplies current Registry v3 and runtime adapter snapshots. For example,
when the accepted slice needs asset querying (paths are illustrative host inputs):

```bash
node tooling/forgeway.mjs capability check \
  --registry /path/to/current-registry.json \
  --adapters /path/to/current-adapters.json \
  --require repository.asset.query@1.0.0 \
  --optional repository.asset.scan@2.0.0
```

Repeat `--require`/`--optional` for additional exact capability versions. When the
host has selected an adapter, add `--select repository.asset.query=adapter-id`.
No requirement ID may occur twice; version ranges and comma-separated lists are
not accepted. Required selection ambiguity blocks; optional ambiguity warns.

Output is `forgeway-capability-check/1` JSON with snapshot hashes, requirement
statuses, selected/compatible adapters, blocker/warning counts,
`compatibility_satisfied` and `authorizes_execution: false`. Exit codes: `0` required
compatibility satisfied, `3` required gap with a report, `2` invalid input/IO with a
JSON error on stderr. The check emits stdout only and rejects `--output` to prevent
accidental snapshot replacement. It has no auth, network, installation or execution
step. See the [handoff contract](../runtime/capability-handoff.md) for lifecycle and
the [optional project decision template](../templates/project-capabilities.md).

Focused acceptance: `node fixtures/capability/test-check.mjs`. This module extends
the existing Node ESM CLI and its declared Node engine floor; it deliberately uses
the existing filesystem/hash APIs rather than introducing a Bun-only dependency.
It does not claim Bun or Deno runtime parity or change package-manager ownership.

## Capability directory

Use the existing inspect entrypoint for a capability-first read-only report:

```sh
node tooling/forgeway.mjs capability inspect --view directory \
  --registry /path/to/skills-index.json \
  --adapters /path/to/runtime-adapters.json \
  --result-ref repository.asset.query=run:explicit-result
```

`--adapters` and repeated `--result-ref capability-id=reference` are optional;
`--capability-id`/`--capability-version` narrow the existing semantic selection.
The first layer lists declared tasks, input/precondition invocation contracts,
expected outputs/postconditions, candidate compatibility and gaps. Implementation
rows contain native package/adapter declarations once; shared names do not bind
them to a physical component. Adapter offers absent from the Registry remain in
`unresolved_offers` with unknown bindings rather than being assigned by name. Skill/CLI/plugin form and combinations remain unknown
unless native evidence establishes them. Multi-candidate selection stays ambiguous;
use existing resolve/check for explicit host selection, not a directory preference.

Readiness, actual execution, verified effect and efficiency remain unknown even
with compatible contracts or result links. Results are caller-declared links only,
with unknown verification/participation; the reader never opens their targets.
Accepted links are HTTPS without credentials, opaque `run:`, `attempt:`, `obs:`,
`pkg:`, `observation:`, `package:` or `urn:` refs, or repository-relative references
without traversal. Canonical Observation/Package IDs use `obs:`/`pkg:`; the longer
`observation:`/`package:` forms remain accepted. Acceptance does not validate the
target's schema, existence or identity. No graph or
user database is opened, no source command is invoked and no authorization granted.
Directory exit 0 means the report was produced, not that a capability is callable.

The view reuses `forgeway-capability-inspection/1` with `view:directory`, hashes the
explicit snapshots and emits stdout only (`--output` is rejected). Each input is a
regular non-symlink file with at most 1 MiB content and a shared-reader overflow
probe/re-read; the two-file invocation consumes at most roughly 4 MiB actual read
bytes. Registry/adapter counts, 4096-character strings, 20000 JSON nodes, depth 24
and 64 links are bounded. Malformed/oversized inputs exit 2 with no success report.
Rerun after source snapshot changes; link targets are not read or certified.
Default inspect/resolve/check retain their current output and permission semantics.

Acceptance stays in `node fixtures/capability/test-check.mjs`, which also runs the
directory consumer fixtures. Scope/ownership/version/drift/retirement are defined
in [project capabilities](../standards/project-capabilities.md).

## Native artifact capture and fixed export

`tooling/context/native-artifact.mjs` provides `createNativeArtifactRun` for a caller-selected Run/Attempt and exact Packages, using the existing typed-artifact reader/host codec port. The caller supplies scoped capture permission, native source identity and explicit capture status; native finish is not a business gate. The returned in-memory store is caller-owned and must be closed. No provider codec or receipt is guessed.

`exportNativeWorkspace(projection, { verifyExport })` maps validated Context Projection v1 to the existing Product UI v2 read-only shape. Its required host verifier binds projection/event hashes, Run, input/result Packages and basis; content hashes alone cannot grant trust. It does not install a provider, open private storage, create a native session, calculate new gates, or silently return the demo. This port has no new persistent format: existing contracts/validators and host-owned codecs retain their version, drift and retirement ownership.

Run `npm run test:context` for the existing context fixture and the native capture fixture. A passing fresh-process machine readback is distinct from second-AI, browser and full engineering acceptance.

## Browser Mock verification

The bundled `forgeway browser mock` commands use the same validated configuration as
the extension manager. `playwright-core` is a production dependency; the browser is a
caller-selected executable and no browser is downloaded automatically. Extension-backed
`open` requires a Chromium build that permits command-line extension loading. Current
branded Google Chrome builds remove the required flags; use a compatible isolated
Chromium or Chrome for Testing executable for that path. `temporary` does not load an
extension and is separately supported by a caller-selected Chrome executable.

```sh
forgeway browser mock extension
forgeway browser mock validate --config project-mock.json
forgeway browser mock open --config project-mock.json --project demo --environment local --scenario populated --url http://localhost:8080/app/ --chrome /path/to/chrome --session /tmp/demo-mock-session
forgeway browser mock status --session /tmp/demo-mock-session
forgeway browser mock resume --session /tmp/demo-mock-session --config project-mock.json --url http://localhost:8080/app/
forgeway browser mock stop --session /tmp/demo-mock-session
```

`open` requires a new session directory. It creates an isolated persistent profile,
a bundled extension copy with the selected page-origin permission, and a browser
owner process. The CLI exits after the manager imports the configuration and prepares
one blank tab before navigation; the browser remains open. The target displays Mock
ON. `--headless` is optional and takes no value. A login redirect may return
`navigation-required`: finish login in that same test browser, then use `resume`.
`open` and `temporary` accept `--viewport WIDTHxHEIGHT` for an isolated task-owned
browser (for example, `375x812` for H5); the default remains `1920x1080`.
Both commands read back the effective page viewport. This controls viewport size,
not a complete phone hardware, touch, or device-scale emulation profile.
It prepares the same tab again before navigation and never copies another profile's
credentials. `status` verifies profile/extension command-line identity and reads the
actual binding and indicator; `stop` closes only that browser.

Rules can mock, explicitly pass a verified real read, or block. Unknown protected
requests are denied; there is no automatic network fallback. Viewing CLI sessions
reject write+pass. The manager supports project/environment/scenario selection,
JSON editing, import/export, logs, delay, HTTP/business errors, JSON, text, and base64
media responses. Configurations and business fixtures remain with their target
project. See [configuration](browser/mock/CONFIG.md) and
[feature behavior](../product/features/REQ-FORGEWAY-005-browser-mock.md).

Only top-document fetch and asynchronous XHR are covered. Iframes are excluded.
Resource/navigation loads, workers, WebSockets and beacon require separate evidence.
UI data consumption, real-service integration, raw transport checks and publication
remain independent. Active sessions are deliberately retained until `stop` or the
user closes Chrome. Their profile contains their own browser state; keep the session
folder private. Installed runtime dependencies use the installed package lock:
`npm ci --omit=dev --ignore-scripts` in the installed runtime directory.

持久使用时：`forgeway browser mock extension --config project-mock.json --project demo --environment local --scenario populated --url http://localhost:8080/app/ --directory /new/mock-extension` 生成含自动场景的来源受限扩展目录。通过 Chrome 支持的安装流程加载一次后，刷新、重新打开和重启浏览器均自动生效。通用扩展也可在管理页选择“自动启用此环境”；关闭后保留关闭状态。自动环境不允许范围重叠或真实业务写放行。命令不安装到日常 Profile，不激活已有浏览器。要求全程后台时，仅进行文件生成、后台协议或 headless 验证；不能用前台安装代替后台能力。

自动验收须遵循[后台测试规范](../standards/evidence.md#browser-testing-without-foreground-interruption)：默认任务自有 headless/后台目标，保持用户窗口和所选标签页不变，包含点击后弹出的模拟详情页；不得反复打开已通过的详情用例。门户 Mock 测试不授权修改门户业务源码，后台能力不足时保留受影响验收为 `Not verified`。

AI控制Forgeway自有会话：以 `open --headless` 启动后，执行 `forgeway browser mock apply --session /owned/session --config project-mock.json --url http://localhost:8080/app/` 更新并自动启用环境；`resume` 使用相同流程，两者不激活窗口。`status` 回读配置语义hash、自动设置、绑定和页面标识；active要求全部匹配，旧绑定或配置漂移显示stale。此入口校验自有Profile与扩展管理页身份，不连接日常浏览器，也不改变浏览器工具安全策略。

临时验证使用 `forgeway browser mock temporary --driver playwright|cdp`：复用项目配置，在新建无界面Context执行项目flow，finally撤销并核验原响应和关闭；Codex内置浏览器使用相同模块的CDP宿主适配。见 [临时 Mock](browser/mock/TEMPORARY.md)。

本地 HTTP Mock 代理使用 `proxy-start`、`proxy-update`、`proxy-status`、`proxy-stop`，消费同一项目配置，通过项目开发服务接入，仅监听本机回环地址并使用私有会话凭据。见 [本地代理](browser/mock/PROXY.md)。

For interactive create/edit/delete Mock journeys, use the project-owned [state adapter](browser/mock/STATEFUL.md). Keep business reducers and fixtures in the project; Forgeway owns transactional state and persistence. Require dependent-query and reload readback, and keep static display samples distinct from stateful mutation evidence.

## Single-step workflow dispatch view

```sh
node tooling/workflow-stage.mjs next --view dispatch --copy-snapshot --state <workflow-state.json> --delivery-db <delivery.sqlite> --skills-index <skills-index.json> --adapters <adapters.json> --capability-id <explicit-stage-candidate>
```

Optional `--adapter-id` disambiguates compatible adapters; `--compact` changes JSON
formatting only. The view preserves original next fields and adds `dispatch` input
Package/hash, contract resolution and pending host checks. It emits stdout only.
Exit 0 means contract-compatible/kernel-owned (or the goal already complete), not
permission or runtime success; 3 reports a stop/gap and 2 invalid input. Non-capability
or stopped/running stages never load supplied catalog snapshots. See
[the owner contract](../standards/workflow-stages.md#single-step-dispatch-view).
Canonical resolver/manifest checks in `capability-core.mjs` now serve both existing
capability CLI and this consumer; no process, file, argv or stdout API exists there.
Run `node fixtures/workflow-stage/test-dispatch.mjs` plus existing capability,
workflow and full repository gates. This view triggers no usage collection or analysis.

The read-only Graph reader currently requires a completed rollback-journal SQLite
snapshot with no WAL/SHM/journal sidecars. It rejects WAL before opening SQLite
(`DELIVERY_READ_ONLY_SNAPSHOT_REQUIRED`): SQLite readOnly may update SHM. The host
must provide a consistent completed snapshot; this command never checkpoints, copies
a live database, or claims live-WAL support. Keep the input stable while reading.

`--copy-snapshot` is mandatory for both next views: it explicitly permits a bounded
private temporary copy (64 MiB maximum, two stable reads) removed on close/error.
SQLite opens only that controlled copy, never the caller path after preflight.
Missing permission returns DELIVERY_READ_ONLY_COPY_REQUIRED without copying.
Do not pass a live database; WAL/journal remains unsupported. There is no implicit
copy, chmod, checkpoint, migration or assertion that input bytes are trusted.


### Owner-qualified normative artifact input

`createAcceptedArtifactValidator` from the Delivery SDK wraps the existing external
artifact validator for normative wire consumers. Supply a fixed current owner/scope,
source-basis hash, Result Package, content hash, contract/version and
`purpose: normative-wire-schema`, plus trusted synchronous `qualifyAcceptance` and
`validateArtifact` code ports. Qualifiers must independently resolve owner acceptance
and unresolved semantics; never deserialize a grant function or trust an artifact's
accepted tag. The native validator runs only after exact qualification, receives its
receipt, and returns the existing hash/package-bound typed attestation. Reuse the
existing typed-artifact authorizer/gate; this does not make a draft Ready or satisfy
other protocol gates. No production HQ bridge is bundled. Run the existing typed
artifact input fixture for real consumer/gate negatives and the qualified positive.

CLI invocation admission is `forgeway-workflow-cli/2`; see the [explicit next migration](../runtime/workflow-state.md#cli-v2-snapshot-admission-migration). The 31 fixed parity cases cover capability commands only. Twelve additional initial/blocked next comparisons verify the admitted old/new projection and explicit rejection of the old invocation; this does not prove every terminal or host combination.

## Optional reference lookup

```sh
forgeway reference lookup --need "Find a UI method" --topic ui \
  --index <handbook-references.json> --revision <expected-40-hex-source-revision> \
  --stage design
```

The explicit snapshot is the Handbook-owned `registry/references.json`, not a
Forgeway mirror. Repeat `--topic` for AND matching and `--constraint` for task tags.
Every entry `applies_to` tag is required; any `excludes` tag rejects it. `--stage`
uses the index's phase tags (for example `design`), not Forgeway kernel Stage IDs;
an empty entry stage list is cross-stage. Optional `--kind`, `--allow-status` and
`--allow-evidence` can be repeated; defaults are any kind, `reference` status and
`source-read` evidence. Other declared values are not silently treated as verified.

No `--need`, blank need, or no nonblank topics returns `skipped` before reading the
index. An active query requires `--index` and an exact `--revision`. Results are
`matched`, `miss`, `stale`, `unavailable` or `skipped`, with no reference body reads.
A match emits declared metadata and fixed source locators only; optional misses,
staleness and missing/inaccessible snapshots exit 0 without promoting any gate.
Malformed input/index and reader integrity errors exit 2, not a successful miss.
Snapshots over the existing 1 MiB reader limit return `REFERENCE_INDEX_LIMIT`;
valid Unicode metadata/tags/relative paths are not restricted to English or ASCII.
`--output`, unknown flags and extra arguments are rejected; stdout is the only output.

The report pins index bytes and labels `authorizes_execution: false` and
`source_content_verified: false`. Neither metadata rights nor evidence labels
establish effective permission, accepted design, source authenticity or freshness.
An existing host may separately read the useful selected locator and verify its
hash, but this command never fetches a body, starts a Skill/Agent, or executes a
prompt. See [optional-reference rules and limits](../standards/project-capabilities.md#optional-handbook-references).
Run the ordinary-file focused contract with `npm run test:references`; it does not
exercise special-file readers, browser execution or live host adoption.
