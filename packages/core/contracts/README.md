# `contracts`: the K3 freeze of fishball-core's services

Types plus one data-only `constants.js` (K3 amendment 2026-11-14): the `.d.ts` files declare the
contracts, and `constants.js` holds their runtime values, defined once there; core's code and the
tests import them from it. It holds frozen data and pure template formatters only: no import, no
other call, no behaviour. Sources:
[v3-design.md](<../../../docs/planning/v3-design.md>) §5a.2, §6.4; requirements 1.21, 1.24,
R-INT-01…09, R-HOST-11, R-FB-02/09/11/12/13; spikes V3-S2 `a499141`, V3-S3 `b4dca86`, V3-S6
`86800d2` and `7c2230e`. Changing a name here is a K3 amendment. Values marked PROPOSED in the
`.d.ts` files are **product choices**: frozen as they stand (decided 3 = A), and the user may still
change any of them. Nothing imports
dsh-instance, and the settings-section point names nothing about hosting.

The `.d.ts` files need `@deepseek-ai/cordis` (a DSH peer) for the `Context` members, and the DOM
library for `HTMLElement`. Services are looked up at runtime (`ctx.get`); a trailing `?` in
`inject` is not optional injection in Cordis.

| Contract | Declared in | Built by |
| --- | --- | --- |
| `fishballInstance.events.intercept` with `ctl.accept()`, `ctl.commit(send)`, `ctl.release` | [events.d.ts](<events.d.ts>) | F-INTERCEPT |
| `fishballSettingsSections` (the settings-section extension point) | [settings-sections.d.ts](<settings-sections.d.ts>) | R-CORE (done; frozen as created) |
| The ask card's fields | [ask-card.d.ts](<ask-card.d.ts>) | F-ASKCARD |
| Guard list, policy, manager tools and the `guards-overridden` report | [guards.d.ts](<guards.d.ts>) | F-GUARDS |
| The runtime values of the above (and core's link backoff) | [constants.js](<constants.js>) | the constants migration (2026-11-14) |

## Values (`constants.js`)

`DECIDED Dn` / `#n` is a row of [the decisions table](<../../connector/mcp-schema/README.md#user-decisions>).
The target states and codes and the `disconnected` answer are K1's (`TARGET_STATE`, `TARGET_CODE`,
`LINK_REFUSAL`, DECIDED D7), not this file's.

| Constant | Value | Status |
| --- | --- | --- |
| `INTERCEPT.defaultPriority` | 0 | DECIDED D3 |
| `INTERCEPT.fenced` | `fenced` (`CommitResult`) | K3 spelling |
| `LEDGER` | storage domain `fishball_core_events`, table `acceptance`, version 1; `finishedRetentionMs` 30 days | retention DECIDED D2 |
| `STATE`, `REASON`, `MESSAGE` | the ledger's record states, its log reasons, and the message id prefix `fbe_` | F-INTERCEPT's, per decisions 1.B, 3.A and 4.A (2026-11-14) |
| `PRESENT_RETRY` | 3 attempts; wait 1000 ms × 2^(n−1) after failed attempt n | DECIDED D1 |
| `TEXT.blockType` | `text` (the notice's content block) | DSH content-block type |
| `TEXT.presentGivenUp` | "Fishball notice: event <id> (<type>) could not be shown to you and was given up." | DECIDED D6 |
| `LINK_BACKOFF` | 1 s × 2^n, at most 60 s; a connected link resets n | DECIDED D4 |
| `GUARDS` | the report, codes, triggers, presets, manager tools and reorder outcomes as `guards.d.ts` spells them, plus F-GUARDS's service name, record location and texts | spellings as `guards.d.ts`; owner DECIDED D7 |

## Interception

- `intercept({pluginId, types, filter?, priority?}, onEvent) → dispose`. An invalid registration
  throws a `TypeError` and registers nothing (DECIDED #17, [the decisions table](<../../connector/mcp-schema/README.md#user-decisions>)). `priority` is any finite
  number, negative included, **default 0**. The winner is the highest priority, then the earliest
  registration. A throwing `filter` counts as no match.
- `ctl` has exactly `accept`, `commit` and `release`:
  - `accept()` resolves `true` (durable and open) or `false` (fenced);
  - `commit(send)` resolves to `send`'s result, or `{ok: false, code: 'fenced'}`, and never
    rejects. A send that rejects or answers `disconnected` falls back to Fishball once (PROPOSED);
  - `release(e, {toFishball: true})` resolves `true` or `false` (fenced).
- Core keeps the record open until the handler settles (S2-Q1 / Q-S3-2 B). Throw, reject, plugin
  down or dispose: an event offered, or accepted with no commit begun, goes to Fishball once. An
  event with a commit begun stays with the interceptor.
- After a restart an open record is offered again to the same `pluginId`, or else goes to Fishball
  once.
- An event an interceptor handles alone reaches only the background log (R-INT-09).

## Settings sections

These are the R-CORE point unchanged, with one rule added for `unmount`:
- `register({id, title, order, mount, unmount}) → dispose`, plus `reactSection(render)` and
  `classes`;
- a section is drawn by `order`, then by `id`;
- `mount(host)` gets an element the section draws into, and the contract names no UI library;
- `unmount(host)` is called when the panel closes and when the section is withdrawn (including the
  plugin's disposal): **at most once per mount**, and never for a mount that threw.

## Guards (vocabulary for F-GUARDS)

- **Guarded rows:** the ten session-creating rows and `dsh-instance`.
- **Shipped presets:** `preset-standard`, `preset-ptc`, `preset-cordis` and `preset-minimal` are
  switched off, not deleted. They are the same on both SDKs.
- **Offered preset:** `fishball`, the default and the only one.
- **Policy:** sandbox `read-only`; `ctx.approval.config.policy` = `ask`, read directly; permission
  presets `[read-only]`, default `read-only`.
- **Manager tools:** exactly `read`, `read_image` and `working_directory`, checked on resume
  instead of the preset name (R-FB-13).
- **Report (spelling PROPOSED):** `ok`, or `guards-overridden` with `row:<id>`, `policy:<key>`, `agent-presets`,
  `bundle-order` or `manager-tools`.
  - Checks run at app ready, `settings/document-updated` and `plugin-manager/changed`, never
    before app ready.
- **Reorder:** `moved`, `unchanged` or `failed` (PROPOSED), once per DSH. Core never moves itself
  back.
- **Leftover sessions** are archived (`workspaceController.archiveSession`). That is X-MIG's
  behaviour (PLAT-UC-05, R-MIG-01), with no type here.
