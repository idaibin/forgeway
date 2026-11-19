# Node.js Profile

Applies to explicitly selected Node.js services, CLIs and libraries. MUST read the
native engine/toolchain, package manager/lockfile, ESM/CommonJS boundary, exports,
scripts and deployment contract; do not install a preferred runtime or scaffold.

- MUST validate external input at runtime, use parameterized database access and
  explicit error mapping, and avoid merging untrusted keys into prototypes/config.
- MUST bound request bodies, concurrency, timeouts and expensive work; own stream,
  timer, child-process and connection cleanup, cancellation and graceful shutdown.
  Avoid shell interpolation; constrain subprocess arguments and filesystem paths.
- MUST keep server secrets out of client bundles, logs and fixtures. Dependency
  changes preserve lockfile ownership and require the native security/update checks.
- SHOULD separate domain behavior from HTTP/CLI adapters through existing seams;
  preserve supported import/require and asynchronous error semantics.

Acceptance: native static/unit/integration/package checks; malformed input, denied
access, timeout/body limits, cleanup and relevant SQL/SSRF negatives. Test each
claimed runtime version/consumer form or report `Not verified`. Applies alongside
shared security/code-design; it does not assert Bun/Deno compatibility.

Source: [Node.js security practices](https://nodejs.org/learn/getting-started/security-best-practices).
