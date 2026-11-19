# API Contract Skill

## Ownership and applicability

Forgeway adopts `api-spec` as the standard Skill for designing, revising, or validating
native API wire contracts once business semantics are accepted. Its capability ID is
`api.contract.specify`; the current contract version and input/output declarations come
from the selected Skills registry.

- `solution-contracts` MUST request this support capability only when the API lane
  needs that work. An unchanged accepted contract may return bounded no-op evidence.
  Data-only or architecture-only work does not require this Skill.
- The host coordinator retains Stage ownership. The target service/contract owner
  retains acceptance authority; the Skill writes only the named native contract
  artifacts. Backend implementation, generated clients, independent change review,
  and runtime operation stay with their respective owners.
- Apply [Interfaces and Data](./interfaces-and-data.md) to the target contract.
  Forgeway stores authority references and evidence, never a second endpoint or DTO
  definition. Registry compatibility does not prove an installed runtime adapter,
  authorize execution, or establish implementation conformance.

## Source and maintenance

The single maintenance source is `skills/api-spec` in
[idaibin/skills](https://github.com/idaibin/skills/tree/main/skills/api-spec), locally
`repos/skills/skills/api-spec`. Forgeway MUST reference that capability rather than
vendor or maintain a second copy of its instructions.

Update it from the Skills repository when the current task needs a missing capability,
a demonstrated correction, or an explicitly requested refresh. Use that repository's
[installation flow](https://github.com/idaibin/skills/blob/main/INSTALL.md), selecting
only `api-spec` when no broader update is needed. Runtime discovery resolves the
available package and adapter; this standard does not trigger installation by itself.

Before replacing an installed copy, compare the source revision and any local changes.
Keep project-specific API conventions in the target project's native guidance or
profile; do not overwrite an existing project-specific same-name Skill blindly. Move
reusable improvements upstream to `repos/skills`; keep only the project differences
locally. After an authorized update, verify source/install parity and the affected
capability boundary. Reuse unchanged evidence; do not repeat unrelated acceptance.

## Reconstructed evidence and machine consumption

Source reconstruction is observed evidence until the native API owner qualifies
its exact scope/version/content and current source basis for normative consumption.
An observed projection with unresolved required/nullable/additional-field behavior
MUST NOT drive wire validation or client generation. Candidate/status/accepted tags
and structural lint alone cannot promote it. Keep product/domain questions with
the existing owners and retain spec-readiness/independent acceptance gates.

The optional `createAcceptedArtifactValidator` adapter in the existing typed-artifact
port checks a fixed host acceptance context before invoking the native validator.
Trusted owner code supplies its decision and unresolved dimensions; Forgeway does
not parse, author or accept target wire semantics. Missing, draft, observed-only,
forged, stale or hash-drift evidence fails the real consumer and cannot satisfy its
Result-bound gate. The adapter is synchronous, disposable, non-persistent and does
not execute implementation or install anything. Native production qualification is
a separate host integration; controlled fixtures do not establish HQ acceptance.
