# Maintain a bounded capability

Rule owner: [Bounded maintenance](../standards/maintenance.md).
Implementation and host-port lifecycle: [maintenance module](../tooling/maintenance/README.md).
Acceptance owner: [REQ-006](../product/features/REQ-FORGEWAY-006-maintenance-entry.md).
This workflow orders those existing rules; it defines no new authority or task state.

Apply [host guidance and portable defaults](../standards/project-capabilities.md#host-guidance-and-portable-defaults)
before choosing a maintenance route. For a recurring check, use the
[maintenance coverage and learning](../standards/maintenance.md#maintenance-coverage-and-learning)
rules to select explicit registered subjects and a fixed observation window; the
check remains read-only and does not create an update request by itself.

First route the requested effect using
[the standard's effect/window boundary](../standards/maintenance.md#select-the-effect-and-its-consumer-window):

| Requested effect | Existing route | Readback / stop boundary |
| --- | --- | --- |
| Git-only synchronization | Current native repository owner; not installer `--sync` | Fixed source/ref, dirty/divergence preservation and exact after state; no installed/loaded claim or installation-window dependency |
| Managed installed-file update | Original component installer; for Forgeway, [the existing native update command](../tooling/README.md#repeat-a-managed-forgeway-update) from independent source | Source/install delta, component-scoped consumer window, verified backup, original apply/readback/recovery; loaded remains unverified |
| Activation / loaded verification | Existing native host owner and actual session API | Fenced switch when required, loaded identity and behavior; an unavailable bridge does not invalidate a completed Git/file update |

Rebind current source, target and authority under the standard. Reuse the existing
owner/task context and installer evidence; an explicit native command does not
require an executable SDK plan.

For diagnosis/source changes and host-managed activation, continue through the
existing sequence below. The explicit native routes above do not acquire SDK
execution authority from a handoff file.

1. Capture the user's symptom, desired behavior and requested effects. Select a
   bounded subject list. For Forgeway use `maintenance doctor --source-root`
   and/or `--installed-root` for actual local readback; optional `--config` and
   `--source-id` select a registered local path. Select an explicit component/configuration kind and finite metadata profile for
   other registered sources; unconnected readers remain unsupported. Source-only
   metadata readback is separate from installation, loading and usage.
2. Reject old request versions without guessing categories. Bind explicit peer
   compatibility relations and collector-declared required peers even if request edges
   are omitted. Collect native compatibility evidence bound to both current source
   identities/revisions/hashes; a boolean label cannot satisfy it. Retain
   failed/unknown rows and source/catalog hashes.
   Ask the current trusted host to collect the actual source, invocation,
   installed and loaded identities. Show version drift separately from unrelated
   identities. Resolve one owner per operation; leave unavailable owners blocked.
3. Reuse the existing Task and input Package Manifest. The portable
   `maintenance plan --task ... --source-root ...` returns scoped before-hashes
   and a concrete handoff for the current native host; it does not grant execution.
   A native collector must authenticate the source and bind exact scope, source
   revision/content, relevant configuration, guidance and owner into a fixed
   plan. For cross-owner changes create separate dependent Tasks/Runs; do not
   change another owner's schema to make one side pass.
4. Have the trusted host read current authorization and acquire its durable
   exclusive writer lease. Recheck the fixed binding and completed dependencies.
   Execute only the intersection of requested, host-allowed and capability
   effects. The portable CLI has no execution or approval-file shortcut.
5. Capture a Result Package and separate independent observations of source and
   behavior. A successful process result alone is insufficient. Reject scope
   expansion and preserve unrelated user modifications.
6. When replacing a running distribution, prepare a separate candidate. Verify the trusted
   source snapshot, installed bytes and locked production dependencies. Keep the
   old entry running until the native host can perform a separately authorized,
   atomically fenced compare-and-switch. Without that API return prepared.
7. Read the new host session's loaded identity and actual behavior separately.
   Installation alone does not establish loading. Record evidence in the existing
   Run/Attempt/Observation chain, never as a Git/deployment Delivery Receipt.
8. On an uncertain submission retain the writer fence. Ask the actual owner to
   establish whether its writer stopped and read before/after state. Reconcile
   before replanning; never repeat a possibly accepted action. Restore installer
   bytes only when the journal and current files match, stopping on new user edits.
9. Return exact changes, result bindings, independent claim outcomes, conflicts
   and next owner handoff. Distinguish controlled implementation tests from live
   two-user/two-host acceptance; missing live evidence remains pending.

After a change is adopted, compare its original acceptance item and user-visible
outcome with later trusted usage observations. Reopen only a demonstrated gap under
the same semantic owner; an unchanged or missing usage signal is not an instruction
to rerun a successful maintenance operation.
