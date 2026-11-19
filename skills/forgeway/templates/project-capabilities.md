# Project Capability Decisions

Use only when the project needs a durable capability/standards decision record.
Extend the existing project guidance or architecture authority when it already owns
these facts. Replace placeholders with verified facts or `Not verified`; this is not
a Skill catalog, host configuration or installation manifest.

## Scope and authorities

- Current project/component/slice: `<accepted scope>`
- Shared Forgeway authority: `<repository identity and fixed revision>`
- Project Product and architecture: `<owner and accepted references>`
- Project UI authority, when applicable: `<DESIGN.md and feature UI references>`
- Selected technology profile, when applicable: `<owner, revision and components>`
- Project type and per-application stack: `<explicit selection for new work; verified native facts for existing work; undecided when unknown>`
- Applicable security/code-design and selected profile refs: `<workspace resolve result or fixed native adoption refs; not every profile>`
- Security acceptance: `<applicable boundary, negative test/native command, evidence or Not verified; reason for not-applicable>`
- Native source/API/migration/verification owners: `<repository-local references>`
- Conflict/exception disposition: `<affected rule, scope, owner and revalidation condition, or none>`
- New-project layout convention, when applicable: `<custom project root; its .gitignore ignores /apps/; apps/frontend and apps/backend may be independent Git repositories>`

The `/apps/` convention applies only to a new arrangement with the application
collection nested under the governance repository root. Do not use this record to
rename or rearrange an existing project, monorepo, or framework-owned `app/`
directory.

## Capability requirements

Record only requirements relevant to this slice. Copy exact IDs and contract versions
from the host's current verified capability metadata; do not guess package names.

| Capability ID | Exact contract version | Required/optional | Component/slice | Reason and acceptance dependency |
| --- | --- | --- | --- | --- |
| `<verified capability ID>` | `<verified x.y.z>` | `<required or optional>` | `<scope>` | `<why needed; consequence if unavailable>` |

## Project-specific Skills and roles

- Existing project-specific Skill source, only if needed: `<owner and project-local path>`
- Host discovery/activation check: `<native host mechanism; Not verified until checked>`
- Role responsibilities: `<input, output, reviewer and permission boundary>`
- Application guidance binding: `<how the host locates project authority and local commands>`
- Rename/separate-checkout acceptance: `<reference/loading check and missing-authority behavior>`

No role or Skill declaration authorizes execution or delegation. Do not copy shared
Skill bodies into this document or repeat standards inside role descriptions.

## Preflight and evidence

The host translates the requirements above into repeated `--require id@version` and
`--optional id@version` arguments for `forgeway capability check`, with explicit
current Registry v3 and adapter snapshots. It may pass a compatible per-capability
`--select id=adapter-id` after resolving ownership. The CLI does not parse this table.

Keep check reports, snapshot hashes, actual package revisions, adapter selection and
execution evidence in the project's ignored run-local location. Do not commit
machine-local executable paths, host installation inventories or current availability
claims here. Dependency changes invalidate the affected check; a successful check
proves compatibility of supplied metadata only, not permission or runtime success.
