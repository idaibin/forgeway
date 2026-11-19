# Local HTTP integration fixture

This is a disposable acceptance example, not a production authentication starter.
It uses Node's HTTP/SQLite APIs and browser-native controls; no UI library, external
account, package installation or project-specific Product/UI approval is required
to exercise this test fixture. Native code in `backend/server.mjs` and its migration
owns this example's API/data behavior. `frontend/client.js` is its sole UI consumer.

Acceptance revision 1: anonymous → invalid login → successful demo login → `/auth/me`
→ paginated owner-scoped `/items` → logout. UI shows loading/errors, current user,
list/empty state, page controls and the actual exposed request-ID response header.
Keep the token in memory, not local storage. Use ordinary semantic HTML controls;
this is not a selected visual design or a reusable component system.

The host supplies the effective HTTP convention from `workspace resolve` to BOTH
services. Login body is `{username,password}`; the example-only credentials are
`demo` / `demo-only`. Login data is `{accessToken,tokenType,expiresIn}`. `/auth/me`
returns `{id,name,roles}`; `/items` accepts the effective page/page-size query names
plus `q`, and returns the effective pagination fields. Logout data is `{}`. Error
business codes are negative HTTP status numbers; HTTP status remains meaningful.
Only Token/Bearer without refresh is supported; other profiles fail startup explicitly.

Database migration 001 creates example users and owner-scoped items, with a foreign
key and composite index. It runs only on a fresh database (user_version 0), records
version 1, is transactional, and rejects unknown versions. Never use this runner
against an existing business database. The runner uses `.codex/http-demo.sqlite`.

The fixture binds ONLY to 127.0.0.1 and explicitly allows the frontend origin. Tokens
expire after five minutes and logout revokes the current token. The current user is
loaded server-side for every request. There is deliberately no password enrollment,
password recovery, production rate limiting, TLS, distributed session store, refresh
token flow or SSO. These exclusions prevent a production-readiness claim.

From the matching Forgeway checkout, explicitly start the generated example with
`node tooling/demo-run.mjs <workspace-root>`. This executes example application code,
creates its ignored test database, prints only local URLs, and stops on Ctrl-C.
The generator/checker alone never starts services. `fixtures/workspace/test-http-demo.mjs`
exercises the generated files over real HTTP. Browser evidence is a separate check.
