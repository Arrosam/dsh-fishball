# Third-party notices

Fishball is MIT-licensed ([LICENSE](LICENSE)).

It runs inside DeepSeek Harness and uses the host's installed packages as peer dependencies: `@deepseek-ai/*` (MIT, Copyright (c) 2026 DeepSeek) and `@deepseek-ai/cordis` (MIT, Copyright (c) 2021-present Shigma). No host source is bundled into this repository; the one copied host drawing is listed below.

## FishMark

The Fishball mark drawn in `src/client/client.shell.js` is FishMark from the owner's own fishball app (`app/src/main/java/org/areel/fishball/ui/Surfaces.kt` at `f4a887d`; MIT, same author), redrawn as SVG with the launcher icon's colours. It moved here from `dsh-connector` with that client (V3 R-EMBED; U-SHELL split it into `client.shell.js` and its parts). The package icon `assets/connector-ui-icon.svg` is the same mark with a window badge whose frame copies the outline of DSH's `IconPanelLeftOutlineRegular` (`@deepseek-ai/dsh-client-ui-primitives`, MIT, Copyright (c) 2026 DeepSeek).

Any third-party code added later must be listed here with its licence and notice.
