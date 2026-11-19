# HTTP API Default Convention Adoption

Copy this only when a project elects to adopt or explicitly override the Forgeway HTTP convention. This record is project-owned; its native OpenAPI/code-first output remains the HTTP wire authority. Replace every placeholder with verified facts or `Not verified`.

## Decision and authority

- Profile ID/version: `forgeway.default-http-api` / `1.0.0` (or `Not adopted`)
- Default profile hash and resolve output reference: `<sha256 and evidence ref>`
- Local override file/reference and content hash: `<relative path and sha256, or None>`
- Native interface authority: `<OpenAPI path/version or code-first producer>`
- Authority strategy and owner acceptance: `<contract-first|code-first; owner/ref>`
- Resolve result only: `authorizes_execution=false`; it is not runtime conformance evidence.

## Authentication and CurrentUser boundary

- Mechanism: `<Token|Cookie|SSO/external>`; native security scheme/reference: `<ref>`
- Login / token issue decision: `<method/path or external identity reference>`
- Me / logout / refresh decisions: `<method/path, explicitly absent, or external reference>`
- Token expiry, signature/session, revocation and disabled-user checks: `<implementation/OpenAPI/test refs>`
- CurrentUser trust boundary: `<verified middleware/context source>`; request body/query/path user or role fields are never trusted as the actor.

For Cookie/SSO/external, record the native mechanism and set external profile auth fields to `null`; do not leave inactive Bearer routes/header values in the decision.

## Cross-origin request ID access

- Effective `request_id.response_header`: `<X-Request-Id, project override, or null>`
- Frontend/API origins and whether browser code needs to read this header: `<origins; yes/no>`
- Server/gateway CORS configuration and owner: `<config reference and owner>`
- If cross-origin browser code reads the header, explicitly include the effective header name in `Access-Control-Expose-Headers` (default: `Access-Control-Expose-Headers: X-Request-Id`). Preserve any other exposed headers; use the project override name when configured.
- Browser evidence: `<actual cross-origin request and fetch/XHR/interceptor read result>`; seeing the header in server logs or DevTools alone does not prove browser code can read it.
- If the effective header is `null`, the request is same-origin, or browser code does not need it, record `Not applicable` with the reason instead of claiming cross-origin verification.

## Front-back integration matrix

| Scenario | Expected HTTP/business response | Native contract/test reference | Evidence state |
| --- | --- | --- | --- |
| Valid token/session | `<response>` | `<ref>` | `Verified|Failed|Not verified|Not applicable` |
| Expired or revoked token | `401` / `<body>` | `<ref>` | `<state>` |
| Disabled user | `401 or 403` / `<body>` | `<ref>` | `<state>` |
| Permission denied | `403` / `<body>` | `<ref>` | `<state>` |
| Logout then reused credential | `401` / `<body>` | `<ref>` | `<state>` |
| Object / array / empty data | `<fixed data type per operation>` | `<ref>` | `<state>` |
| Paging and limits | `<items,total,page,pageSize or override>` | `<ref>` | `<state>` |
| Project override fields | `<effective values>` | `<resolver + native ref>` | `<state>` |
| Cross-origin request ID access | `<browser code reads the effective response header; or Not applicable with reason>` | `<CORS config + browser test/evidence ref>` | `<state>` |

Do not use this template to claim real authentication, frontend-backend integration, deployment or authorization acceptance without the referenced project evidence.
