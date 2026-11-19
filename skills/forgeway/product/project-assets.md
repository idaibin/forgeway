# Forgeway Project Asset Model

## Purpose and boundary

This document defines how Forgeway discovers, reuses, creates, classifies, and
stores the durable facts needed to deliver a project. It extends the authority
rules in [`handbook/authority-model.md`](../handbook/authority-model.md); it does
not create a second product model, project schema, or source of truth.
Test asset placement follows the
[project test asset standard](../standards/evidence.md#project-test-asset-ownership).

Forgeway is responsible for finding the next usable project fact and for
coordinating a bounded handoff. The target project remains the owner of its
product decisions, domain rules, source, native interfaces, migrations, UI
authority, tests, configuration, and runtime truth. A Forgeway record may point
to those facts, but must not copy them into a competing contract.

## One semantic owner

Every durable asset has exactly one semantic owner: the person, team, target
project artifact, or implementation source that has final authority for that
kind of fact. Contributors, reviewers, generators, and evidence executors may
be associated with an asset, but they do not become additional semantic owners.

When an asset is generated, the generation source keeps ownership. A generated
OpenAPI document or client, for example, can be a useful consumer or evidence
artifact but cannot silently replace the target's route, IDL, or code-first
contract. A Forgeway index similarly locates an owner; it does not promote an
observation into a product decision.

## Asset kinds and authority

| Asset kind | Target authority to discover first | Forgeway treatment | Forbidden inference |
| --- | --- | --- | --- |
| Product intent, product definition, feature behavior | Accepted product definition, feature specification, or requirement record owned by the target product owner | Reuse or extend the existing record. For a new project, treat user-confirmed intent as the initial authority; an unconfirmed draft is only a proposal | Source code, routes, screens, tests, or telemetry cannot establish what the product is intended to do |
| Domain terms, rules, and lifecycle | Project domain model or an explicitly owned product/domain document | Reuse the project's terminology and record unresolved terms as questions | Class names, tables, endpoints, or current behavior do not by themselves define business meaning |
| UI and interaction | Project `DESIGN.md`, feature UI specification, and the project's established visual/interaction authority | Reference or extend the selected UI authority; preserve its states and accessibility decisions | A rendered screen or component implementation cannot silently become product or design intent |
| Audience-facing Creative content | Createway-owned accepted creative brief, artifact identity, factual sources for time-sensitive content, and named content owner | Treat the accepted opaque artifact identity and evidence as an external input only when the software delivery depends on it; route generation, editing and publication to Createway | Generated media, a provider prompt, or a published screenshot cannot silently become product intent, factual authority, rights clearance or brand authority |
| API, RPC, event, or other interface | Project-native route/handler and DTO declarations, IDL, schema, or code-first contract | Index the native contract and its consumers. Generated descriptions and clients remain derived | Forgeway does not invent a parallel API schema or infer permission/error semantics from a client alone |
| Data model and migration | Project migrations, schema declarations, or the explicitly named data owner | Reference the migration and its execution evidence; use the target's native mechanism for changes | ORM shape, fixture data, or a UI form is not automatically the database authority |
| Architecture, topology, build, and configuration | Project architecture documents, manifests, build files, and owner-confirmed configuration | Record the shortest route to the owner and the commands/configuration it declares | Directory names, framework guesses, or a historical report do not prove a current boundary |
| Implementation | Fixed-basis target source and generated output tied to its source | Record source paths, basis, and changed scope; do not treat an old snapshot as current | Existing implementation proves an implementation fact, not the desired product behavior |
| Tests and verification commands | Target-native test source, test configuration, CI, or owner-provided command | Reuse the declared checks and record their evidence categories separately | A test name, green local command, or documentation statement cannot prove an unexecuted gate |
| Runtime truth and runtime evidence | Authorized target runtime, operation owner, and attributable Evidence | Keep runtime identity, environment, result, and limitations separate from source facts | Static configuration, a build, or a screenshot cannot prove deployment, production, or an unexercised runtime |
| Forgeway delivery metadata | The accepted Requirement, Task, Change, Evidence, and result-envelope owners | Store references and handoff metadata only where the selected campaign/project owner accepts them | A Forgeway index cannot become the authority for target product, API, data, UI, or runtime facts |

The authority order for a disputed fact is the target product/requirement,
domain, native interface, migration/data, UI, fixed implementation, and
executable evidence chain, followed by Forgeway lifecycle and evidence
contracts, then external review advice. This follows the coordinator contract;
external advice is evidence to assess, never a replacement owner.

## Discovery disposition and status

For each requested asset, discovery records a disposition without creating a
new machine format:

- `referenced`: an existing authoritative asset is sufficient and is linked;
- `extended`: an authoritative asset exists and its owner accepts a bounded
  addition;
- `new`: no usable authoritative asset was found, and a named owner, consumer,
  placement, and confirmation exist for creating one;
- `not-applicable`: the asset does not belong to this project or delivery slice,
  with the reason recorded.

Disposition is separate from evidence status. Use the existing evidence levels
where they apply: `Declared`, `Source-resolved`, `Automated`,
`Artifact-resolved`, `Runtime-resolved`, `Gap`, and `Not verified`. A path being
found can make an asset `Source-resolved`; it does not make an inferred product
decision `Confirmed`. Runtime, artifact, automated, and review evidence remain
independent axes.

Also record the authority state needed to make a safe decision:

- `confirmed`: owner and meaning are accepted for this basis;
- `inferred`: an observation from source or existing artifacts that still needs
  owner confirmation; it must not be promoted to product intent;
- `conflict`: two current facts or an intent/implementation pair disagree;
- `decision-required`: a human or named owner must choose before mutation;
- `not-verified`: the expected owner, path, or evidence could not be checked.

An `inferred`, `conflict`, or `not-verified` state never becomes `confirmed` by
adding a link or by passing a build.

## Reuse before creation

Forgeway applies this order to every asset kind:

1. Resolve the target Git root(s), fixed basis, effective guidance, and existing
   dirty exclusions.
2. Search the target's own documentation, manifests, native contracts, source,
   migrations, tests, and runtime authority in the order appropriate to the
   requested fact. Read only enough to establish owner, meaning, path, basis,
   and available evidence.
3. Prefer the existing project `README`, product/feature documents, `DESIGN.md`,
   native API or IDL, migrations/schema, tests, and runtime authority when they
   actually own the requested fact. Names are examples of authority classes, not
   mandatory filenames.
4. Classify the result as `referenced`, `extended`, `new`, or `not-applicable`,
   and attach exactly one semantic owner.
5. Create only when no usable owner exists, the proposed asset has a real
   consumer, its location is accepted by that owner, and the required product or
   source mutation confirmation is present.

Creation is never justified merely because a Forgeway template, prompt, or
agent would find a new file convenient. Forgeway does not copy its own
`standards/`, `workflows/`, `schemas`, or templates into the target project.

## Conflicts, gaps, and stop conditions

Conflicts are preserved as facts with their bases and owners. Forgeway does not
silently merge, rewrite, or add a compatibility layer to make them look
consistent.

| Gap category | Required treatment |
| --- | --- |
| `missing` | Record the absent asset, its intended consumer, owner to resolve it, and the condition for creating or waiving it |
| `stale` | Mark the recorded path or basis stale; perform bounded rediscovery from the current root before repairing a reference |
| `conflicting` | Preserve both facts, identify the decision owner, and stop the affected conclusion until the conflict is resolved or explicitly waived |
| `inferred-unconfirmed` | Keep the observation separate from product intent or an accepted contract; request confirmation before mutation |
| `owner-unresolved` | Do not create or edit a durable asset; resolve the semantic owner first |
| `placement-unresolved` | Do not invent `forgeway/`, `.forgeway/`, or another directory; ask the target/campaign owner to choose a location |
| `evidence-incomplete` | Keep the achieved evidence level and mark missing axes `Not verified`; do not claim Pass |
| `not-applicable` | Record why the asset is outside the topology or delivery slice; do not leave a misleading empty placeholder |

Discovery stops with the coordinator's existing stop states when a gap affects
the next conclusion: `basis-conflict`, `scope-ambiguous`, `input-not-ready`,
`confirmation-required`, `capability-unavailable`, `capability-ambiguous`,
`environment-blocked`, `result-invalid`, or `evidence-incomplete`. A stop state
is not a fallback permission: it does not authorize provider switching, scope
expansion, automatic product decisions, or a later-stage mutation.

In particular, a mismatch between documented intent and implementation is a
`conflicting` Gap and normally requires `product-confirmation-required` before
any source change. A generated artifact that differs from its source is repaired
by regenerating from the source authority, not by hand-editing the generated
file.

## Storage and persistence

Forgeway distinguishes project facts, delivery metadata, and run-local state:

| Class | Persistence rule | Owner and placement rule |
| --- | --- | --- |
| Committed project facts | Version with the target project using its native documentation, source, migration, interface, configuration, or runtime-authority layout; test assets follow [project test assets](#project-test-assets) | The target project owner chooses the path within the applicable placement rules. Forgeway references it and preserves unrelated files |
| Committed Forgeway delivery metadata | Version only when an accepted Requirement/Task/Change/Evidence or campaign requires durable project metadata | A `campaign` manifest belongs to the Forgeway campaign basis; a `project` manifest belongs to an accepted relative path in the target repository. These records contain project-instance references, not copied Forgeway standards or target schemas |
| Ignored run-local state | Keep basis snapshots, in-progress handoffs, capability metadata, temporary generated files, command logs, session/provider identity, and raw runtime transcripts in the host's ignored run-local evidence area; if target-local state is necessary, it must be explicitly ignored and scoped | Run-local state is operational evidence, not a product or project fact and cannot become a portable routing registry |
| Derived/generated output | Keep it only where the target's existing generation lifecycle requires it, and retain the source relationship | The generator/source owner remains authoritative; drift is fixed by regeneration and verification |

No target is required to contain a `forgeway/` or `.forgeway/` directory. Either name may
be used only when an existing, named consumer and target owner explicitly choose
it; neither is a default placement, a prerequisite, or a substitute for the
project's native documentation. Forgeway must not add YAML, JSON, schemas, or
templates just to make discovery easier. A new durable format requires a named
producer, non-LLM consumer, version, validator, drift policy, and retirement
rule before it can be considered.

### Project test assets

Project test assets, including component-local unit tests and shared acceptance
suites, use `docs/testing/`, following
[test asset ownership](../standards/evidence.md#project-test-asset-ownership).
Component-specific subdirectories retain each component's semantic ownership of
its cases. The docs repository versions the test entrypoint and its assets when
docs has an independent Git repository. Each run binds the source checkout and
source/docs revisions; a shared Git repository supplies both revision bindings.
Test results remain separate from product, interface and runtime authority.

## Topology and ownership placement

Topology is resolved from the current repositories and independently locatable,
buildable, or verifiable components. It is not inferred from deployment shape,
framework, or a template.

### Single-repository monolith (`monolith`)

There is one repository and at least one component. Shared product, design,
interface, data, implementation, and runtime facts stay in the existing owner paths;
test assets use [project test assets](#project-test-assets).
Logical subareas may have contributors, but each durable fact still
has one semantic owner. Every basis and command is scoped to the repository or
the named component when one exists.

### Single-repository monorepo (`monorepo`)

There is one repository and at least two independently locatable, buildable, or
verifiable components. Component-local assets remain with their owning
component; component-local tests retain that semantic owner and use the
[project test asset placement](#project-test-assets).
A shared product, design, interface, or data asset is placed
only at a proven shared owner path; it is referenced by components rather than
copied into each one. Shared tests use the same project test asset root and are
referenced by their consumers. A component cannot override a shared authority silently.

### Multi-repository project (`polyrepo`)

There are at least two repositories, and every repository is associated with at
least one component. Each repository receives its own repository identity,
fixed commit basis, effective guidance, source/build/runtime owners, and native
asset references. Cross-repository Requirement, Task, Change, and Evidence
references name the repository and component explicitly; one branch or project
SHA cannot stand in for multiple repository bases.

Shared product or cross-repository contract facts have one declared project or
campaign owner. Other repositories consume that fact by reference. If no owner
or compatible basis can be established, discovery records a Gap and stops the
affected handoff rather than copying the fact into every repository.

## New-project and existing-project entry rules

### New project

The entry may be a user-confirmed idea, an empty directory, or a repository with
no usable project assets. Forgeway first freezes the requested scope and records
the confirmed intent, open questions, intended consumers, and topology facts
that are actually known. It may propose a product or project asset, but the
proposal remains `inferred`/`decision-required` until the product owner accepts
it. No source scaffold, route, screen, test, or generated file can fill that
product-intent gap automatically.

After confirmation, create only the smallest missing asset at a target-owner
approved native location. If no location or owner exists, record
`placement-unresolved` and stop. Domain, UI, API, data, architecture, test, and
runtime assets are created only when applicable and when their corresponding
owner and consumer are known.

### Existing project

The entry starts from a fixed target basis and a read-only inventory. Forgeway
discovers and links existing README/product/design/interface/migration/test and
runtime authority before proposing additions. It distinguishes documented
intent, implementation fact, generated output, and observed runtime evidence.
Missing or stale references become Gaps; they are not silently filled from code.
Only the owning artifact's owner may approve an extension or replacement, and
product confirmation precedes source mutation.

## Scope guardrails

- Forgeway owns discovery, references, lifecycle metadata, handoff validation,
  evidence classification, and stop behavior; it does not own target business
  facts or runtime truth.
- Capability selection is task-time matching against current metadata. This
  model contains no project, model, provider, CLI, executable, fixed Skill name,
  package version, or installation-path binding.
- Read-only inventory of independent repositories or components may run in
  parallel after the basis is frozen. Owner resolution, conflict decisions,
  product confirmation, durable mutation, and final handoff are serialized under
  one current semantic owner.
- External review can challenge a classification, but cannot approve a target
  fact, widen scope, or become the owner.
