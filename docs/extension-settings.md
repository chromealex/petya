# Extension UI ownership

Every bundled extension directory declares `extension.json`. The generic host discovers these descriptors; application HTML does not list extension scripts. Descriptors declare the setting that activates the extension, renderer scripts and their startup dependency, optional backend feature, settings markup and chat result renderers.

Settings controls, labels, model choices and handlers belong to the extension. The host provides the catalog, loading, disclosure container and navigation. Bundled renderers run with the existing renderer bridge; this is not a sandbox for arbitrary downloaded JavaScript.

Audit:

| Extension | Settings owner | Notes |
| --- | --- | --- |
| Artist | `artist/settings.js` | Lazy mount after addition; backend and notification mapping live beside it. Replaces the duplicate legacy image installer view. |
| Unity | `unity/settings.js` | Shared service selection; editor connection form belongs to Unity. |
| Layout | `layout/settings.js` | Lazy settings and result renderer, backend owned by extension. |
| Telegram | `telegram/settings.js` | Service connection form and contact renderer owned by extension. |
| Jira | `jira/settings.html`, `jira/settings.js` | Own fields and project selection; shared Atlassian authentication adapter remains in connections. |
| Confluence | `confluence/settings.js` | Own form; intentionally shares Atlassian credentials with Jira. |
| Blender | No settings | Own chat controls and backend. |
| Chat statistics | No settings | Uses the current chat only. |
| Files | No settings | Internal result adapter; no catalog installation action. |

Service connection forms remain mounted for compatibility with the shared settings form and credential adapter; disabled services are not offered as active connections. Standalone extensions mount their settings only after addition. No extension-specific settings branch belongs in the catalog or host.

Backend compatibility entry points in `src/features/` remain for existing callers; implementation and discovery belong to the extension. Model downloads remain separate from adding an extension and require their existing download approval.

Run `tests/extension-ui.cjs`, `tests/artist-ui.cjs`, `tests/jira-selection-ui.cjs` and `tests/slack-screen-ui.cjs` for registry, rendering, notifications and navigation regression coverage.
