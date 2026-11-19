# AI-assisted browser E2E acceptance

## Scope and ownership

Apply when an authorized task generates, repairs or accepts browser journey tests.
Reuse the target's existing test repository, runner, fixtures, case IDs and evidence
contracts. This is not a new Agent runtime, Skill catalog, test framework or automatic
project enrollment. `dev-tests` owns coverage and acceptance; the implementation
owner writes tests/configuration; `ops-browser` owns live page exploration. Host-native
Planner/Generator/Healer roles are optional adapters, not additional authorities.

## Existing-project default

For an existing project, default to code-derived planning and real execution without
requiring a complete PRD or prior human approval of every inferred case. Inspect only
the authorized scope: routes, components, call paths, validation/state transitions,
native APIs, existing tests and available live behavior. Infer plausible user journeys,
boundaries and failure paths; freeze observable expectations before the asserted run.
Do not copy actual results into expected values during that same run.

Use the existing plan's oracle/evidence notes to distinguish confirmed rules,
current-behavior baselines and provisional inferences. Explicit accepted decisions
prevail over inference. A baseline pass proves regression consistency; an inference
pass supports that hypothesis, not business correctness. A contradiction is retained
as a finding, not silently accepted as the new baseline or automatically called a
product defect. No additional PRD, schema, case registry or ledger is required.

Do not queue every inference merely because documentation is missing. Queue only
material conflicts or unknowns that affect a scoped outcome, permission or business
verdict. Explore these within a bounded budget, then record evidence, competing meanings,
affected case IDs, the precise question and human decision owner in the existing
issue/gap record. Continue independent cases without waiting for confirmation.
Only dependent business verdicts remain unresolved; safe exploratory execution may
continue. Unknown authorization, unsafe effects or denied environments still stop
that operation immediately. Later human decisions supersede affected assumptions,
preserve prior results and trigger only the necessary test/basis updates and reruns.

## Required sequence

1. Freeze the application AND test-source basis, available confirmed rules, target
   URL, account/data boundary, selected browser projects and finite case inventory.
   Each case needs an ID, prerequisite, action, observable expected outcome, its
   evidence basis and applicable integration assertion. Use the existing-project
   default when rules are incomplete; unresolved business meaning limits only its
   dependent verdict, not planning, generation or independent regression execution.
2. Preflight the actual runner/version, browser, seed/auth fixtures, environment and
   allowed side effects. The host resolves and loads any official Agent definitions.
   Source availability, installation, host loading and successful execution are
   separate evidence. Never fetch an unpinned latest package as a silent fallback.
3. Explore the authorized live page and preserve bounded locator/state observations.
   Hand the frozen evidence-labeled plan plus observations to the implementation owner. Generate tests
   in the accepted test-asset location; do not write business source during acceptance.
   Unobserved locators remain candidates, not verified selectors.
4. Freeze the generated test/configuration basis. Execute the existing native runner
   against the actual application. Use isolated state, explicit cleanup, auto-waiting
   locators and user-visible assertions. Bind UI effects to real API/business results
   when required; a mocked response only proves its declared mock boundary.
5. On failure, retain the failed attempt and classify product defect, test defect or
   environment blocker. Repair only the authorized owner, preserve the original
   expectation, and run a new bounded attempt. Limit repair attempts explicitly.
   Do not skip/fixme, mark an expected failure, weaken assertions, rebaseline visual
   differences, enlarge timeouts without evidence, or remove required cases to pass.
6. Reconcile EVERY frozen case/project pair with native results and the actual process
   exit. Missing, skipped, flaky, interrupted, blocked and not-run cases do not pass.
   Preserve first-failure evidence and distinguish clean passes from retry success.
   Changed source/configuration invalidates affected evidence. A browser policy or
   sandbox denial blocks that operation; do not bypass it or relabel a mock as E2E.

Use `forbidOnly: true`, zero retries for the acceptance run, failure-only screenshots
and `trace: 'retain-on-failure'` where compatible with the existing project. Do not
replace its runner, lockfile, authentication or evidence storage to obtain these
settings. Traces may contain credentials or business data: keep them private,
bounded and subject to the host's retention rules; do not automatically upload them.

## Native Playwright report check

Prefer an existing project-owned verifier with equivalent coverage/status checks.
The optional `tooling/playwright-report.mjs` consumes a native Playwright JSON report
for an explicitly selected, bounded inventory. It is not the Product UI five-case
consumer and does not replace that consumer or its existing trust/provenance rules.

For this bridge only, test titles begin with a stable `[CASE-ID] ` prefix. Reuse
accepted IDs; do not rename a whole existing suite to adopt the bridge. All executed
cases, including selected setup cases, must be in the frozen inventory. Pass each
required project/case pair explicitly, from the accepted plan rather than the
candidate's `--list` output. Keep the original runner exit code; exit 0 from this
checker cannot override a failed runner.
For the native unnamed default project, use `--require '::E2E-001'` and an empty
project name in the frozen selection. Empty is an explicit identity, not a wildcard;
do not rename or add a browser project merely to satisfy this checker.

```bash
node tooling/playwright-report.mjs \
  --report /approved/native-playwright-report.json \
  --runner-version 1.62.1 \
  --require 'chromium::E2E-001' --require 'chromium::E2E-002'
node --test fixtures/playwright/test-report.mjs
```

The version and paths above are examples; resolve actual locked values and approved
locations. The checker reads one regular file (at most 8 MiB), rejects non-regular inputs
without waiting for a FIFO writer, follows no attachment paths, executes no report
content and writes only stdout/stderr. It bounds traversal
to 4096 suite/spec/test nodes and 65 suite levels. Empty/duplicate/unmapped/missing
cases, inconsistent counts, global errors, non-passing expected statuses, failed or
retried results and runner-version mismatch fail closed. This bridge requires one
result per case; repeat/shard aggregation needs an explicitly qualified adapter.

Exit 0 means native-report consistency/coverage only; exit 3 means unsatisfied;
exit 2 means invalid CLI/input. Output `forgeway-playwright-report/1` contains
`valid`, `status`, `reason`, expected/observed counts, `report_sha256` and
`authorizes_execution:false`. It does NOT authenticate a report, prove meaningful
assertions, identify the deployed build, or produce a trusted runtime Observation.
The host must bind the raw report/hash, actual command/exit, application/test basis,
environment and existing Attempt/Result Package before any acceptance promotion.

An all-green report does not resolve a pending business question. Keep native test
outcomes and oracle/confirmation notes separate in the existing evidence record;
never promote baseline or inference results into confirmed business acceptance.

## Consumer lifecycle and validation

Owner: Forgeway verification tooling. Input producer: the target's locked Playwright
JSON reporter plus an independently frozen case selection supplied by the host.
Consumer/validator: `tooling/playwright-report.mjs`; non-LLM consumers: its CLI exit
status and `fixtures/playwright/test-report.mjs`. Version: `forgeway-playwright-report/1`.
Drift: regenerate after affected source, plan, configuration, runner or environment
changes; never rewrite old reports. Retirement: retain this read contract until its
host consumers explicitly migrate; never rewrite historic evidence. No new ledger,
metadata sidecar or automatic execution permission is introduced.

The fixture tests are synthetic report-shape regressions, NOT browser evidence.
Before claiming adoption, run an actual host planning/generation task, the generated
native suite and report consumption on the same basis, plus negative-control cases
for omitted tests and healed skips. Source/static success alone remains partial.

## Sources inspected

Playwright official documentation, `/docs/test-agents` and `/docs/best-practices`,
live documentation inspected 2026-11-05 (not a version-pinned installation):
https://playwright.dev/docs/test-agents and https://playwright.dev/docs/best-practices.
Native JSON shape: microsoft/playwright, `packages/playwright/src/reporters/json.ts`
and `packages/playwright/types/testReporter.d.ts`, ref `main` (mutable), inspected
2026-11-05. Actual supported package compatibility still requires native-run evidence.
