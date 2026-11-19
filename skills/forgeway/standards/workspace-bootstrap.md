# Workspace Bootstrap v1

## Authority and lifecycle

Owner: Forgeway workspace tooling. Producer: `forgeway init`. Non-LLM consumers:
`forgeway workspace check` and `forgeway workspace resolve`. Validator:
`contracts/workspace.schema.json` plus `tooling/workspace.mjs`. Version:
`forgeway-workspace/1`. Drift policy: the stored source PackageManifest must validate
and match the currently invoked Forgeway checkout, including dirty/untracked source.
Retirement: retain v1 readers until an explicit, validated successor migration exists;
never silently migrate or rewrite the workspace.

This bootstrap record is NOT a Project delivery manifest. It records planned local
application slots and a reference to Forgeway, not accepted Product/UI, executable
commands, component topology, application commits, or completed stages. Reuse the
existing PackageManifest contract for source binding; do not invent a second basis
format or add bootstrap-only fields to Project v1.0/v1.1.

## CLI contract

- Explicit selection: `forgeway init <target> --name <name> --project-type <type>
  --stack <app-id=stack> ...`. Types: `frontend`, `backend`, `fullstack`, `cli`,
  `library`. Default slots respectively: `frontend`, `backend`, `frontend/backend`,
  `cli`, `library`; repeated `--app` can name custom slots. Every slot in an explicit
  type requires a stack. `vue`, `react`, `vanilla` fit frontend/fullstack/library;
  `java`, `rust`, `node` fit backend/fullstack/cli/library. Fullstack needs at least
  one frontend and one backend stack. Unknown, duplicate, incomplete, incompatible
  and malformed selections fail before target creation.
- `tooling/workspace.mjs` alone owns stack-to-profile composition. `resolve` returns
  common security/code-design/authority refs and the business-scenario standard, plus only the selected application's
  profile (and frontend CSS when applicable). `check` requires the union of selected
  refs in the bound source package. Selection does not install dependencies, create
  framework source or attest to application/security conformance.
- No-option bootstrap stays compatible and records `undecided`. Legacy v1 records
  without selection fields resolve as undecided without writes; legacy HTTP demo
  records resolve as fullstack vanilla/Node. Newly selected records remain v1
  optional-field extensions. Missing selected stacks fail; schema defaults never
  populate files. These choices are not Project delivery `profile` metadata.

- `forgeway init <target> --name <name> [--app <id>]...` creates a NEW governance Git
  root with `.gitignore`, `AGENTS.md`, `.forgeway/workspace.json`, the referenced
  `.forgeway/source-package.json`, and `apps/<id>/AGENTS.md`. Default slots are
  `frontend` and `backend`. Slot IDs use lowercase ASCII letters, digits and hyphens.
- Explicit `--starter http-demo` additionally materializes the fixed local example
  in `templates/starters/http-demo/` into `apps/`. It requires the default slots and
  does not start services. The generated source belongs to the example project;
  external Forgeway standards/Skills are still referenced, not copied.
  It binds fullstack with `frontend=vanilla` and `backend=node`; contradictory type
  or stack overrides are rejected rather than falsely labeling the example.
- The target parent must already exist. Existing targets (even empty directories),
  symlink path components, invalid/repeated options, and unsafe/colliding IDs fail
  before creation. No overwrite, merge, `--force`, clone, install, commit, push or
  application Git initialization. Creation failure retains a clearly reported partial
  target for inspection; it never recursively deletes user data.
- The outer root ignores `/apps/` and `/.codex/`. Only the root Git repository is
  initialized; actual application repositories and accepted Project metadata are
  added by their owners. Names are display labels; a generated UUID is the workspace
  identity and survives renaming the outer directory.
- `forgeway workspace check <root>` is read-only. It verifies the descriptor, source
  package integrity/current basis, real non-symlink application directories/guidance,
  actual Git root, root ignore rules and Git's effective ignore behavior. Tracked
  application/evidence files are findings even when `check-ignore --no-index` passes.
  Exit 0 means bootstrap conformance only; exit 3 means findings; invalid input exits 2.
- `forgeway workspace resolve <root> --app <id>` requires a passing check, resolves
  one declared slot to its outer governance identity and fixed Forgeway authority,
  and returns the effective HTTP convention. An optional project-owned
  `.forgeway/http-api-overrides.json` uses the existing HTTP override contract.
  No automatic loading of guidance outside an application Git root is assumed.
- Both read commands emit stdout only, reject `--output`, never execute commands
  from workspace records, never install Skills, and never grant execution authority.
  A missing/drifted source fails closed; run using the matching checkout. Updating a
  binding is an explicit owner change, not an automatic fallback to personal defaults.

## Acceptance

The coordinator first distinguishes an existing project (including non-Git/source
trees without package.json) from an explicitly authorized new project. Existing
projects keep native layout, stack, guidance and contracts. Inspection is read-only;
no automatic metadata adoption, framework recreation or migration is implied.
For new creation, confirm parent/name, type and all stacks before invoking init on
a new child path. An existing empty directory is still refused. Actual application
scaffolding routes separately to an available, authorized native capability.

CLI regressions cover selection/ref isolation, rejection before writes, legacy
records, source profile presence, and immutable existing trees. Skill routing
assertions are static checks, not proof of live host behavior.

Tests must cover absent-target generation, repeated execution without mutation,
custom names/slots, source and descriptor drift, duplicate JSON keys, directory
rename, missing/symlink slots, Git ignore negation/tracked files, foreign Git roots,
and explicit project HTTP overrides. Framework-owned `app/` directories are not
renamed. Runtime auth, database migrations, frontend behavior, review and delivery
  remain separate evidence; bootstrap conformance must never close their gates.

## Example execution and evidence

The optional HTTP fixture is deliberately not a production authentication framework.
Its native server/migration and browser client are governed by its README acceptance
contract. `tooling/demo-run.mjs` is an explicit local service launcher;
`tooling/demo-verify.mjs` runs the fixed real-HTTP integration test, preserves each
attempt's log and emits existing PackageManifest/DeliveryEvent/Observation formats
under ignored `.codex/`. It includes exact example source paths despite `/apps/`
being ignored by the governance Git root. It checks source drift around execution,
retains failures, and does not infer browser/review/delivery success or promote gates.

Collector owner/producer: Forgeway local HTTP example runner, version 1.0.0. Non-LLM
consumers/validators: existing DeliveryStore/PackageManifest validators and the
workspace integration fixture. Evidence is bound to the actual result package;
changes require a new attempt. Retire this example collector only once its consumers
can read the existing immutable events without depending on it. It is not a general
Skill runner or a replacement for host authorization.
