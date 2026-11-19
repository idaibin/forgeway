# Templates

The opt-in [local HTTP integration fixture](./starters/http-demo/README.md) is
materialized only by `forgeway init --starter http-demo`. It is runnable example
source, not a copied standard, a production auth scaffold or an approved Product/UI.

Copy only the templates needed by a real slice. Replace every placeholder with verified facts or `Not verified`; templates never carry approval or pass status.

Use [`project-profile.example.json`](./project-profile.example.json) only as the committed starter for `project-docs/collaboration/profile.example.json`; the adjacent `profile.local.json` is ignored and contains the actual personal selection. The example intentionally contains no selected role. Use [`handoff.md`](./handoff.md), [`verification-report.md`](./verification-report.md), and [`release-checklist.md`](./release-checklist.md) for actual bounded work; keep run-local instances in the target's ignored evidence area unless its owner adopts a final receipt.

Machine templates emit schema version 1.1 and validate against the matching contract after placeholders are replaced. Product, interface and UI Markdown retain their own authority boundaries. Existing 1.0 instances remain valid but MUST NOT be silently rewritten or default-filled.

Use [`project-capabilities.md`](./project-capabilities.md) only for a project-owned
standards/capability decision gap. Prefer extending existing guidance. It records
required/optional capability contracts, not a mirrored Skills catalog or executable
installation manifest; the host passes the current slice to `capability check`. For a
new governance repository root, record `/apps/` (plural) only when its nested
application collection is actually adopted and the root `.gitignore` ignores
`/apps/`; the outer directory name stays custom and existing project or framework
paths are not migration targets.

Use [`http-api-adoption.md`](./http-api-adoption.md) when adopting the default HTTP
API profile. It records project decisions and evidence references; native OpenAPI or
code-first output remains authoritative and the resolver does not prove runtime auth.

Use [`ui-components-adoption.md`](./ui-components-adoption.md) only when a frontend project adopts a project-owned UI component boundary, third-party adapter policy, Component Registry, or structured token pipeline. It records target-project decisions and commands; it is not a Forgeway-owned schema for the target project's component API.
