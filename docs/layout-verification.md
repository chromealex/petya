# Unity layout verification

Verified on 2026-11-05 with Unity 6000.3.15f1 on macOS, against Petya 0.8.3 sources. The installed Petya.app was not rebuilt by these tests.

## Scene import

`tests/layout-scene-live.cjs` creates an isolated temporary Unity project. It runs the production resource-upload C# and final scene-import C#, with a valid PNG and actual local regular TTF. Both Figma- and Zeplin-shaped fixtures passed:

- New UXML, texture, font and PanelSettings assets import successfully.
- A UIDocument referencing the imported layout and panel is placed in the active scene.
- Layout and resource references resolve in a real UI Toolkit panel.
- Changing the panel from 320x240 to 640x480 changes image/text widths from 288 to 608 pixels.
- Font size remains 24 logical pixels; image and font references remain intact.
- Figma stretch and bottom-edge constraints retain the 16-pixel margins.
- The scene is marked dirty without being saved; Undo removes the created document.

The image validation also rejected a corrupted PNG during development, before scene placement. The regression fixture now uses a valid deterministic PNG.

## Complex interface stress test

`tests/layout-complex-live.cjs` imports a synthetic Figma-shaped dashboard built by `tests/fixtures/layout-complex.cjs`: 446 source layers, 24 image cards, 36 table data rows, regular and bold TTF fonts, a fixed sidebar, toolbar and footer, wrapping card layout, and nested vertical/horizontal scroll views. It uses real Unity imports and computed UI Toolkit layout, not a browser imitation.

| Viewport width | Card rows | Vertical scroll range | Horizontal table scroll range |
| --- | --- | --- | --- |
| 360 | 24 | 4921 | 558 |
| 768 | 12 | 2799 | 150 |
| 1440 | 5 | 1577 | 0 |

Assertions passed for all widths: all cards remain inside the horizontal viewport, no cards intersect, cards reflow into fewer rows as width increases, the sidebar remains 80 pixels wide, the main region fills the remaining width, the footer remains inside the viewport, and both scroll axes work. All card image and font references resolve. The test also checks applying a scroll offset.

## MCP and provider checks

`tests/mcp.cjs` invokes `tests/layout-mcp.cjs` through an authenticated MCP client. It covers all five layout tools, scope/access rejection, missing font blocking, invalid font bytes, local picker cancellation, font assignment, duplicate starts, changed credentials and notifications. `tests/layout-assets.cjs` covers Figma rendered image URLs, Zeplin exports, token isolation from CDN requests, rejected URLs, missing exports, byte limits, confirmation cancellation and revoked authorization during the importer workflow.

`tests/layout-unity-live.cjs` remains the historical fixed-layout regression: nested offsets, text geometry and colors in real Unity.

## Reproduction

Run from the repository root with Node 22.12+ and a licensed Unity editor:

```sh
node tests/mcp.cjs
PETYA_UNITY_EDITOR=/path/to/Unity PETYA_UNITY_VERSION=6000.3.15f1 PETYA_TEST_FONT=/path/to/regular.ttf node tests/layout-scene-live.cjs
PETYA_UNITY_EDITOR=/path/to/Unity PETYA_UNITY_VERSION=6000.3.15f1 PETYA_TEST_FONT=/path/to/regular.ttf PETYA_TEST_FONT_BOLD=/path/to/bold.ttf node tests/layout-complex-live.cjs
```

On macOS the default test fonts are the system Arial and Arial Bold files. They are read for testing and copied only into temporary Unity projects, not committed to this repository. The runners print the temporary project directory and retain fixture JSON, generated C#, imported assets, editor.log, verification.txt and (for the stress test) measurements.txt.

## Limits of this evidence

These are deterministic source fixtures, not an authenticated live Figma/Zeplin account or a user's production design. The live tests check imported assets, scene wiring and computed geometry; they do not compare screenshots pixel by pixel or validate font licensing. The complex fixture references a shared test image in multiple cards. The importer preserves supplied layout rules; it cannot infer responsive redesigns or interaction logic absent from the source. Mixed text runs, unsupported effects and some container image transformations still require visual review as reported by the extension. Output is UI Toolkit, not a uGUI prefab.

Provider references: [Figma file and image endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/), [Zeplin screen versions](https://docs.zeplin.dev/reference/screen_version), [Zeplin assets](https://docs.zeplin.dev/reference/asset), [Zeplin text styles](https://docs.zeplin.dev/reference/layer_text_style), and [Zeplin constraints](https://docs.zeplin.dev/reference/layer_constraints).
