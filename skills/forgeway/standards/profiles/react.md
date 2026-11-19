# React Profile

Applies only to an explicitly selected React application. Read the native React and
framework versions, client/server boundaries, package manager and test/build/UI
contracts; do not assume Next.js, a router or a replacement component library.

- MUST keep render pure, props/state immutable and Hooks at supported call sites.
  Effects synchronize external systems with explicit dependency and cleanup
  ownership; derived render data SHOULD not be mirrored in effects unnecessarily.
- MUST treat `dangerouslySetInnerHTML` as an exceptional sink requiring trusted,
  context-appropriate sanitization. JSX escaping does not make dangerous URLs or
  raw HTML safe; validate URL schemes and server/client data boundaries.
- MUST apply shared security/code-design and [frontend CSS](../frontend-css.md)
  rules while retaining native components, tokens and accepted UI contracts.

Acceptance: native lint/type/unit/build checks, meaningful component behavior,
effect cleanup/cancellation and relevant HTML/URL negative tests; actual browser
states, keyboard/focus and overflow. Server rendering is checked only if applicable.
Missing evidence is `Not verified`; selection is not application implementation.

Sources: [React rules](https://react.dev/reference/rules),
[DOM component safety](https://react.dev/reference/react-dom/components/common).
