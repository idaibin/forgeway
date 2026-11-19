# Vue Profile

Applies only to an explicitly selected Vue application; never converts an existing
project. Read native Vue version, router, state management, build scripts, package
manager and UI contracts before changing source. Preserve Options/Composition API
and SSR ownership as evidenced, not from a preferred scaffold.

- MUST keep component inputs/outputs and state ownership explicit; release watchers,
  subscriptions and requests with their owning lifecycle. Avoid shared mutable
  request state in SSR. Derived state SHOULD use the existing computed convention.
- MUST NOT compile untrusted strings as templates. Treat `v-html` as an exceptional
  sink requiring trusted, context-appropriate sanitization; interpolation is not a
  guarantee for URL, CSS or HTML sinks. Validate URL schemes before use.
- MUST apply the shared security and code-design baseline plus
  [frontend CSS rules](../frontend-css.md) without replacing native UI authority.

Acceptance: native lint/type/unit/build checks as present; component behavior and
applicable empty/error/loading states; real browser keyboard/focus/overflow and
dangerous HTML/URL negative cases. SSR checks apply only with SSR. Missing checks
remain `Not verified`; a profile selection creates no Vue source or runtime proof.

Source: [Vue security guidance](https://vuejs.org/guide/best-practices/security).
