# UI-FIX-F contrast rows (`fishball-ui.contrast`)

Authority: the user's UI-FIX-F requirements and the screenshot audit (2026-11-18):

1. The ask / permission card's reason textarea (fishball-ui `client.asks.js`, in DSH's
   `conversation.input.dock`, Fishball's own conversation): its placeholder ("Reason" / "理由") has
   at least 4.5:1 against the textarea's own background, light and dark DSH theme. It was 1.26:1
   (`--dsw-alias-label-dimmed`).
2. The status card (`client.strip.js`), `data-fishball-strip-state="connected"`: the badge text (the DSH
   Tag holding `[data-fishball-strip-badge]`) at least 4.5:1 against the badge's own background, and
   the badge shape (fill or outline) at least 3:1 against the heading row behind it, light (was
   1.99:1) and dark (was 4.73:1, no regression below 4.5:1).
3. DSH design tokens (`--dsw-*`) only, no hard-coded colours; behaviour unchanged (the existing ask-card,
   strip and model-dialog rows hold that, and are not changed).

WCAG 2.x: relative luminance and contrast ratio; 1.4.3 text (4.5:1), 1.4.11 non-text shape (3:1).

## How (live browser)

`page.mjs` draws the cards with fishball-ui's real client in the F-SETTINGS scripted page (through
the existing `cardPage` and `stripPage` harnesses), keeps the `<style>` sheets the page mounted,
and writes one HTML document: DSH's page styles (dsh-web-frontend `index.html`'s stylesheet links,
which hold the real Tag rules and DSH's default `::placeholder`), DSH's theme sheets (the installed
dsh-client-ui-theme's own `apply`, its sheet effects only), then Fishball's sheets, and the drawn
tree, with `body[data-ds-dark-theme]` for dark. The LITE rows' headless Chromium
(`test/v2-page-cases/lite-browser.mjs`, temp profile, `--use-mock-keychain --password-store=basic`)
computes every colour. The oracle (`wcag.mjs`) composites each translucent layer over what is
behind it (source-over, sRGB) before computing the ratio. A static CSS resolver was not needed:
Chromium resolves `var()`, `color-mix()`, the cascade and `::placeholder` as DSH's page does.

Rows skip (as the LITE rows do) where no Chromium exists (`FBTEST_CHROME` or the Playwright headless shell).

| Id | Technique | Expected outcome |
| --- | --- | --- |
| UIFF-ASK-DT-01 `<type> <lang> <theme>` | DT: card type (permission, ask) × en / zh × light / dark | The textarea's placeholder is "Reason" / "理由"; its painted colour (× its opacity) against the textarea's painted fill is at least 4.5:1 |
| UIFF-STRIP-DT-01 `connected <lang> <theme>` | DT: en / zh × light / dark, state connected | Badge text against the badge's painted fill at least 4.5:1; the better of the fill and each outline (inset box-shadow with a spread, or a border) against the heading row's painted fill at least 3:1 |
| UIFF-TOKENS-EP-01 `<card> <theme>` | EP: token-only vs hard-coded | Every declaration of Fishball's own sheets that selects a measured element (the target up to its card root) has no hex, colour function or named colour outside `var()` names |
| UIFF-ORACLE-CTRL-01 | Control | DSH's default placeholder token over the same fill, and DSH's plain success colour over the badge's light fill, measure below 4.5:1 (1.26:1 and 2.00:1 on both SDKs), so a pass is not an artefact of the page |
| UIFF-ORACLE-BVA-01 | BVA | 1:1, 21:1, #767676 (≥ 4.5) and #777777 (< 4.5) on white, `color(srgb …)` = `rgb()`, a transparent ink, alpha compositing, no opaque backdrop throws |

Mutation check (2026-11-18): the rows run against the chunks of the commit before the fix
(9f5a4228) fail all 12 DT rows: placeholder 1.26:1 (light and dark), badge text 2.00:1 (light),
badge shape 1.19:1 against the heading row (dark: the success tone's fill only, no outline). The
audit's dark "4.73:1" is the text against the fill (measured 4.68:1 before the fix); requirement 2's
3:1 shape rule is what the dark badge failed before.
