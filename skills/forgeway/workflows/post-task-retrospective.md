# Post-task retrospective

This is an explicit independent maintenance entry, not a twelfth Stage, recurring
service, hook or prerequisite for business execution. It sequences the existing
[maintenance standard](../standards/maintenance.md#post-task-retrospective-checkpoint)
and [task reconciliation owner](06-task-planning.md).

1. Fix the original accepted Task/acceptance, unique ledger, completed or stably
   terminated batch, basis and selected source allowlist. Preserve failed/cancelled
   attempts. Running or unknown external effects defer this batch only.
2. The host calls `planMaintenanceRetrospective` through trusted CODE ports with
   explicit limits. Read only the selected ledger/evidence index, then exact bounded
   supported session fragments/project artifacts. A metadata-only codex snapshot
   does not provide conversation content. Unsupported sources remain explicit;
   existing project artifacts can proceed independently.
3. Give the existing `work-retro` owner only those authorized private fragments and fixed
   task/acceptance. Separate observed facts, hypotheses and accepted findings. Route
   actual defects to their owner; do not convert every issue into instruction edits.
   Existing Graph checks use `reviewMaintenanceFeedback`; this helper neither scans
   Graph events nor discovers readers outside the selected CODE ports, invokes a model,
   calls to-task or starts a source writer. The host maps the existing private evidence
   to the portable retrospective input/result; do not copy host storage or checkpoint
   schemas into the Skill.
4. Save the private review Result using the existing host Result/Package authority.
   A short review-finding Observation may refer to it; do not embed conversation
   text in Observation summaries or portable views. `completeMaintenanceRetrospective`
   verifies that exact Result readback before producing the derived checkpoint.
5. Only an accepted finding plus ledger write authorization goes to existing to-task.
   Identify it by stable finding_ref + owner + original task/acceptance; update the
   original item or its smallest necessary subtask once. Do not replace goals,
   acceptance, dependencies or historical failures. Missing authority returns a
   proposed reconciliation; leave the original ledger unchanged.
6. The defect owner runs its real counterexample and affected regression. Source,
   installation, loading, actual adoption and comparable post-adoption outcomes are
   distinct evidence. The checkpoint proves reviewed coverage only. It does not
   prove improvement, business completion, Ready, or permission to execute.
   For a proposed instruction change, use the existing
   [instruction workflow](instruction-optimization.md) and its fixed-comparison gates.
   Select the original failed task or a structurally similar real deliverable, keeping
   its accepted quality oracle and execution owner. Assess quality before rework,
   time or calls; missing measurements remain unknown. Faster failed delivery is not
   improvement. A comparison requires its own applicable execution authority and is
   not mandatory merely because a retrospective was requested.
7. Return. A host may later schedule independent checks under an accepted cadence;
   Forgeway creates no scheduler. No new terminal batch is a no-op. Do not collect
   during execution, hot-swap a current batch, stop its writer or delay delivery.

The host must provide native cursor and immutable anchor semantics. Missing pages,
truncation or timeouts do not advance an unread range. A partial Result can commit
only its read continuous prefix with a stable native resume token. New snapshot
hashes from normal append do not invalidate an unchanged anchor; anchor/lineage or
acceptance/basis drift does. Timestamp windows are filters, never watermarks.
