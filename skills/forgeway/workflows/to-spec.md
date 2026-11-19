# To Spec Goal Flow

`to-spec` is a Forgeway goal flow, not a new semantic owner and not a replacement for `product-spec`, `domain-modeling`, `ui-spec`, or target-native interface/data/architecture authorities.

## Goal

Reach `spec-readiness` for one bounded implementation slice by running only the earliest missing applicable Stage.

```text
project-discovery
  -> product-requirement
  -> solution-contracts       (conditional)
  -> ui-specification         (conditional)
  -> spec-readiness
```

## Rules

1. Begin from current repository facts and accepted authorities. Do not recreate Product/UI/API/Data documents that already have usable owners.
2. Product behavior and Requirement are always resolved for the selected slice. Shared domain modeling is invoked only for material language/rule/lifecycle ambiguity.
3. Solution and UI lanes require explicit applicability decisions. A skipped lane needs a current basis, decision ref, and reason.
4. Each lane returns its own authority refs and readiness. `to-spec` produces only a derived Spec Readiness projection and never copies all meanings into a universal `spec.md`.
5. When a material decision is missing, return its nearest owner and stop. Do not mark `ready-for-agent`, create a Task, or edit source.
6. When every applicable lane is terminal, return the exact mutation boundary and the next candidate `task-planning` Stage. The projection sets `authorizes_execution=false`.

## Brownfield default

Existing projects normally complete much of this flow through `referenced` native assets. Backfill only the missing durable fact whose owner and consumer are real. Code-derived product or design descriptions remain Draft/Inference until accepted by the proper owner.

## Invocation

A host may expose this as `forgeway goal=to-spec`, `/forgeway to-spec`, or an equivalent UI action. The portable workflow does not bind the command syntax, tracker, model, Skill package, or provider.
