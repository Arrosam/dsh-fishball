# fishball-ui: contrast (UI-FIX-F, RESHOOT fix 1)

Entry: [`../contrast.test.mjs`](<../contrast.test.mjs>). Ported from `test/v3/fishball-ui/contrast/`.

Authority: the user's UI-FIX-F requirements and screenshot audit (2026-11-18) and RESHOOT fix 1:

1. The ask / permission card's reason textarea (`client.asks.js`, DSH's `conversation.input.dock`): its
   placeholder ("Reason" / "理由") has at least 4.5:1 against the textarea's own fill, light and dark (was 1.26:1).
2. An open ask card's count badge (DSH Tag, tone `warning`) has text at least 4.5:1 against its own fill in
   light (was ≈1.8:1); in dark DSH's warning Tag look is unchanged (text `--dsw-alias-state-warn-primary`).
   Since the question-card accordion (`bdcccc66`), the badge shows a count instead of the waiting words.
3. DSH design tokens only (`--dsw-*`), no hard-coded colours.

## How (live browser)

[`page.mjs`](<page.mjs>) draws the card with fishball-ui's real client **alone** in the scripted DSH page
(../support/ui-page.mjs), feeds one `asks` frame on the page connection (../support/ask-card.mjs) — what core
would serve — or draws the sidebar target list (../support/b-sidebar.mjs). It writes the rendered tree and the
`<style>` sheets the page still holds into one document after DSH's page styles and theme sheets
(../support/contrast.mjs `themedDocument` over fishball-test-helpers/browser `documentOf`), and a real
headless Chromium computes every colour (`PROBE`). The ratio is WCAG 2.x (fishball-test-helpers/wcag), each
translucent layer composited over what is behind it. Rows skip where no Chromium exists.

## Rows

| Id | Technique | Expected outcome |
| --- | --- | --- |
| UIFF-ASK-DT-01 `<permission\|ask> <en\|zh> <light\|dark>` (8) | DT | The textarea's placeholder is "Reason" / "理由", painted at least 4.5:1 against its fill |
| RESHOOT-ASKBADGE-DT-01 `open <variant> <lang> <theme>` (8) | DT; BVA at 4.5:1 | The badge shows `1` for the single-request fixture, tone warning, text at least 4.5:1 against its fill; dark: equal to DSH's own warning Tag and to the token |
| UIFF-TOKENS-EP-01 `<ask card\|target list\|open ask badge> <theme>` (6) | EP | Every colour declaration of Fishball's sheets on the measured elements uses DSH tokens only |
| UIFF-ORACLE-CTRL-01 placeholder × theme, warning Tag light (3) | Control | DSH's default placeholder token (1.26:1) and DSH's warning Tag on the page (1.96:1) measure below 4.5:1, so a pass is not an artefact |

The two card variants: the drawn AskCard (ask-card.d.ts) carries no offer type, so "permission" is a card
with complete arguments and "ask" a card without arguments (`CARD_VARIANT`).

## Regression evidence

The fixes predate 117cb2a2 (fishball-ui was `packages/fishball-ui`), so `--against` cannot reach them. The
same measurement with `client.asks.js` swapped for its copy at a base commit
(`.runtime/port/port-ui-b-regression/contrast-base.test.mjs`, scripted-page `chunkFiles`):

| client.asks.js at | placeholder light / dark | open badge light / dark |
| --- | --- | --- |
| 9f5a4228 (before UI-FIX-F) | 1.26 / 1.26 (fail) | 1.83 / 5.75 |
| 881b14b2 (before RESHOOT fix 1) | 5.80 / 8.03 | **1.83** (fail) / 5.75 |
| Rewrite baseline (`4f0d5fcc`, before the accordion) | 5.80 / 8.03 | 6.36 / 5.75 |

## Not here

- Retired: UIFF-STRIP-DT-01 (4) and UIFF-ORACLE-CTRL-01 "success tone light" (the status card is withdrawn,
  MULTI-3 D03); RESHOOT-ASKBADGE-ST-01 (4) (finished cards are no longer drawn in the dock, f24f814a).
- UIFF-ORACLE-BVA-01 (the WCAG arithmetic at its edges) is fishball-test-helpers' own (HLP-WCAG-BVA-01,
  -EP-01..03): retired here as a duplicate of the helper's tests.
