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

4. RESHOOT fix 1 (2026-11-18): an open ask card's state badge (a DSH Tag, tone `warning`, "Fishball is
   waiting for your answer" / "Fishball 正在等你回答") has text at least 4.5:1 against its own fill in
   the light theme (it was #F59E0B on #FDEACC, ≈1.8:1), from DSH tokens only; in the dark theme DSH's
   warning Tag look is unchanged (text `--dsw-alias-state-warn-primary`, ≥ 4.5:1). Answered / closed
   badges (tone `neutral`) are out of scope and stay DSH's neutral Tag.

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
| RESHOOT-ASKBADGE-DT-01 `open <type> <lang> <theme>` | DT: card type (permission, ask) × en / zh × light / dark, state open; BVA at 4.5:1 | The card's state badge (the first DSH Tag in the card root) reads "Fishball is waiting for your answer" / "Fishball 正在等你回答", tone `warning`; its text against the badge's painted fill is at least 4.5:1. Dark only: its text colour and own background equal those of DSH's own `warning` Tag drawn outside the card, and the text equals `--dsw-alias-state-warn-primary` (DSH's look unchanged) |
| RESHOOT-ASKBADGE-ST-01 `<answered\|closed> <theme>` | ST: open → answered / closed × light / dark | The badge is a `neutral` DSH Tag, does not say it is waiting, and its text colour and own background equal DSH's own `neutral` Tag's (out of fix 1's scope: unchanged) |
| UIFF-TOKENS-EP-01 `<card> <theme>` | EP: token-only vs hard-coded | Every declaration of Fishball's own sheets that selects a measured element (the target up to its card root; the ask card's reason textarea, the status badge, and the open ask card's state badge) has no hex, colour function or named colour outside `var()` names |
| UIFF-ORACLE-CTRL-01 | Control | DSH's default placeholder token over the same fill, DSH's plain success colour over the badge's light fill, and DSH's own `warning` Tag drawn straight on the light page background, outside the card, measure below 4.5:1 (1.26:1, 2.00:1 and 1.96:1 on both SDKs; the pre-fix ask badge itself, on the card's warn band, was ≈1.83:1), so a pass is not an artefact of the page |
| UIFF-ORACLE-BVA-01 | BVA | 1:1, 21:1, #767676 (≥ 4.5) and #777777 (< 4.5) on white, `color(srgb …)` = `rgb()`, a transparent ink, alpha compositing, no opaque backdrop throws |

Mutation check (2026-11-18): the rows run against the chunks of the commit before the fix
(9f5a4228) fail all 12 DT rows: placeholder 1.26:1 (light and dark), badge text 2.00:1 (light),
badge shape 1.19:1 against the heading row (dark: the success tone's fill only, no outline). The
audit's dark "4.73:1" is the text against the fill (measured 4.68:1 before the fix); requirement 2's
3:1 shape rule is what the dark badge failed before.
RESHOOT fix 1 (2026-11-18): run against dev/v3-reshoot @ 881b14b2 (before the fix), the 4 light
RESHOOT-ASKBADGE-DT-01 rows fail at 1.83:1 (#F59E0B on the warn band); the dark and ST rows pass.

**Re-baselined (MULTI-3 requirement D):** the status card is gone, so UIFF-STRIP-DT-01 and the
success-tone control row stay listed, withdrawn. UIFF-TOKENS-EP-01 "target list" replaces "status
card": the sidebar target list, one row per public state with the connected row expanded, uses DSH
tokens only in both themes (requirement G). The ask-card fixtures carry MULTI-0's `handle` and `source`.
`page.mjs` `measure` takes an optional viewport, which the frame-layout rows of `../package` use.
