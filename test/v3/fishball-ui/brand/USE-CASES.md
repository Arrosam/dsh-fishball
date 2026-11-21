# LOGO-BUTTON: Fishball's brand in DSH's sidebar

Requirement: LOGO-BUTTON (take 2, relayed 2026-11-19). On the Fishball page (the hosted child DSH
page, `<html data-fishball-page>`), fishball-ui fills DSH's `sidebar.brand.mark` and
`sidebar.brand.name` slots at priority -1 (the V1 mechanism), so the top-left of DSH's sidebar is
Fishball's brand. The page accepts the dependency on DSH's shell. Levels: component rows run
fishball-ui's real client and chunks in the F-SETTINGS scripted page over a scripted DSH shell
(`page.mjs`); the New Session rows run fishball-page's real hiding over a scripted shell document
(`hide.mjs`); the motion rows resolve computed CSS animations in headless Chromium (`motion.mjs`,
skipped where no Chromium exists). The settings and status rows are `fishball-core.settings`
(`test/v3/fishball-core/settings/brand.mjs`).

## Use Cases

| UC | Use case | Actor | Main flow | Alternatives / exceptions |
| --- | --- | --- | --- | --- |
| BRAND-UC-01 | See Fishball's brand on the Fishball page | Visitor | 1. The Fishball page is open (the page root mark). 2. The wide brand row shows a 24px mark, the wordmark FISHBALL and the small tag Deepseek Harness beneath, with a status text and light. 3. The mark theme follows the strip frame's `brandStyle`: Fishball's fish, or Fishball's own whale. (BRAND-EP-01/02/03/08/09) | A1 no page root: both slots unregister and the shell is unchanged. A2 unknown/absent `brandStyle`: Fishball. A3 the shell's own fallback is replaced at priority -1. |
| BRAND-UC-02 | See the state | Visitor | 1. The asks frame names the manager and its cards; the sessions list says whether it runs; the strip frame says core is on. 2. Connected-idle: Connected. Working: Working and the fish wags / whale swims. Needs attention: Waiting for you (n), badge n. Offline: Offline, error-like light. (BRAND-DT-01, BRAND-BVA-01, BRAND-ST-01…06) | A1 the asks stream not live, core off, or no manager: Offline. A2 the strip stream alone stale/closed: still connected (the asks stream is the link). A3 reduced-motion preference: static. |
| BRAND-UC-03 | Open the one manager session | Visitor | 1. Mouse click, Enter or Space on the wide brand button. 2. `uiWorkspace.openSession(managerId)` opens/focuses the one manager session; the shell's own New Session handler does not run. (BRAND-DT-03…06) | A1 no manager id known: nothing happens, no new session. E1 the rail toggle keeps its own name/click and is never hijacked. A2 no ensure POST is ever sent by the logo. |
| BRAND-UC-04 | Keep the shell's accessible names correct | Visitor | 1. The shell's brand button initially carries the sidebar's localized `session.new.label`. 2. The brand occupant makes the accessible name exactly Fishball and keeps it after every shell rerender; the status goes in the description, not the name. (BRAND-ST-08/09, BRAND-DT-01) | A1 teardown restores the previous label and description. |
| BRAND-UC-05 | Keep the real New Session button hidden | Owner | 1. fishball-page hides the shell's New Session button by matching its localized aria-label. 2. While the wide native button still offers New Session, fail closed. The mounted Fishball manager button is visible; the actual New Session action stays hidden. The rail toggle retains Open sidebar. (BRAND-NS-01, BRAND-NS-02) | A1 after the logo mounts. A2 after the shell replaces both controls. A3 en and zh. |
| BRAND-UC-06 | Choose the logo theme in core's settings | Owner | 1. Core's settings page shows one plain two-option control, `[data-fishball-brand-style]`, labelled Fishball / DeepSeek. 2. The choice writes core's top-level `brandStyle` through the config form; the selected option reflects the form snapshot. 3. Core's status snapshot carries `brand: {style}` and the strip frame carries it as `brandStyle`. (BRAND-SET-EP-01/02, BRAND-SET-UC-01, BRAND-STATUS-*) | A1 absent or unknown stored value: Fishball. E1 the write refused or rejected: a visible failure. A2 a recompose after the write reads the new choice. |
| BRAND-UC-07 | Unmount cleanly | Runtime | 1. The brand part unmounts: observers disconnect, listeners go, streams close, styles are removed, the shell's previous aria-label/aria-description return. 2. The page root mark goes away: the two brand slots unregister. (BRAND-TEAR-01/02) | A1 the shell stays; only the brand goes. A2 the observer must not rewrite the shell's label after teardown. |

## Equivalence partitions

| Partition | Classes | Rows |
| --- | --- | --- |
| Logo theme | `fishball` (default) / `deepseek` | BRAND-EP-01, BRAND-EP-02, BRAND-DT-01, BRAND-DT-02 |
| Art | Fishball's fish / Fishball's own whale (not the official orca) | BRAND-EP-02, BRAND-EP-03 |
| Wordmark typography | bold (>= 700) and larger than the tag / the tag small | BRAND-EP-09 |
| Shell attributes | `title` = status text / absent; `aria-keyshortcuts` removed while mounted / restored | BRAND-ST-09, BRAND-TEAR-01/02 |
| ask-card state | `open` (pending) / `answered`, `closed`, `voided` (not pending) | BRAND-EP-07, BRAND-BVA-01 |
| streams | asks live / asks stale (CONNECTING) / asks closed / strip live / strip stale / strip closed | BRAND-ST-01, BRAND-ST-02 |
| core | strip `on:true` / `on:false` | BRAND-ST-03 |
| manager id | a session id / absent / empty | BRAND-ST-04, BRAND-ST-05 |
| sessions list | running true / running false / no entry | BRAND-ST-06 |
| shell control | wide brand button / collapsed rail toggle | BRAND-EP-01, BRAND-EP-06 |
| activation | mouse click / Enter / Space × manager known / no manager; manager known but not listed; manager already shown with a panel open; a held Space (repeat) | BRAND-DT-03…06 |
| UI language | en / zh (`session.new.label` differs; the brand name does not) | BRAND-ST-08, BRAND-NS-01 |
| brand slot anchor | mark-only / name-only / neither | BRAND-NS-02 |
| stored setting | absent / fishball / deepseek / unknown / non-string | BRAND-SET-EP-02, BRAND-STATUS-EP-02 |
| status-dot word | done / ongoing / warning / error | BRAND-DT-01 |
| teardown | brand part unmounted / page root removed | BRAND-TEAR-01, BRAND-TEAR-02 |

## Boundary values

| Boundary | Values | Expected |
| --- | --- | --- |
| Badge count | 0 | no badge; status Connected; state idle |
| | 1 | badge "1"; Waiting for you (1); attention |
| | 99 | badge "99"; Waiting for you (99); attention |
| | 100 | badge "99+"; Waiting for you (99+); attention |
| Brand icon | 24px | the mark's svg is 24×24 in the wide row and the rail (BRAND-EP-01, BRAND-EP-06) |
| Label overwrites | 0, 1, 2, 3 rerenders | label stays Fishball each time; no observer loop (BRAND-ST-08) |
| Priority | -1 against the shell's 0 | fishball-ui's two slots are -1 (BRAND-EP-04) |
| Empty manager id | `''` | no manager → Offline (BRAND-ST-05; see "Ambiguities") |

## Decision tables

### BRAND-DT-01: state × theme

Conditions: asks stream live, strip frame `on`, manager id, sessions running, open cards. Rows are
run for both themes; the theme only changes the art, never the state.

| # | asks live | strip on | manager | running | open cards | State | Text | Light |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | yes | true | known | false | 0 | `idle` | Connected | done |
| 2 | yes | true | known | true | 0 | `working` | Working | ongoing |
| 3 | yes | true | known | false | 1+ | `attention` | Waiting for you (n) | warning |
| 4 | no | any | any | any | any | `offline` | Offline | error |
| 5 | yes | false | known | any | any | `offline` | Offline | error |
| 6 | yes | true | absent | any | any | `offline` | Offline | error |

The strip stream's health alone does not decide: a stale/closed strip with a live asks stream stays
in the row its other facts give (BRAND-ST-01). The accessible name is always exactly "Fishball"; the
description is exactly the status text.

### BRAND-DT-02: `brandStyle` in the strip frame

| Frame value | Theme |
| --- | --- |
| `fishball` | fish |
| `deepseek` | whale |
| any other string / `''` / `null` / a number | fish (default) |
| absent | fish (default) |

### BRAND-DT-03: activation

| Control | Manager known | Mouse | Enter | Space | Result |
| --- | --- | --- | --- | --- | --- |
| wide brand button | yes | click | keydown | keydown | `openSession(managerId)` once; shell New Session never runs; native activation prevented |
| wide brand button | no | click | keydown | keydown | nothing (no openSession, no new session) |
| rail toggle button | any | click | — | — | the shell's toggle runs; no openSession |

### BRAND-DT-04: manager known but not yet listed

| First `openSession` | Sessions list later carries the id | Expected |
| --- | --- | --- |
| rejects `unknown session` | yes | the click is consumed; no session/POST; exactly one retry, which succeeds |
| resolves | n/a | one attempt, no retry |

### BRAND-DT-05: activation when the manager is already shown

| Control | `uiSession` current | Panel open | Expected |
| --- | --- | --- | --- |
| click / Space | the manager | yes | `layout.selectPanel(null)`; no `openSession` |
| click / Space | another key or none | any | `openSession(managerId)` |

### BRAND-DT-06: keyboard repeat

| Key event | Expected |
| --- | --- |
| Space `repeat:false` | one `openSession` |
| Space `repeat:true` (held) | prevented and consumed; no second `openSession` |
| Enter `repeat:false` | one `openSession` |
| Space `repeat:false` after resetting the current key | one `openSession` |


## State transitions

| Row | From | Event | To |
| --- | --- | --- | --- |
| BRAND-ST-01 | connected | asks error with CONNECTING | offline |
| | offline | valid asks frame | connected |
| | connected | strip error (CONNECTING or CLOSED) | connected (strip health is presentation, not the link) |
| BRAND-ST-02 | connected | asks error with CLOSED | offline (error light) |
| | offline | valid asks frame | connected |
| BRAND-ST-03 | connected | strip `on:false` | offline |
| | offline | strip `on:true` | connected |
| BRAND-ST-04 | connected | asks frame without a manager id | offline; a frame with the id → connected |
| BRAND-ST-05 | connected | asks frame with an empty-string manager id | offline (reported ambiguity) |
| BRAND-ST-06 | idle | sessions running true | working |
| | working | sessions running false | idle |
| BRAND-ST-07 | fishball | strip frame brandStyle deepseek | deepseek art (same streams) |
| | deepseek | strip frame brandStyle fishball | fish art |
| BRAND-ST-08 | mounted | shell overwrites the label with its New Session word | label Fishball (the scoped MutationObserver restores it) |
| BRAND-ST-09 | mounted | status changes | the shell button's title is the new status text; aria-keyshortcuts stays removed |
| BRAND-TEAR-01 | mounted | brand part unmounted | slots unregistered, streams closed, styles removed, previous label/description/title restored (title null removed), aria-keyshortcuts restored, observer disconnected |
| BRAND-TEAR-02 | mounted | page root mark removed | slots unregistered, streams closed, previous label/description/title restored, aria-keyshortcuts restored, observer disconnected |
| BRAND-NS-01 | before logo | shell rerenders / logo mounts / shell replaces controls | wide button hidden before ownership / visible when owned / hidden on replacement until owned again; actual New Session stays hidden |

## Ambiguities

1. The requirement says "no manager id" for Offline but does not say whether an empty string counts
   as "no manager id". The rows assert that it does (no valid manager); the implementation agrees.
2. The status text's exact wording is only exemplified ("Connected", "Working", "Offline",
   "Waiting for you (2)"); the rows use those words, with the count appended for attention. The
   `data-fishball-logo-state` words are not given; the rows use `idle`, `working`, `attention`,
   `offline` (the wording the requirement uses for the four states).
3. The motion rows read the computed animation in Chromium; they assert a running animation without
   a reduced-motion preference and none with `(prefers-reduced-motion: reduce)`, not a class name.
4. "The eye is magenta" is asserted as a magenta-family paint; the drawing uses a pink-magenta
   (`#EC0A6E`), not the pure `#ff00ff` word.

## BRAND-AVATAR — Fishball's reply avatar on its page (GENTLE-TOOLS, the lead's relayed requirement A, 2026-11-21)

fishball-page styles each Fishball reply row (`[data-slot="main.conversation"] [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]`
under `<html data-fishball-page>`): its `::before` draws an avatar as a CSS mask (a `data:` SVG URL). The
theme is core's `brandStyle` in `configForms.get('fishball-core')` (`.value.brandStyle`, followed by
`subscribe()`): `deepseek`, or `fishball` for anything else (absent, unknown, other case, non-string). The
page exposes it as `<html data-fishball-page-brand="fishball|deepseek">` while mounted (removed on teardown).
Review fix (the user, 2026-11-21): renamed from `data-fishball-brand`, which core's settings section uses as
its own hook; `<html>` never carries `data-fishball-brand` and the page never touches an element that does.

- **Fishball:** the mask is the fish body (tag v0.1.0 `assets/icon.svg`, viewBox `0 0 24 24`) painted in
  `var(--dsw-alias-label-primary)`, with a `background-image` SVG holding the eye path filled `#EC0A6E`.
- **DeepSeek:** exactly as before: background `var(--dsw-alias-state-business-primary)`, the primitives'
  `FISH_LOGO_PATH` as the mask, no `background-image`.
- The name label `::after` ("Fishball") and the row box do not change; rows that are not Fishball replies
  in `main.conversation` get nothing.

Level: fishball-page's real client in navPage (package/nav-page.mjs, now with a `primitives` option for
`FISH_LOGO_PATH` / `FISH_LOGO_VIEWBOX`, fixture values, and `unmount()`), a ConfigForm stand-in
(avatar.mjs). The drawing is the page's own style rules computed in headless Chromium (motion.mjs
`evaluateHtml`), with the two DSH tokens given distinct colours. Cases: `avatar-cases.mjs`.

| Id | Technique | Checks |
| --- | --- | --- |
| AVATAR-EP-01 ×11 | EP | absent, fishball, deepseek, DeepSeek, unknown, empty, null, number, boolean, object, no value yet → the `data-fishball-page-brand` word |
| AVATAR-EP-04 ×2 | EP | a settings-section-like `[data-fishball-brand]` element in the same document, stored fishball / deepseek, a live change and teardown: `<html>` never carries or is written `data-fishball-brand`; the section's hook value is unchanged and never written |
| AVATAR-EP-02 ×5 (browser) | EP | absent / fishball / other case / non-string → fish body mask, label colour, #EC0A6E eye layer; deepseek → FISH_LOGO_PATH mask, business colour, no background-image |
| AVATAR-EP-03 unchanged (browser) | EP | ::after "Fishball", its box and the row box the same in both themes; other rows get no mask and no label |
| AVATAR-EP-05 expanded reply plain (browser) | EP (MSG-USER re-baseline) | the avatar rows now draw on `[data-chat-flow-kind="fishball-message"]` (row > conversation.chat.node > div[data-fishball-message]); an expanded `assistant-step` / `response` reply has no mask, no label and the same content box as an unstyled reply; the message row has a bubble |
| AVATAR-ST-01 ×3 | ST | a form notification fishball ⇄ deepseek flips the attribute live, both directions, no slot re-registration; deepseek → unknown reads fishball |
| AVATAR-ST-02 ×2 (browser) | ST | the drawn avatar follows the live change and back |
| AVATAR-ST-03 teardown | ST | unmounting removes the attribute and the form subscription; a later change writes nothing |
