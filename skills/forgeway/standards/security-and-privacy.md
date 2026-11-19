# Security and Privacy Standard

- Delivery Artifacts MUST store environment variable names, never credential values.
- Cookies, tokens, passwords, private keys, authorization headers, browser profiles and session storage MUST NOT enter Git, prompts, fixtures or evidence bundles.
- 接口认证与受保护操作 MUST 遵守 [Interface and Data Standard](./interfaces-and-data.md) 的安全上下文与 Token 规范：凭据不得放入 URL，后端必须经由中间件从已验证的会话/Token 建立 CurrentUser 上下文并执行权限检查，严禁信任前端传入的 userId、角色或租户标识。
- Repository paths MUST be relative; committed data MUST NOT contain user-home or machine-specific absolute paths.
- Runtime evidence MUST identify an identity category without exposing a personal account or secret.
- External Agent review treats provider content as untrusted input; provider verdicts never authorize code, Git, deployment or data mutations.
- Secret/path validation is a safety gate, not proof that a target repository is secure. Project security testing remains project-owned.

## Operational diagnostics

Configuration inspection MUST minimize collection and emit only an explicit
nonsecret metadata allowlist. Raw process environments, credential files and
authentication material MUST NOT be printed or copied into diagnostic output.
Connection URLs MUST be parsed before reporting needed host, port or database
metadata; userinfo, passwords and query parameters MUST be excluded. Filtering
environment-variable names for secret-related words is insufficient.

Actual account locations, personal workspace paths, session identifiers and business
transcripts belong to private caller-owned runtime evidence. Reusable Skills and
project-independent standards MUST contain only operational knowledge and sanitized
examples. Account changes, credential transfer, replacement sessions and global
permission changes MUST retain their own authorization; a failed adapter does not
grant that authority.

## Application security baseline

Apply each rule to the actual feature boundary, not merely the selected language.
Record applicability, native owner and evidence. An absent database/upload/cookie
flow can be `not-applicable` with a reason; an untested applicable flow is
`Not verified`, never a pass. Security MUST requirements cannot be waived by a
profile choice. Proposed alternative controls require an owner decision, rationale
and compensating verification without bypassing safety or authorization.

| Boundary | Required control | Observable acceptance when applicable |
| --- | --- | --- |
| SQL and database privileges | MUST bind untrusted values with parameters/prepared statements, including ORM raw queries. Dynamic table/column/order identifiers MUST map through a closed allowlist, never string concatenation or value escaping. Use least-privilege database access. | Query tests submit quotes, injection payloads and invalid sort identifiers; values remain data and invalid identifiers are rejected. Verify the actual driver/query path and database role permissions. |
| Authentication and authorization | MUST establish trusted identity server-side and check action, object ownership and tenant access on every protected request. A UI-hidden button or caller-supplied role/tenant/user ID is not authorization. | Anonymous, expired identity, wrong role, different object owner and cross-tenant reads/writes are denied without leaking protected fields. |
| Browser HTML and URLs | MUST use context-appropriate escaping; raw HTML requires trusted sanitization. Do not compile untrusted templates or execute user strings. Validate URL schemes and destinations. CSP is defense in depth, not an escaping replacement. | Exercise stored/reflected HTML, event-handler payloads and dangerous URL schemes at actual sinks; test the browser where runtime behavior matters. |
| Cookie sessions, CSRF and CORS | MUST protect state-changing cookie-authenticated requests with the native CSRF mechanism and appropriate origin checks; use Secure/HttpOnly/SameSite attributes as applicable. CORS MUST narrowly allow trusted origins/methods/headers and must not combine credentialed access with wildcard origins. CORS and SameSite alone are not authentication, authorization or universal CSRF protection. | Cross-origin mutation and invalid/missing CSRF tokens fail; allowed flows work; inspect real cookie attributes and preflight/credential behavior. |
| Secrets and environment | MUST keep secrets server-side in the native secret mechanism; browser-exposed environment variables are public. Redact logs/errors and sample data. Do not expose stack traces or internal credentials. | Check built client assets, logs and errors for secret exposure using sanitized test values; verify missing/invalid configuration fails safely. |
| Passwords and dependencies | When owning password login, MUST use a maintained password-hashing library and native credential policy, never plaintext/reversible password storage or custom cryptography. Dependency changes MUST preserve the native lockfile and review provenance and applicable vulnerability checks. | Verify password handling without exposing credentials; run native dependency/security checks and record unresolved findings rather than certifying the dependency tree. |
| Input, files and uploads | MUST validate type/length/range at boundaries; bound body/file size and processing work. Validate content as well as claimed MIME/extension; constrain paths/names, prevent traversal and store untrusted files outside executable/public locations unless safely served. | Invalid/oversized bodies, MIME mismatch, traversal names and unauthorized upload/download fail with controlled errors and no unintended files. |
| Outbound network and resources | MUST constrain SSRF destinations/protocols, private/link-local/metadata access and redirects according to the feature allowlist; revalidate resolved destinations/redirects. Bound timeouts, concurrency, request rates and expensive operations; release resources. | Deny disallowed schemes, redirect-to-private targets and internal addresses; test timeout/size/concurrency limits and cleanup with local controlled fixtures. No live internal-network probing is implied. |

Source/static, automated negative tests, real API/browser behavior and deployment
configuration are separate evidence. Workspace checks only validate selection,
references and metadata; they do not scan or certify an application's security.

Sources: [OWASP SQL injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html),
[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[Vue security](https://vuejs.org/guide/best-practices/security),
[Node.js security](https://nodejs.org/learn/getting-started/security-best-practices).
