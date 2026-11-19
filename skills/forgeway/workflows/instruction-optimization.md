# Optimize instructions

Use for a separate request such as “精简这份 AGENTS，保留现有约束”. Rules:
[instruction comparisons](../standards/maintenance.md#instruction-effectiveness-comparisons)
and [mode boundaries](../standards/maintenance.md#named-instruction-workflow-modes).

1. Resolve the target, original task/acceptance and allowed scope from current context.
   Read effective guidance; ask only for decisive missing inputs. Ordinary development
   or review may report an instruction gap without starting this workflow.
2. Have the current instruction owner diagnose the concrete omission/rework and return
   the smallest semantic diff. Preserve business acceptance, routing and owner rules.
   Analysis is the default; it ends with a proposal, not a source write.
   An accepted finding from the independent
   [post-task retrospective](post-task-retrospective.md) can supply this evidence;
   it does not transfer adoption authority. Keep project-specific repairs with their
   project owner. A contradicted judgment may need narrower applicability or withdrawal,
   not another global instruction.
3. If explicitly asked to compare, bind the quality oracle, equivalent environment,
   trial budget/order and side-effect isolation before running. Use independent blind
   quality assessment; reject quality regressions regardless of reduced calls. Without
   comparable evidence, make no efficiency or cost claim. Comparison is optional.
4. If an exact candidate is accepted and application is authorized, recheck current
   bytes and apply only that candidate. The verifier checks original acceptance and
   user-requested reviewers inspect the fixed diff; corrections get targeted rechecks.
   Report source delivery separately from installation, actual loading and subsequent
   real-task effects. Source delivery or installation alone does not establish loading
   or benefit. A trial with observed candidate loading may support its bounded comparison;
   broader adoption effects remain unverified without subsequent real-task evidence.
   Do not hot-replace an active task's instructions to complete this workflow.

Reuse current task/result evidence and host capabilities. A missing owner or changed
basis blocks only its dependent action. No implicit experiment, installation or Git
delivery.
