# Project Collaboration and Personal Profile v1

## Authority and placement

Target projects own their document structure, roles, permissions and native commands. Forgeway may create or maintain an accepted `project-docs/` tree, but it MUST keep project facts in their native owners and MUST NOT embed a second Forgeway checkout, `.agents/`, copied Skills or a Skill catalog in that tree. Skills are discovered, installed and upgraded by the host. Missing capabilities are reported by semantic responsibility.

When a target adopts the conventional documentation set, use only applicable current-delivery owners: `prd/`, `ui/`, `contracts/`, `architecture/`, `deployment/` and `release/`. Development configuration belongs to `deployment/`; environment release, deployment and rollback configuration belongs to `release/`. Historical migrations, task logs and temporary evidence do not belong in formal project documents.

## Personal profile

For a conventional generated `project-docs` tree, roles, workflow and profile files share one owner directory: `project-docs/collaboration/`. Its committed entry files are `README.md`, `roles.md`, `workflow.md` and `profile.example.json`; the one personal profile is `profile.local.json` in the same directory and MUST be ignored by the `project-docs` Git repository. It stores only personal roles and collaboration preferences. It MUST NOT contain project paths, dependency locks, capability installation state, credentials, permissions or authorization.

Owner: the local user. Producer: the user or a host interaction acting on the user's explicit selections. Non-LLM consumer: `forgeway profile check` and the host coordinator. Validator: `contracts/project-profile.schema.json` plus `tooling/project-profile.mjs`. Contract version: `forgeway-project-profile/1`. Drift rule: reread on every new run and after an explicit profile update; never cache it into shared project artifacts. Retirement: a successor must use a new schema version and an explicit user-approved migration; never silently rewrite an existing profile.

Roles are a unique array containing one or more of `project-management`, `product`, `ui`, `frontend`, `backend`, `test`, and `delivery`. One person may hold several roles. If roles are missing or empty, the host asks with a native multi-select. When native multi-select is unavailable, ask seven independent yes/no questions and aggregate affirmative selections; never put all roles in one mutually exclusive choice. Missing answers do not mean rejection.

Preferences control language, response detail, final-document style and structured questions. They never expand role, repository, host or operation permissions. An invalid profile is reported without deletion, replacement or default role assignment.

## Project workflow records

Formal project documentation may describe the current stage map, change invalidation, role boundaries and release rules. Run-local handoffs, validation reports, screenshots and evidence belong in the target's ignored evidence area unless a project owner explicitly adopts a final receipt. Use `templates/handoff.md`, `templates/verification-report.md` and `templates/release-checklist.md` only for an actual slice; do not prefill success.

## Task handoff wording

Delegated task instructions MUST address the receiver directly. State only the
accepted objective, necessary context, scope, constraints and expected result;
omit repeated "the user says/wants/requests" narration and unrelated dialogue.
Preserve existing Task, Artifact and Evidence references instead of copying their
full contents.

Compression MUST preserve authorization limits, exclusions, dependencies, stop
conditions, unresolved decisions and evidence status. It MUST NOT turn a proposal
into an approval or give a summary authority over its sources. Quote only the
smallest necessary original wording when exact text affects interpretation,
acceptance, authorization or a verbatim deliverable; retain its source and scope.

Use a short direct instruction when sufficient; this rule adds no required
template or fields. Result handoffs keep their observed facts and limitations.
