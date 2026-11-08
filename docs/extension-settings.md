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

## App catalog

`src/ui/app-catalog.js` (`window.openAppCatalog(term)`) lists service modules and every extension with an activation setting. It is a large dialog: a rail («Все», «Добавленные», «Требуют настройки», categories with added/total), search over name, description, category and example phrases («/» focuses it), category sections of tiles and a details panel (Esc closes it before the catalog). A tile shows one action: «Добавить», «Подключить» (added but not connected) or «Открыть» (details). Several apps are added through «Выбрать несколько» or the tile checkboxes that appear on hover/focus, with the bar showing the download size and a free-space warning.

What the catalog reads from `extension.json`, besides `name`, `description`, `category` and `downloads`:

- `examples` — 2–6 short phrases as users say them; shown under «Что можно сказать», searched, and put into the composer (not sent) when clicked. Service modules without a directory take them from `categories.json` → `moduleExamples`.
- `icon` — `icon.svg` beside the descriptor: a 24×24 monochrome stroke icon in `currentColor`. It is validated (no scripts, styles, links) and inlined, so the tile tints it by the category `hue` from `categories.json`. No brand logos.
- `connects` — the service the app needs («Sentry», «GitHub»). Whether it is connected comes from the app's `offer.cjs` `ready(settings)`, or from `connectsKeys` (settings that must be filled); the catalog row carries only the boolean `connected`. Service modules use their saved-credential flags.
- `uses` — cross-app kinds (`src/features/app-links.cjs`) its cards call; with `provides` this fills «Работает вместе с».

Run `tests/app-catalog-ui.cjs` (and with `PETYA_INTERFACE_LANGUAGE=en` for the English pass; `tests/apps-ui.sh` runs both); screenshots are saved as `petya-catalog*.png` in the temp folder.

Backend compatibility entry points in `src/features/` remain for existing callers; implementation and discovery belong to the extension. Model downloads remain separate from adding an extension and require their existing download approval.

Run `tests/extension-ui.cjs`, `tests/artist-ui.cjs`, `tests/jira-selection-ui.cjs` and `tests/slack-screen-ui.cjs` for registry, rendering, notifications and navigation regression coverage.
