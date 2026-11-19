# Clean dead code

Use for a separate request such as “清理这里的死代码”. Ordinary development already
handles proven obsolete code inside its authorized change; it need not invoke a
separate workflow. Rules: [dead-code cleanup](../standards/dead-code-cleanup.md).

1. Resolve repository, scope, preserved behavior and exclusions from current context.
   Bind current source and unrelated local changes; ask only for decisive missing inputs.
2. The audit owner checks actual consumers and native semantics, including dynamic
   registration, public exports and template/slot behavior. Return proven removable,
   uncertain retained and live excluded items. Audit is the default; no source edits.
3. If local correction is requested and authorized, the source owner removes only
   proven candidates. Stop affected ownership conflicts or stale evidence; preserve
   unrelated content and avoid adjacent refactoring or broader repository cleanup.
4. The verifier checks original behavior and affected consumers with applicable native
   checks. Requested reviewers inspect the fixed patch; fixes receive targeted rechecks.

Reuse current task/result evidence and host capabilities. An empty proven set is a
valid no-op. Return actual changes, retained items and unverified layers. No implicit
service start, build, installation or Git delivery.
