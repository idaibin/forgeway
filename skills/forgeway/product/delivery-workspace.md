# Delivery Workspace Feature Specification

## Intent

Give a delivery owner one browser page that answers three questions without reading
raw event logs: what outcome is being delivered, which stage needs attention, and
which evidence supports the current gate state.

## Confirmed behavior

- The page consumes a read-only projection produced from Forgeway Delivery Graph
  records. It never derives a gate from display text or lets the browser mutate a Run.
- The left gate rail preserves the selected Run's Gate Policy order. The explicit
  synthetic demo illustrates Product intent through Delivery; a fixed source Run
  displays only its recorded gates and never invents missing lifecycle acceptance.
- Selecting a gate reveals its owner, state, evidence references, and limitations.
- A status filter can show all gates or only gates that are not satisfied.
- Loading, unavailable, and retry states are explicit. Missing evidence remains
  `Not verified`; the page never converts it to success.
- The page is usable at a 1440 x 900 desktop viewport and a 390 x 844 narrow Web
  viewport without horizontal page scrolling or hidden primary controls.
- Keyboard users can reach the skip link, filters, and every visible stage control,
  and the selected gate is exposed semantically.

## Non-goals

- Editing product facts, approving a visual source, running commands, or delivering
  Git refs from the browser.
- A generic dashboard builder, a second Delivery Graph store, or a Forgeway-owned
  design-token system.
- Native desktop-window behavior. This slice validates desktop-sized Web and narrow
  responsive Web only.

## Failure behavior

- While the projection is loading, the page exposes a named loading status.
- When the projection cannot be loaded or validated, the page exposes the failure and
  a retry action; it does not display cached success.
- An empty gate list is an invalid projection and follows the same unavailable state.
- The host selects one fixed Context Projection and a separately pinned trusted export
  attestation. Missing selection, unreadable/changed bytes, unsupported format, empty
  gates or an untrusted/mismatched export fail visibly without a demo fallback.
- The page shows source identity, Run, Result, frozen basis, target repository and
  worktree state, snapshot SHA-256 and export time. The host explicitly binds a
  target repository root and repository ID. A different HEAD is labeled stale;
  a dirty worktree with the same HEAD is Not verified. The saved gate states
  describe that historical Result and do not establish current acceptance.
- Retry rereads the same allowed source. Requests cannot choose paths or Runs and
  cannot write to Graph, rerun a capability, or resend a delivery.

The fixed browser-report consumer accepts only the five required checks with nonempty
all-passed attempt histories, no global/result errors, and no skipped, flaky or
unexpected outcome. An earlier pass does not hide a later failure or a failed retry;
the runtime Observation remains unsatisfied for inconsistent reports.

## Acceptance

| ID | Observable result |
| --- | --- |
| `DW-PRODUCT-01` | The page names the delivery outcome and exact Run/basis identity supplied by the projection. |
| `DW-PRODUCT-02` | Gate order matches the selected Run's policy, and each gate exposes its saved evidence boundary. |
| `DW-PRODUCT-03` | Selecting and filtering gates changes only the view and never mutates the source projection. |
| `DW-PRODUCT-04` | Loading, unavailable/retry, satisfied, attention, stale, and Not verified meanings remain distinguishable. |
| `DW-PRODUCT-05` | Desktop and narrow Web layouts preserve all primary controls and avoid horizontal page overflow. |
| `DW-PRODUCT-06` | Automated accessibility checks pass and keyboard focus/selected-stage semantics are directly exercised. |

## Decisions

- Confirmed: this is a first-party Forgeway Product UI module and a read-only Delivery
  Graph consumer.
- Confirmed: content-production media workflows are outside this feature and belong to
  Createway.
- Confirmed: Primer supplies the component and token implementation adapter; Forgeway
  does not copy Primer token values into its contracts.
- Deferred: authenticated multi-user collaboration, saved filters, and delivery actions.

## Readiness

**Ready for Delivery Workspace UI specification and implementation.** The selected
slice has no unresolved product behavior, permission, failure-semantic, or acceptance
decision.
