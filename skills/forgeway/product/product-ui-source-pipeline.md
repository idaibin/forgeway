# Product UI Source Pipeline

## Intent

Let Forgeway coordinate Product UI work from an existing or supplied design source
without turning screenshots into product facts, duplicating a target design system,
or making every independent Skill depend on Forgeway.

## Confirmed behavior

- Every Product UI run first classifies the target as an existing project or a new
  project, then records whether an accepted visual source is available.
- Existing project with accepted designs: preserve the source identity and extract
  page-local structure, states and visual evidence into the applicable feature UI
  spec. Existing `DESIGN.md`, components, tokens and source remain authoritative for
  their own meanings.
- Existing project without a design for a new page: confirm the Product/Feature spec,
  create a candidate feature UI spec and a complete preview-generation prompt, then
  route image generation to an available Product Design/image capability. The user
  must select the exact output before it becomes the accepted visual source.
- New project with supplied Lanhu, PSD, image, mockup or equivalent design source:
  retain the original source or an immutable opaque reference plus its hash, revision,
  rights/use boundary and viewport/state coverage. Extract proven shared visual
  semantics into a candidate Google `DESIGN.md`; visually inferred or unavailable
  values remain proposed or `Not verified`.
- A newly created or changed `DESIGN.md` requires official format validation,
  completeness validation and non-implementer human approval bound to its exact hash.
  Source extraction cannot approve its own result.
- After a design baseline is accepted, each new page receives its own feature UI spec.
  Before review and delivery, compare the implementation at the same viewport and state
  under the [visual verification standard](../standards/frontend-css.md#verification).
- UI confirmation images and browser screenshots are Product UI evidence. Image,
  video, audio, poster and other content-production tasks remain Createway work.
- Every Skill remains independently callable. Forgeway sequences only the owners
  needed for the selected run and validates their handoffs; it does not restrict or
  replace their standalone use.

## Authority and maintenance

| Artifact | Semantic owner | Forgeway behavior |
| --- | --- | --- |
| Product/Feature spec or PRD | `product-spec` or the target product owner | Reuse, clarify or update only when product behavior changes |
| Feature UI spec | `ui-spec` | Extract from an accepted source or author the next page contract |
| Shared `DESIGN.md` | `ui-spec` plus named human approver | Create/change only for shared semantics and enforce exact-hash approval |
| `AGENTS.md` | target repository guidance owner | Update only when durable repository instructions, boundaries or commands change |
| Repository Asset Graph / derived repo-map | `repo-map` | Scan/query for navigation and impact; never replace source or UI authority |
| Tests and source | matching implementation owner | Implement the smallest accepted slice and native tests |
| Browser/design comparison evidence | `ops-browser` plus implementation/review owners | Retain ignored evidence bound to the fixed Result Package |

## Product UI paths

### Existing project with accepted design

```text
fixed basis → source preservation/extraction → feature UI spec
→ implementation mapping → implementation → qualifying source comparison and affected-state rechecks
→ review → delivery
```

### Existing project, new page without accepted design

```text
Product spec → candidate UI spec + complete generation prompt
→ Product Design/image capability → user selection
→ accepted feature UI spec → implementation → browser comparison
→ review → delivery
```

### New project with supplied design source

```text
source preservation/extraction → candidate DESIGN.md
→ format/completeness checks → exact-hash human approval
→ page UI spec → implementation → source/runtime comparison
→ review → delivery
```

## Bug-fix path

For a visual bug supplied with text and an image, first fix the repository basis and
reproduction viewport/state. A bounded bug may be diagnosed directly from live source.
When a compatible Repository Asset Graph exists, query the page/route asset and its
incoming/outgoing impact edges to reduce the read set, then recheck every returned
owner and consumer in current source. A graph miss or stale snapshot never proves
absence and never authorizes a fix.

The repair must preserve Product/UI/DESIGN authority, change the smallest real owner,
run affected native tests and browser reproduction, then review and deliver against
the exact result basis.

## Acceptance

| ID | Observable result |
| --- | --- |
| `PU-SOURCE-01` | Existing/new project and source availability select one explicit UI path without changing Skill availability. |
| `PU-SOURCE-02` | Supplied design sources retain stable identity, hash/revision, rights/use and evidence limitations. |
| `PU-SOURCE-03` | Shared semantics enter `DESIGN.md`; page-local composition remains in feature UI specs. |
| `PU-SOURCE-04` | Candidate preview generation stops for named human selection before implementation. |
| `PU-SOURCE-05` | Implemented pages follow the [visual verification standard](../standards/frontend-css.md#verification) and complete required responsive/accessibility checks. |
| `PU-SOURCE-06` | PRD, UI spec, DESIGN, guidance, repo graph, source and tests retain separate semantic owners. |
| `PU-BUG-01` | A repeatable image-plus-text bug experiment reports navigation effort, patch scope, browser outcome and impact-validation coverage for direct and repo-map paths. |

## Non-goals

- Treating a screenshot, PSD or generated preview as proof of hidden behavior,
  accessibility, responsive rules, permissions, APIs or exact uninspected tokens.
- Requiring Forgeway before an independent Skill can be used.
- Automatically rewriting every PRD, `DESIGN.md`, `AGENTS.md`, map or test suite on
  every run.
- Using repo-map output as source authority or claiming general AI productivity from
  one controlled fixture.

## Readiness

**Ready for Forgeway workflow, Skill and evaluation implementation.**
