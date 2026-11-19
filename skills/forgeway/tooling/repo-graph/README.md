# Repository Asset Graph

This module is the rebuildable, fixed-basis machine index for repository assets and
source-derived relations. SQLite is the query store and JSONL is the validated exchange
format. Source, contracts, migrations, tests and `DESIGN.md` remain authoritative.

The built-in extractor intentionally claims only scope-and-extractor-bounded coverage:
file inventory, path-based Astro/TS routes, static Vue Router `createRouter` route trees,
lazy component references and UI components, bounded TypeScript/Nest
patterns, Spring mapping/JPA entity patterns, local imports, page renders, authority
conflicts, unresolved edges and symlink exclusions. The Java extractor is deliberately
limited to source-visible Spring mapping annotations and `@Entity` declarations; it
does not claim reflection, generated registrations, composed custom annotations, or
runtime route resolution. The Vue extractor reads literal paths and child arrays;
computed route paths, imported route arrays and runtime registration remain `Not
verified`. Unsupported dynamic registration is never silently reported as complete.

`vue-router-static/2` narrows import-origin matching: only an exact, unaliased
`createRouter` named specifier from `vue-router` enables the existing canonical
extractor. An unrelated export renamed `as createRouter` does not. Aliased
`createRouter` syntax (including `as createRouter`) is **not followed** and emits
`VUE_ROUTER_BINDING_UNRESOLVED` warning issues, counted in `coverage.issues_active`.
An alias does not disable a separately present canonical import. This is not alias
execution support or a JS/TS scope/regexp parser: canonical complex lexical forms
and local shadowing remain outside verified coverage. The tokenizer and canonical
route walker are unchanged. `parsed` means bounded extractor admission, not route
completeness. Historical `/1` snapshots remain unchanged/importable; new scans
record `/2` drift.

`vue-router-static/3` preserves that import-origin boundary and the literal route
walker. It also reports `VUE_ROUTER_BINDING_UNRESOLVED` for a direct top-level
`routes` identifier reference or shorthand, and direct spread elements in that
array or direct `children` arrays of its object entries. Diagnostic selection
is independent of the legacy literal walker, so unrelated nested methods cannot
trigger or hide these warnings. The existing tokenizer/balanced-token limits
still apply; this is not general JavaScript parsing. These are warnings, not expanded routes; known
literal siblings remain available. Nested settings/value identifiers, object
spreads and spreads inside call arguments are not direct route-array elements.
Other computed expressions remain outside verified coverage; no warning does
not establish completeness. Existing test/fixture exclusions are unchanged.
New scans and their diagnostics record `/3`; historical `/1` and `/2` snapshots
remain unchanged and importable, without relabelling their extractor identity.

`dynamic-import-coverage/1` adds one `DYNAMIC_IMPORT_COVERAGE_UNKNOWN` warning
per admitted JS/TS file containing raw `import` + trivia + `(` candidates. It
records their count, not source text, guessed module paths or import edges.
Comments, strings, regular expressions, templates, property calls and computed
arguments can contain this spelling: the warning deliberately does **not**
classify them as executable imports. The existing bounded helpers cannot safely
resolve general dynamic imports, including literal ones, so their target/impact
still needs source review. Absence of this warning is not complete JS coverage.
The original static-import and Vue-route extractors are unchanged. Snapshot
validation can remain valid while coverage is unknown; queries must not treat
missing dynamic edges as proof of no impact. New scans record this extractor;
historical snapshots keep their original identities and remain importable.


Text files above 2,000,000 bytes retain inventory and full-file hashes, but their
content is not extracted. Per-file coverage reports `inventory-only` with reason
`TEXT_SIZE_LIMIT_EXCEEDED`; `parsed` means admitted to the bounded text extractors,
not complete language or runtime analysis. Non-text files remain inventory-only.

## Lifecycle

| Field | Contract |
| --- | --- |
| Owner | Forgeway Repository Knowledge owner |
| Producer | `repository.asset.scan` adapter / `RepositoryGraphStore.scan` |
| Non-LLM consumers | versioned `forgeway graph query/impact/status/render` CLI and Delivery Run input resolver |
| Version | `repository.asset.scan@2.0.0` produces a `urn:skills:repository-asset-snapshot:v1` local reference to `repo-graph/1`; extractor IDs are independently versioned |
| Validator | `graph validate` checks the fixed scan and its snapshot hash; SQLite constraints, JSONL hash/reference importer and `fixtures/repo-graph` tests |
| Drift policy | content, scope, exclusion, basis or extractor change produces a new scan; missing records tombstone only inside the scanned scope |
| Retirement rule | stop writing a version only after every CLI/Run consumer reads its replacement and historical snapshot import remains available |

`forgeway graph import` requires a value for `--input` and reads that input before
opening the writable target database. Missing/valueless input and read failures
exit nonzero without creating or initializing the target; existing target bytes
remain unchanged. JSONL content validation and record transactions still belong
to the existing importer. This preflight does not change target initialization or
transaction semantics after a successful input read.

```js
import { createRepositoryGraph } from "./tooling/repo-graph/index.mjs";

const graph = createRepositoryGraph({ filename: ".forgeway/repo-graph.db" });
const scan = graph.scan({ root: process.cwd(), repository_id: "example" });
const routes = graph.query({ repository_id: scan.repository_id, kinds: ["route"] });
const impact = graph.impact(routes[0].asset_id);
graph.close();
```

The `query` API's `path` and `text` filters are literal, case-sensitive substring
matches in both live and fixed-scan views. `%` and `_` are ordinary characters,
not wildcard operators. `text` searches the path, logical key and non-null symbol.
This keeps the existing fixed-scan filter behavior; query limits and ordering are
unchanged.

The CLI wraps `graph scan`, `graph query`, and `graph impact` results in the portable
`urn:skills:asset-map-result:v1` envelope. Impact output records the immutable snapshot,
root asset, direction, depth, relation filters, reached assets, and traversed relations;
the envelope remains a bounded static query result and does not authorize a source
change or prove runtime impact.

The CLI's optional `--summary` on `scan/query/impact/status/validate` is a **lossy
human display**, not the portable result or a Gate input. Read actions require an
explicit `--scan-id`; the selected snapshot's identity, nullable Git basis, scope,
extractor versions, coverage counters/gaps and validation findings remain visible.
File classifications become state/reason counts; issues become severity/type
counts (including raw dynamic-import candidate counts) with up to five paths per
group. Query/impact assets show up to five identity/hash samples and exact omitted
record counts. Query limits report possible truncation, not invented total counts;
impact reports its direction/depth/relations and unresolved edges. Missing warnings
or edges never prove complete coverage or no impact. No runtime claim is added.

Default JSON, its portable envelope and JSONL export are unchanged. `--summary`
is rejected for export/import/diff/render rather than silently writing a supposed
complete artifact. It does not change validation or exit semantics: the existing
`graph validate` can exit 0 with `valid:false`, which remains false in the summary;
command errors still exit nonzero. Use default output/export for full records and
precise paths omitted by the display. A smaller response is not a speed or token
measurement. The minimal default `validate` response can be smaller than its
summary, which adds identity/coverage context; many validation findings can also
keep a summary large.

Impact expansion allows at most 1,000 active edges per visited asset and direction,
after relation filters. An over-limit expansion fails with
`GRAPH_IMPACT_EDGE_LIMIT_EXCEEDED` instead of returning a partial success; narrow
the requested relations or depth before trying a different query. Depth zero does
not expand edges. Direct edge-query limits are unchanged.

`graph scan` also returns `local_snapshot`: the Skills local schema URI, Graph storage
version, repository and scan identities, content hash, basis and scope. The referenced
snapshot is the immutable record in the run-local SQLite database; consumers use the
same database and `snapshot_ref` with `graph validate` and fixed-scan query. The
portable result carries the same scan ID, basis and coverage without copying the local
Graph format. The Graph store excludes its own SQLite file and sidecars from scans;
hosts should still keep run-local cache outside the target repository when possible.

The database is run-local and should not be committed. Derived Markdown or HTML may be
rendered from queries, but must not become a gate input.

`graph render` retains its 5,000-active-asset limit and reports the rendered count,
total active count and truncation flag for the selected repository/live or fixed
snapshot. An over-limit map is explicitly a partial view, not complete source
coverage. A fixed snapshot belonging to another repository is rejected before
render output is written.

Hosts discover this runtime through `forgeway capability adapter`, then resolve the
runtime-local manifest against the portable Skills Registry with `forgeway capability
resolve`. Adapter manifests advertise IDs, versions and schemas only; executable paths,
invocation and permission remain host-owned runtime facts.
