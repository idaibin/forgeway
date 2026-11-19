# Project state adapters

Use a state adapter when an authorized Mock journey saves data and later reads it.
Keep static response fixtures for presentation-only cases. An adapter does not grant
permission to mutate real services or expand a project's accepted business rules.

Apply [project Mock selection and reuse](../../../standards/evidence.md#project-mock-selection-and-reuse)
before choosing a transport or adapter. A confirmed project approach is the default
for later authorized Mock requests. Match new data and rules to the actual project
consumer and preserve its saved Mock state. Extend the accepted adapter only for the
requested interactions; an existing implementation is not automatically migrated to
this API. Keep that choice in the external test workspace documentation/configuration.

## Interface and ownership

API `forgeway-mock-state-adapter/1` is produced by a project-owned classic JavaScript
entry stored in the project-adopted isolated test workspace, consumed by the generated extension, and validated by `stateful.js` at entry
and request boundaries. The extension generator validates syntax and records the
entry SHA-256 without executing project code. Unknown API versions fail closed.
The adapter has no imports or bundled dependencies; it registers exactly one value:

```js
globalThis.TabMockProjectAdapter = TabMockStateful.createAdapter({
  version: 1,
  projectId: 'example',
  scenarioId: 'editable',
  namespace: 'records',
  revision: 'seed-1',
  persistence: 'browser',
  initialState: { records: [] },
  handlers: {
    'create-record': {
      semantics: 'write',
      run({ state, request, collection }) {
        const row = collection(state.records, 'id').insert({
          id: crypto.randomUUID(), title: request.body.title,
        });
        return { commit: true, response: {
          status: 200, format: 'json', body: { data: row },
        } };
      },
    },
    'list-records': {
      semantics: 'read',
      run({ state }) {
        return { commit: false, response: {
          status: 200, format: 'json', body: { data: state.records },
        } };
      },
    },
  },
});
```

Handler keys are exact Mock rule IDs, not endpoints guessed by Forgeway. Rules still
need the normal `action: mock` and matching read/write semantics. Pass and block rules
are never sent to the adapter. The project supplies query filtering, pagination,
response envelopes, immutable identities, validation and relationship updates. The
small collection helper supports get/insert/patch/remove; it rejects duplicate or
missing identities and does not implement domain permissions.

A handler is synchronous and returns an explicit `commit` boolean plus a complete
JSON response. Read handlers cannot commit. A committing response must be HTTP 2xx;
a business rejection carried in HTTP 200 must return `commit: false`. Throwing rolls
back. Never perform network calls, UI changes or other side effects in a reducer;
those effects cannot be rolled back by the state transaction.

## Persistence and lifecycle

`memory` keeps state in the current page and serializes requests. `browser` uses one
IndexedDB read/write transaction per handled request, including the read-modify-write
and commit acknowledgement. Concurrent tabs use the same database lock. State keys
bind project, scenario, page origin/path, namespace and explicit revision. Profiles
and origins remain isolated. A project that requires account isolation must include
its accepted synthetic account identity in the namespace; Forgeway does not infer it
from real credentials. Seed changes require a new revision, preserve older data and
must be reviewed rather than silently resetting edits.

Input state is cloned. Validation, reducer failure, storage failure and abort before
commit do not persist changes. A timeout/abort after the commit may leave a committed
write without a delivered acknowledgement; read it back before retry. Browser-mode
storage must be available; it never falls back to memory while claiming persistence.
Do not store real credentials or personal production data. Retire an adapter by
regenerating the task extension without it; stored Mock data remains scoped until
explicitly authorized cleanup.

## Generate, activate and verify

```sh
forgeway browser mock extension --config project-mock.json \
  --project example --environment local --scenario editable \
  --url http://example.test/app/ --directory .codex/mock-extension \
  --state-adapter tests/mock/state-adapter.js
```

This generates a new caller-owned extension. It does not install it, refresh an
existing browser or change its configuration. For an authorized installation, back
up exact affected files and configuration, preserve other projects, then re-read
registration, automatic enablement, target binding and page Mock status. Extension
reload may remove dynamic registrations: enable the existing automatic scenario
again before arming the target. Preserve in-progress forms and user browser state.
Do not patch a generated runtime or copy a project's domain code into Forgeway.

This entry supports extension generation. `open`, temporary interception and proxy
commands do not accept `--state-adapter`; do not silently run them as static substitutes.
Migrate a project's existing adapter only under explicit scope, with before/after
fixture and request mapping checks.

Verify model transactions and the actual page separately: create, readback through
all dependent queries, edit, reload, delete, failure and cancellation. Check each
supported operation and keep unsupported operations explicit. A passed generic
fixture does not establish another project's UI, API, notification or backend result.
