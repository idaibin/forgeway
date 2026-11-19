# Frontend performance verification

Use this optional lane for authorized frontend responsiveness work, including Chrome
Energy Saver diagnosis. It supplements [Evidence and Completion](evidence.md).
Target Product/UI contracts retain interaction and motion ownership; this lane does
not change every project's browser, frame budget or motion policy.

## Freeze the experiment

The implementation owner MUST trace shell, shared components, library adapters, page
components and requests to their owners before changing code. Reproduce the slow
operation and identify main-thread/layout/paint cost before choosing a correction.
Separate destination-frame feedback, component readiness, data readiness and
interactions after readiness. Slow loading and slow pointer feedback are different
acceptance items; a visible skeleton does not resolve a long task.

An optimization MUST preserve accepted business and UI behavior, including query
freshness, selection identity, permissions, mutation intent and motion preference
precedence. A required refresh is not a duplicate merely because the previous data
can draw the next view. Filters, blur, transitions, observers or dependency size are
investigation candidates until a reachable cost and matching evidence establish their
impact. Do not remove an accepted effect or request to make a timing check pass.
Shared adapter and asynchronous-state changes MUST select the affected consumer
checks from [UI components](ui-components-and-tokens.md#adapter-replacement-and-consumer-preservation)
and [Code Design](code-design.md#asynchronous-state-and-cached-consumers).

The verifier MUST bind each attempt to source SHA plus dirty-file hashes, loaded
runtime identity, script and fixture hashes, authorized account, route/state matrix,
theme, viewport, browser/version, headless/headed mode, CPU/network conditions, cache
and effective motion settings. Use existing services and native test entries.

Theme state includes the relevant persisted values and configuration completeness,
not just a light/dark label. Freeze the measurement write boundary with the current
implementation owner; if another task changes a consumed source, fixture or loaded
document, retain the original attempt and invalidate only its affected claims.

Testing does not authorize builds, service restarts, business-account preference
writes or changes to another task's work.

Use authorized real data or target-owned synthetic fixtures through the bundled
[browser Mock runtime](../tooling/README.md#browser-mock-verification). Fixture data,
business-ready predicates and routes belong to the target project. Preserve Mock
coverage limits, fail-closed rules and real-service evidence separately.

## Fixed script, unattended execution

Prepare one bounded Playwright script through the available browser owner and
existing tooling. Freeze inputs, expected states, authorized operations, timeouts,
output directory and cleanup before execution. The script owns navigation, readiness,
inputs, sampling, assertions and finalization. The AI consumes terminal artifacts
without intermediate clicks or changing conditions to rescue a failing run. Stop
dependent cases on failure; retain completed cases, errors and cleanup results.
Diagnose before a new attempt.

The script SHOULD:

1. Recheck actual viewport and effective state before interaction and capture.
2. Use component/data/font readiness and bounded request quiescence appropriate to
   the application. Fixed sleep or `networkidle` alone is insufficient for polling
   applications. Resolve locators and prepare scroll outside measurement windows;
   retain readiness timeouts and pending-request evidence.
3. Exercise native protocol mouse movement, hover, click, focus and wheel input on
   current hit targets. Record hit tests and applicable computed cursor/feedback.
   For scroll coverage, assert the intended container's offset changed; sending
   wheel events alone establishes an observation, not scroll coverage.
4. Cover affected first entries, cached returns, competing navigation, ordinary and
   overflow menus, table rows, card items and page controls. Include error/retry and
   overlay late-success/late-failure/close/navigation races where relevant. Account
   switching needs explicit account/environment authorization; safe Mock cases do
   not prove real cross-system switching.
5. Retain raw frame intervals, long tasks, input queue delay and handler-to-next-rAF
   timing with exact windows and state assertions. Next-rAF timing does not prove
   pixel presentation. Capture stacks for reproducible stalls and attribute owners.
6. Finish with source/config identity checks, console/network errors, case outcomes,
   pending work and owned-browser/profile cleanup. Capture screenshots/videos outside
   timed windows unless capture overhead is deliberately included equally in both runs.

When a recording is requested, the fixed campaign MUST include an actual capture
phase and validate the saved media. If recording is excluded from measurement, use
an unattended replay with the same case sequence and bound source, fixture, viewport
and effective motion policy; retain a per-case capture index. Treat media coverage,
metric outcomes and semantic assertions separately. A missing or undecodable
recording, footage that does not show the visible changes required by its case, or
an omitted required operation MUST NOT satisfy capture coverage or be replaced by
a green timing report.

## Event Timing and INP interpretation

Apply this section only when the existing verifier selects Event Timing or INP. Record
API support, entry types, observer start/window, `durationThreshold`, buffering,
observed sample count and the aggregation used. An empty sample set MUST NOT become
a measured `0 ms` or pass a required latency gate. Report the missing observation and
its known reason (for example, no qualifying interaction, unsupported API, incomplete
window or threshold filtering); an unknown reason stays unknown.

The [13 October 2026 Event Timing Working Draft](https://www.w3.org/TR/2026/WD-event-timing-20261013/#sec-events-measured)
describes `event` entries as threshold-filtered, with a default of 104 ms and an
observer minimum of 16 ms. Lowering the threshold observes future entries; `buffered`
does not recover earlier entries below the default. `first-input` has a separate
below-threshold exception. Reported duration is rounded to 8 ms. These specification
rules are not proof of the installed browser's support or complete capture. Absence
alone establishes neither an exact duration nor a universal below-budget result.

[INP](https://web.dev/articles/inp) concerns eligible click, tap and keyboard
interactions through the next paint, not completion of later asynchronous requests or
business work. Scroll/hover-only activity need not produce INP. Keep individual event
durations and bounded laboratory samples distinct from page-visit INP and field
percentiles; use the selected metric's actual grouping and aggregation. Preserve the
separate business-ready assertions defined above even when next-paint timing passes.

## Chrome Energy Saver calibration

Use this section when the request or reproduction calls for Energy Saver. CPU
slowdown, video frame rate, timer/rAF wrappers and physical display changes are
different experiments and MUST NOT be described as Energy Saver.

Use installed Chrome with Playwright and a new task-owned **normal persistent
profile** (`chromium.launchPersistentContext`), never a daily profile or copied
credentials. Record launch options; obtain viewport from the project. Settings pages
may be unavailable in incognito contexts. A business context may be separate within
the same owned browser; the saver manager is browser-wide. Close contexts/processes
and remove only the owned profile in `finally`.

This is a version-dependent recipe, not a stable public Playwright API:

```js
// settings is a Page in the owned normal persistent context; mode is verified below.
await settings.goto('chrome://settings/performance');
const pref = await settings.evaluate(value => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('saver preference timeout')), 5000);
  const key = 'performance_tuning.battery_saver_mode.state';
  chrome.settingsPrivate.setPref(key, value, () => {
    if (chrome.runtime.lastError) {
      clearTimeout(timer);
      reject(new Error(chrome.runtime.lastError.message));
      return;
    }
    chrome.settingsPrivate.getPref(key, actual => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(actual);
    });
  });
}), mode);
if (pref.value !== mode) throw new Error('saver preference readback mismatch');
```

Verify the installed version against matching Chromium source before choosing values:
`components/performance_manager/public/user_tuning/prefs.h` and
`chrome/browser/performance_manager/user_tuning/battery_saver_mode_manager.cc`.
The [155.0.8059.80 enum](https://github.com/chromium/chromium/blob/155.0.8059.80/components/performance_manager/public/user_tuning/prefs.h)
uses 0 to disable and 3 for the internal always-enabled testing state. Its
[manager](https://github.com/chromium/chromium/blob/155.0.8059.80/chrome/browser/performance_manager/user_tuning/battery_saver_mode_manager.cc)
activates frame-sink throttling at 30Hz. Other versions require their own check.
Unavailable APIs, managed preferences or unconfirmed versions leave saver verification
`Not verified`; do not substitute guessed flags or emulation.

Calibrate **off → on → off** in that browser on a visible synthetic page with a
simple CSS animation. Bring the probe to front only when foreground activation is
authorized; a background-only task MUST NOT activate a window. If the host cannot
provide the required probe visibility within that boundary, keep calibration
`Not verified` and continue independent checks. After each mode, verify probe
visibility, allow settling, then collect successive native rAF timestamps. Retain warmup/sample counts, raw
intervals, median/P95/max, viewport, visibility, native-rAF identity and preference
readback. Require an effective cadence change and recovery before attributing the
business run to saver. Readback alone is insufficient; an absent effect requires
diagnosis or `Not verified`, not a fabricated frame rate.

Read back saver and application motion state for every route and at the end. Honor
actual account preference, reduced-motion and automatic policy; do not force animation
on for a recording. Policy changes caused by saver are part of that experience;
such a comparison does not isolate cadence alone. Native rAF cadence proves scheduling,
not every rendering path's presented FPS, physical refresh, battery drain or the
low-battery/unplug trigger. Mode 3 exercises the internal always-on path only.

## Interpret and close

Compare identical source/fixtures/scripts and compatible route, readiness, cache,
viewport, motion policy and runtime conditions; report effective motion differences.
HMR, document replacement and source/fixture drift invalidate affected comparisons.
Retain interrupted attempts; re-establish a stable basis before rerunning. Do not
loosen Mock protection or stop other work to make a comparison pass.

Report expected cadence separately from excess stalls: steady capped 30Hz is not
itself business jank. Budgets come from the accepted target plan; neither 30Hz nor a
diagnostic 50ms filter is a universal SLA. Zero long tasks alone does not prove
smoothness. Assess input delay, missed frames, hit targets and actual feedback
together. Never calculate improvement percentages from mismatched runs.

Reconcile every requested page/state with cases, raw evidence and exclusions. Keep
source/spec consistency, focused checks, browser with Mock, real API, external
surfaces and production separate. A complete saver run may pass its scope while a
paired comparison remains `Not verified`. Shared-rule promotion needs repeatable
comparable evidence and separate review; project timings, accounts, routes and
fixtures do not become global defaults.
