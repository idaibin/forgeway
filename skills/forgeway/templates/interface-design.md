# {{INTERFACE_SLICE}}

## Status and authority

- Status: `{{draft|authoritative}}`
- Authority type: `{{typed-router|annotated-controller|idl|openapi|other}}`
- Authority path and symbol: `{{RELATIVE_PATH}}` / `{{SYMBOL}}`
- Owner role: `{{backend|idl-owner|contract-owner|other}}`
- Accepted artifact identity: `{{VERSION_AND_CONTENT_HASH_OR_OMIT_WHEN_DRAFT}}`

## Requirement and business semantics

{{REQUIREMENT_REF_AND_ONLY_SHARED_SEMANTICS}}

## Applicable cross-operation decisions

{{OMIT_WHEN_NONE}}

## Consumers, compatibility and verification gate

{{CONSUMER_AND_GATE_REFS}}

Record structural, backend-conformance, frontend-consumption, runtime, gateway,
deployment, and production verification separately. Omit dimensions that are not
applicable; mark unavailable applicable evidence `Not verified`.

Keep only decisions that are shared across operations or cannot be expressed in the
native authority. Omit empty sections. Do not copy endpoint fields, generated OpenAPI,
DTOs, frontend request handling, page error behavior, deployment status, or database
columns into this record; link their actual owners instead.
