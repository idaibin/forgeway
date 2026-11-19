# Isolated browser launch diagnostics

`launchHeadless` preserves the selected executable and existing Chrome arguments.
It does not disable the browser sandbox or introduce a launcher, daemon, process
scan, alternate executable, or automatic retry.

During launch, stderr is continuously consumed and only its last 16 KiB are held
in memory. Retention is byte-based, including multibyte and oversized chunks.
After CDP is ready, the retained bytes are cleared and later stderr is discarded
while the pipe remains drained. No raw diagnostic file is written.

Launch errors keep their fixed browser error code and a fixed message followed
by a JSON object containing only these fields:

- `stage`, allowlisted `spawn_code`, `exit_code`, and `signal`;
- `timeout`, `stderr_bytes`, `stderr_tail_bytes`, and `stderr_truncated`;
- `cleanup_confirmed`.

Underlying messages, stderr text, URLs, paths, arguments, environment values and
serialized Error objects are not included in CLI diagnostics. The original
failure remains the non-enumerable internal Error cause; cleanup errors do not
replace it. This metadata diagnoses lifecycle stages, not the root cause of a
Chrome failure and not successful recording or business delivery.

A pending CDP session remains launch-owned until successful return and is closed
exactly once on launch failure, including resolution before or after failure.

Failed launch cleanup sends SIGTERM only to its own still-live ChildProcess and
waits at most one second for close. If that same direct process remains live,
SIGKILL and one further bounded wait are permitted. No escalation occurs merely
because stdio close is delayed after exit. Only confirmed close with a complete
drain allows profile removal. Missing close, forced pipe disposal, or failed
profile removal yields `cleanup_confirmed=false` and retains the profile.

A live child surviving both signals can still keep the CLI alive. The implementation
does not detach, unref, force process exit, or falsely claim cleanup. Close of the
direct child and its stdio is not evidence that every Chrome descendant stopped.
The existing recording/MP4 path's cleanup after successful launch is unchanged.

The exported function's optional dependencies and shorter timing bounds are an
internal deterministic-fixture seam, not CLI flags or an alternate production
launcher. `fixtures/browser/test-core.mjs` includes those fake-process cases.
They follow the [Node 24.15.0 child-process lifecycle](https://nodejs.org/download/release/v24.15.0/docs/api/child_process.html#event-close):
spawn failure has error rather than spawn; exit can precede stdio closure; close
confirms the direct child and its stdio have ended. Real Chrome is not exercised
unless the separately authorized fixture opt-in is set.
