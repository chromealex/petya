# Unity layout verification

Verified on 2026-11-05 with Unity 6000.3.15f1 on macOS, against Petya 0.8.3 source code.

## Result

The extension imports basic fixed-position UI Toolkit layouts from Figma- and Zeplin-shaped design data. A real Unity process compiled and executed the production-generated C# importer in an isolated temporary project, loaded both UXML files as VisualTreeAsset objects, cloned them into an editor panel, and checked the resolved layout after the UI Toolkit layout pass.

Both providers passed these checks:

- Root size: 320 by 240 pixels.
- Nested panel offset: 20, 30 pixels.
- Nested text offset: 16, 16 pixels, with final position 36, 46 relative to the root.
- Text content: Hello Unity; dimensions: 220 by 32 pixels; font size: 24 pixels; color: red.
- Separate imports produced separate asset paths.

The check found and fixed missing Zeplin text size and color: those values belong to `text_styles[].style`. Multiple text styles now produce a warning that only the first style is used. The importer now forces synchronous import and rejects a missing VisualTreeAsset instead of returning a path as success.

## Reproduction

Run from the repository root with Node 22.12+ and a licensed Unity editor:

```sh
PETYA_UNITY_EDITOR=/path/to/Unity PETYA_UNITY_VERSION=6000.3.15f1 node tests/layout-unity-live.cjs
node tests/mcp.cjs
```

The live runner prints its temporary project directory and retains source fixtures, generated C#, imported assets, editor.log and verification.txt for diagnosis. It does not modify a user's Unity project. It checks computed geometry and styles, not screenshot similarity. The MCP suite separately exercises provider requests, access boundaries and import dispatch through an authenticated MCP client, with fixture service responses and a stub Unity invoker.

## Limits

This verifies the basic generator and importer, not complete reconstruction of arbitrary designs. There is no live Figma/Zeplin account or real user design in this test. Raster/vector assets, custom font files, effects, responsive constraints, mixed text styling and interactions are not reproduced. Import creates a UXML asset; it does not place an interface into a game scene or create a uGUI prefab. The installed Petya.app was not rebuilt in this task.

Reference for the corrected provider mapping: [Zeplin Layer Text Style](https://docs.zeplin.dev/reference/layer_text_style).
