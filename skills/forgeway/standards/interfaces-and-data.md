# Interface and Data Standard

## Interface

- API 合同设计、修订与验证按 [API Contract Skill](./api-contract-skill.md) 使用外部 `api-spec` 能力；通用 Skill 由 Skills 仓库维护，项目原生合同仍是权威。
- 产品需求在接口设计前 MUST 明确业务语义、身份、权限、数据范围、成功和失败场景。
- 项目 MUST 为每个服务指定唯一原生接口权威，例如 annotated controller、typed router、IDL 或手写 OpenAPI。未另行声明时，语义 owner 默认是后端服务 owner，不要求在契约中记录人员信息。
- 项目 MUST 明确采用 code-first 或 contract-first，且不得同时手写两套请求、响应和错误权威：
  - code-first：从后端路由和 DTO 生成或校验 OpenAPI；
  - contract-first：先接受 OpenAPI，再由后端实现与合同测试证明一致。
- 手工设计 OpenAPI 时 SHOULD 使用便于审阅和差异比较的 YAML。只有命名工具或消费者要求 JSON 时才生成 JSON；转换结果 MUST 不成为第二权威。
- 前端 MAY 保留 UI view model 和薄 adapter，但 MUST 不手写与生成响应同形的 DTO。
- 本体系 `contracts/` MUST 不保存项目 endpoint、DTO 或 OpenAPI 副本，只保存权威引用和验证 gate。

## Response Body Envelope

[`default-http-api-profile.v1.json`](./default-http-api-profile.v1.json) 是可被 `forgeway standards resolve` 消费的默认约定，不是目标项目的 OpenAPI、DTO 或运行时合规证明。它具有明确 owner、producer、非 LLM consumer、validator、版本、drift 和 retirement 规则；解析输出固定默认文件 hash，且 `authorizes_execution=false`。项目可用同版本、白名单覆盖文件在本地改写允许的字段，但 MUST 在项目原生 OpenAPI/代码优先产物中记录最终 wire contract；安全与授权要求不因覆盖而失效。

未另行声明时，业务 HTTP JSON 响应默认采用统一外层信封（Envelope）：

```json
{
  "code": 0,
  "message": "",
  "data": {}
}
```

- `code`：整数，`0` 表示成功，非 `0` 为明确登记的业务错误码；HTTP 状态码仍保留真实传输与协议语义（如 401、403、404、500 等不得被一律抹杀为 200，也不得与业务 `code` 混淆）。
- `message`：字符串，供人类可读的展示或说明提示；程序与自动化逻辑判断 MUST 使用 `code` 或 HTTP 状态码，不得通过字符串匹配 `message`。
- `data`：对象或数组。具体接口针对特定业务操作固定其结构类型（固定为 Object 或 Array），MUST NOT 在两者之间随意切换：
  - 空列表/集合返回 `[]`，不得返回 `null` 或 `{}`；
  - 无业务返回数据的普通操作响应 `data` 返回 `{}`（或依据类型约定固定结构），保持格式稳定；
  - 分页接口的 `data` 是包含 `items`（列表数组）、`total`（总记录数）、`page`（当前页码）、`pageSize`（每页条数）的对象。
- `requestId` 不是业务响应必需字段。响应正文默认仅保留 `code`、`message`、`data` 三个字段；需要排障关联时，由服务端生成请求标识，放在 `X-Request-Id` 响应头并关联服务端日志。跨域前端需要读取时，服务端再配置 `Access-Control-Expose-Headers: X-Request-Id` 暴露该响应头。

默认 profile 的分页字段为 `items`、`total`、`page`、`pageSize`，默认每页 20、最大 100；项目可显式覆盖字段或限制。字段名必须分别无冲突，默认值不得超过最大值。请求 ID 响应头可设为 `null` 表示未采用；非 null 只允许大小写无关的 `X-Request-Id`、`X-Correlation-Id`、`X-<project>-Request-Id` 或 `X-<project>-Correlation-Id`。该封闭关联头命名空间排除凭据、Cookie、传输、缓存、CORS 和安全控制头，不通过维护无限黑名单实现。

## Authentication, Token and Security Context

项目涉及用户认证与授权时，默认规范 MUST 同时覆盖：**登录接口、Token 传输、后端用户上下文、权限检查、过期处理和退出撤销**，项目再选择具体实现。

针对 **Token 模式**，默认接口与职责约定如下：

| 接口 | 职责 |
|---|---|
| `POST /auth/login` | 校验登录凭据，返回访问 Token、类型（如 Bearer）和有效期（如 expiresIn） |
| `GET /auth/me` | 返回当前用户可公开的信息、角色和权限（供前端构建界面与权限守卫） |
| `POST /auth/logout` | 撤销当前登录会话 / Token 状态 |
| `POST /auth/refresh` | 仅在启用刷新机制时提供，换取新访问 Token |

后续受保护请求统一在 HTTP 标头中携带：

```http
Authorization: Bearer <accessToken>
```

- Token MUST NOT 放在 URL 参数中传递；受保护接口仍需逐个鉴权。
- 后端统一经过认证中间件：
  ```text
  读取 Token
    → 验证有效性、有效期和撤销状态
    → 确定用户身份
    → 加载当前账号状态、权限与数据范围
    → 建立请求级 CurrentUser 上下文
    → 业务接口执行权限检查
  ```
- 业务代码 MUST 从 `CurrentUser` 请求上下文获取 `userId` 等身份信息，**严禁把前端请求参数（path/query/body）中传来的 `userId`、角色或租户标识直接当作当前操作者身份**，防止越权。
- `/auth/me` 是给前端获取用户资料用的，后端内部不需要每次再请求它，而是通过中间件注入的上下文获取。
- Token 可以是服务端会话对应的随机凭据，也可以是 JWT。若使用 JWT，MUST 验证签名和相关声明（如 exp、iss、aud、nbf），不得只解码；遵循 OWASP REST 安全指南。
- Cookie、SSO 或外部身份项目 MUST 由项目原生机制/OpenAPI 记录认证 wire contract。其 profile 覆盖使用 `auth.mode: external` 时，认证路由、Authorization header 和 Bearer scheme 必须全部为 `null`，防止默认 Token 语义被误当作已生效。

## OpenAPI Wire Contract

- OpenAPI 只描述线上接口：服务地址、method/path、参数位置、请求字段、响应字段、认证和已确认的 HTTP/业务错误。页面状态、请求封装、提示方式、重试 UI、部署结论和 `Not verified` 记录属于各自 owner，不得塞入 OpenAPI。
- OpenAPI MUST 使用标准 `components.securitySchemes` 以及根级或 operation 级 `security` 表达认证；明确匿名的 operation 使用 `security: []`。`x-*` 扩展 MAY 补充部署或权限细节，但 MUST NOT 替代通用文档、SDK、验证和测试消费者所需的标准安全语义。
- 每个有输入的 operation MUST 明确参数位于 path、query、header、cookie 或 JSON/multipart body；不得因为使用 POST 就推断为 `requestBody`。请求体和其中字段的必填性 MUST 分开表达。
- 每个非空成功响应 MUST 定义实际 wire schema。只有后端明确返回空 body 时，成功响应才 MAY 只保留状态说明。上传等前序接口返回且被后续接口消费的值 MUST 明确建模。
- 字段 MUST 按真实 wire 语义描述 object、array、required、nullable、enum、默认值、ID、日期时间、分页和约束，并为不明显的业务含义提供项目语言描述。条件必填、至少一项、互斥字段和 discriminator 分支 MUST 由可支持的 schema 组合或简洁描述加可执行合同测试表达，不得只留在实现注释中。`format` 只表达跨消费者有意义的 wire 格式，不为某个 Java 类型机械添加；`additionalProperties: false` 只在服务端确实拒绝未知字段时使用。
- 响应对象 MUST 标明消费者可以稳定依赖的 required 字段。示例在能改善评审、文档、fixture、SDK 或联调测试时 SHOULD 提供；空 schema、无语义字段和机械复制的错误响应集合 MUST 在晋升前解决。
- 单个 operation 独有且以人工审阅为主的 schema SHOULD 就地展开。只有多个 operation 共享同一稳定 wire 类型，或真实生成器/消费者需要统一 owner 时，才 SHOULD 提取到 `components/schemas`；不得仅为减少行数制造 `$ref` 跳转。
- `operationId`、`tags`、公共响应和其他生成元数据只在命名生成器、文档查看器或自动化消费者实际使用时要求。`info` 只保存文档元数据，服务前缀属于 `servers`。

## Contract State And Verification

- 契约门禁 MUST 同时声明 `authority_strategy: code-first|contract-first` 与 `phase: design|implementation`。contract-first `design` 阶段只评审并接受契约，源码一致性为 `not-applicable`；`implementation` 阶段才要求 Controller、DTO/Validation、Security/Data Scope 与错误映射符合已接受契约。code-first 的源码一致性和确定性生成在设计/实现阶段均适用。
- OpenAPI 的 owner 索引或生命周期元数据 MUST 标明其为 `draft` 或 `authoritative`，无需在每个 operation 重复。`draft` 表示仍在设计或等待 owner 确认；后端服务 owner 或明确的 contract owner 接受精确 scope、版本与内容 hash 后，契约即可成为 `authoritative` 并驱动 contract-first 实现。
- authoring owner、非 LLM consumer、可执行 validator、drift policy 和 retirement rule 属于生命周期闭环。只有真实存在 JSON、transport types、SDK 等派生产物时才 MUST 声明 producer；手写 contract-first YAML 不需要 Controller 解析器或生成器。缺失时 MUST 记录对应 gate 缺口并限制自动生成、兼容性或交付声明，但不得把已经由 owner 接受的设计权威重新降级为 draft。“AI 可以生成或阅读”不构成 consumer 或验证证据。
- 项目 MUST 使用固定版本、通用、check-only 的 OpenAPI parser/linter，至少检查结构、未解析引用、operationId 唯一性与安全性、path 参数、schema/example 类型以及安全声明。contract-first 文档 lint MUST 不依赖编译或启动后端；新增 API 只修改契约，不修改通用 validator。
- 前端调用和旧文档 MAY 用于发现遗漏或冲突，但不得反向确认后端 DTO、错误、权限或返回外层。冲突由原生接口 owner 裁决。
- 结构 lint、兼容性 diff、后端合同测试、生成客户端漂移、前端生成/adapter 测试和运行时联调是独立验证维度；分别记录 `Verified`、`Failed`、`Not verified` 或 `Not applicable`，任何一项通过都不得替代其他项，也不得使用单一 `verified` 状态掩盖各维度差异。只有 code-first 或实际派生链要求同一 fixed basis 连续生成两次并比较规范化结果。
- Forgeway Delivery Graph 使用 `protocolContractGatePredicates({ authorityStrategy, phase, hasGeneratedDerivatives })` 投影上述 fail-closed gate；门禁适用时 `authorityStrategy` 与 `phase` 必须显式提供，存在真实派生链时显式设置 `hasGeneratedDerivatives: true`。该投影只消费与 Result Package 绑定的 typed Observations，不读取 OpenAPI、Controller 或项目业务事实本身；同一 Result Package 的同一非 Receipt requirement 同时出现正负 Observation 时，负向结果优先。Receipt 可由同一目标后续 confirmed readback 收口，仍遵守其专用验证与授权合同。

## Data

- 数据库表、列、约束、索引和升级由项目 migration 权威负责。
- Product/Requirement 只描述业务对象、生命周期、数据影响和升级意图。
- 空库创建与已有数据升级 MUST 分开验证；若项目只支持重置，必须明确写出无升级承诺。
- API DTO、领域对象和持久化行 MAY 不同；不得为“一种类型贯穿所有层”牺牲边界语义。
- 受影响的数据 MUST 在其原生 owner 明确时间/时区与区间端点、单位/精度、排序、唯一性和
  归属；存储、接口、消息及展示的转换必须保持同一含义，不能按字段名猜测。用边界值及
  往返读取验证，UI view model 不成为第二份业务定义。
- 接口、配置、消息或存储格式的非兼容变化 MUST 先核对真实消费者和持久数据，记录迁移
  顺序、共存期（确有需要时）、失败恢复及验证。不得为消除冲突先改验收或擅自增加兼容层；
  最终接口文档只表达确认的现行合同，迁移执行信息留在原部署/发布 owner。
- 数据迁移 MUST 分开验证空库、既有数据、目标数据库及适用的旧版本消费者；明确失败时
  可重试、前向修复或恢复的条件。**代码回滚不等于数据回滚**，破坏性 schema/数据变化
  不得仅以切回旧应用版本作为恢复证明。
- 重要数据的备份、保留和恢复 MUST 按项目数据/运维 owner 定义范围、保留期、访问控制、
  可接受的数据损失及恢复目标；不得把一种策略强加给所有项目。备份成功记录只证明产物
  生成；只有在授权的隔离目标实际恢复并核对完整性、所需数据/版本和业务读取，才能声明
  该备份在所验范围可恢复。未恢复、未验证或仅检查文件存在时保留对应缺口；不因此授权
  导出敏感数据、覆盖现有库或演练生产恢复。
