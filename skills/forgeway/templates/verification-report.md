# Verification Report: {{SCOPE}}

## Fixed basis

| Repository | Commit SHA | Worktree | Environment |
| --- | --- | --- | --- |
| `{{REPOSITORY}}` | `{{COMMIT_SHA}}` | `{{CLEAN_OR_DERIVED}}` | `{{ENVIRONMENT}}` |

## Requirement and required gates
## Commands and results
## Changed behavior and affected consumers

For an adapter, cache, request or initialization change, identify the actual producer
and consumers, accepted behavior that must remain, and the relevant integration seam.
Record which assertions executed the adapter/consumer and which used a synthetic
substitute. Include applicable response reversal, successful empty, refresh failure,
context change and close/deactivation/reopen outcomes with necessary cache readback.
Use the target's existing case IDs; omit cases that are not applicable to this change.

## Artifacts inspected
## Runtime, identity and permission evidence

For a client flow, list project navigation, text entry, submission and capture with
separate results and dependencies. Identify which missing evidence blocks only
visual acceptance and which unmet input precondition prevents submission.

For applicable background-client gates, record the app/build/PID/window/control,
operation and route, screen/window state, expected and observed postcondition,
foreground/focus observer coverage, pointer/clipboard evidence and verified cleanup.
Keep discovery, state change, non-interference and full-window capture separate.
List each unsupported, failed, blocked or unexecuted operation and its recovery
condition; do not generalize one control or window state to the whole application.

For app-owned session protocols, include executable/protocol/configuration identity,
workspace/session, qualification reference, tool/path enforcement and limits, request/
turn identity, accepted/running/approval/terminal observations and actual tool results.
Record reconciliation and retained-session/transport cleanup separately from desktop
synchronization and pixels. For headless CLI routes add exact argv/cwd, direct exit,
per-turn output, requested/effective permission evidence and exact-SID continuation;
state whether write prevention was actually enforced or remains Not verified.

For emulator-hosted mobile apps, bind the virtual device/serial, guest OS/image/ABI
and installed artifact identity instead of a host window. Record guest transitions,
decoded screenshots/recordings, actual duration, host lock/sleep intervals and device
retention separately; keep current-source, physical-device and vendor coverage explicit.
## Independent review and fixes

Separate reviewer candidates from locally accepted findings, rejected candidates and
unverified hypotheses. Check each candidate against the current accepted contract;
required refreshes and preserved visual effects are not defects without a concrete
violation or measured impact. Bind fixes and remaining gaps to the original feature
and acceptance item before reporting that item complete.

## Findings, Gaps and Not verified
## Verdict

Verdict is `Pass`, `Fail`, `Blocked` or `Partial`; it must be no stronger than the evidence.
