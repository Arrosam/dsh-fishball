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
dsh-instance.

The `.d.ts` files need `@deepseek-ai/cordis` (a DSH peer) for the `Context` members.
Services are looked up at runtime (`ctx.get`); a trailing `?` in
`inject` is not optional injection in Cordis.

| Contract | Declared in | Built by |
| --- | --- | --- |
| `fishballInstance.events.intercept` with `ctl.accept()`, `ctl.commit(send)`, `ctl.release` | [events.d.ts](<events.d.ts>) | F-INTERCEPT |
| The ask card's fields | [ask-card.d.ts](<ask-card.d.ts>) | F-ASKCARD |
| Guard list, policy, manager tools and the `guards-overridden` report | [guards.d.ts](<guards.d.ts>) | F-GUARDS |
| The runtime values of the above (and core's link backoff) | [constants.js](<constants.js>) | the constants migration (2026-11-14) |
| K3a: the link status and the hosted import's published names | [link.d.ts](<link.d.ts>) | F-LINK-SAVE (core), I-HOST (instance, its own copy of the names) |
| K3a: Connect and the Fishball-side OAuth client | [connect.d.ts](<connect.d.ts>) | `src/link/oauth-client.js`, F-LINK-SAVE |
| K3a: the fishball-ui seam `fishballInstance.ui` | [ui.d.ts](<ui.d.ts>) | F-UI, F-WIRE |
| K3a: core's own copy of the connector's MCP surface (`MCP`), which replaced `vendor/` | [constants.js](<constants.js>) | F-OWN-SCHEMA (done) |

## Values (`constants.js`)

`DECIDED Dn` / `#n` is a row of [the decisions table](<../../connector/mcp-schema/README.md#user-decisions>).
The target states and codes and the `disconnected` answer were K1's (DECIDED D7); since K3a
(requirements 1.39) core holds its own copy in `LINK`, and the connector keeps `TARGET_STATE`,
`TARGET_CODE` and `LINK_REFUSAL` for the DSH side. Since F-OWN-SCHEMA, core's code reads only these copies:
`vendor/` and its generator are gone, and `src/link/schema.js` derives the id, name, event-type and
issuer rules from `MCP`.

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

## K3a (requirements 1.39–1.41)

The two sides share no package, so this gate freezes what core needs from the DSH side as DSH
state under published names and as core's own copy of the MCP surface. K3a's earlier
`importToken` / `hasCredential` and every Watchdog seam are withdrawn (1.37, 1.39).

- **Hosted import** (`HOSTED_IMPORT`, `link.d.ts`): the instance's child-side row writes the token
  to the credential reference `DSH_AGENT_TOKEN` and the target URL to the child setting
  `dsh-instance-child.targetUrl`. DSH's reference grammar (`^[A-Za-z_][A-Za-z0-9_]*$`, both SDKs)
  refuses the user's `dsh-agent-token`, and core's guard disables the row `dsh-instance`, so both
  are spelled as the user chose on 2026-11-16. Core saves the accepted token in the record
  `fishball-core/hosted-agent` and unsets the reference; "the child holds a credential" is
  `describe(ref).configured || describeRecord(key).configured`, answered by DSH alone.
- **Reader order, as amended by Q-LS1 = A (the user, 2026-11-16).** `link.d.ts` still reads "1. a
  saved copy for the target origin wins". The user chose otherwise: a new value in the reference is
  tried **before** the saved copy and replaces it only once the target accepts it; a refused new
  value is not sent again until the reference changes or core restarts, and core goes back to the
  saved copy. The code follows Q-LS1 (`src/link/credentials.js`: "1. a value in the reference,
  unless the target refused that same value while a saved credential exists … 2. the saved token
  copy for the origin; 3. the saved Connect grant"). The `link.d.ts` comment is code and is fixed
  outside the DOCS task; design §5.4 records the rule.
- **Connect** (`CONNECT`, `connect.d.ts`): the S7c token manager's states and `begin` outcomes,
  `connect.clientMetadataUrl` (required, no default), the `needs-configuration` codes (PROPOSED),
  the loopback `/callback` and the web callback path (PROPOSED). Core passes `identity.id` as
  `agent_id`.
- **MCP surface** (`MCP`, `LINK`): core's own values; `test/v3/contract/k3a-core-seams/` and `test/v3/contract/own-schema/` compare `MCP` with the
  connector's published `tools/list` and OAuth metadata, so a K1 change shows as a failing row.
  F-OWN-SCHEMA repointed core's code to these values and deleted `vendor/` and its generator.
- **fishball-ui** (`UI_SEAM`, in `fishball-shared/ui-seam` since F-UI; `ui.d.ts`): fishball-ui reads
  `fishballInstance.ui` with `ctx.get` and draws through core's routes; without core (decided in
  its patch from the started bundles) it logs `fishball-core-missing` and changes nothing; core
  reports nothing when fishball-ui is absent.

## F-WIRE amendment (K3/K3a, 2026-11-16)

Additions only; no frozen name or value changes meaning:
- **`FISHBALL_MODEL`** (`constants.js`, new): Fishball's own model is core's setting
  `fishball-core.model` = `{provider, model, reasoningEffort?}`; absent, unroutable or unreadable
  means this DSH's default model, and nothing blocks on it (the user: "同步只是同步model list，至于
  fishball用什么还要在fishball内设置"; "所有版本：先用DSH的默认模型"). Only core's settings page and
  fishball-ui's model dialog write it; no DSH-side package reads it.
- **`GUARDS.coreTools`**: the V2 session-tools table is gone with the slim child; the tables are now
  `../manager/reminders.js` `TOOL`, `../manager/skills.js` `PRIVATE_SKILL_TOOL` and
  `../asks/constants.js` `ASK_TOOL`. R-FB-13 also leaves out every tool an X2 contribution holds in
  the manager's scope (the bridge façade's connector tools, the board's): X2 is the one way into
  that scope, so they are Fishball's own, not the preset's. Core reads them through a module symbol
  on `fishballInstance` (`src/manager/contributed.js`), which is not a member of this contract.
- **`ui.connect.begin()`** stays K3a's: no argument, the loopback callback. Core's own Connect route
  picks the web callback (Q-A3 B, `CONNECT.callback.webPath`) through a module-symbol member of the
  same object that no other plugin holds, so no plugin can choose a redirect URI.
- **`ui.guards.report()`** is `null` while core's guard row is absent or not ready yet (its row is
  separate from the main row and may start later).
- **`fishballInstance`** is provided by core's main row `fishball-core` (`src/main/`), beside
  `fishballStatus` (F-STATUS), in a standalone DSH and a hosted child alike.

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

## Settings sections (withdrawn)

`fishballSettingsSections` and `settings-sections.d.ts` are withdrawn by F-SETTINGS (requirements
1.34 item 4: "hosted setting去掉，fishball的setting留在fishball里的fishball core插件的设置页内";
R-HOST-11 withdrawn). Core's settings are its own plugin settings page (`client.settings.js`), the
same in standalone and hosted mode, and no plugin injects a section into it.

**F-SETTINGS decisions (2026-11-16):**
- **Slot: `plugins.bundle.config`, keyed by the bundle name `fishball-core`**, not
  `plugins.row.config` as the plan row said. Both SDKs' `pluginNavigation` offers only
  `openBundle(packageName)` and `openList()`, and `openBundle` lands on the bundle page, where
  `plugins.bundle.config` is drawn at once; a row page needs one more "configure" press. So the
  "Fishball settings" entry ("直接跳转到fishball core的设置") reaches the page in one step. The page
  edits the namespace of core's row (`src/settings/constants.js` `SETTINGS.namespace`), a separate
  fact spelled the same as the bundle.
- **Target precedence (Fishball's decision):** in a hosted child core links to the instance's
  `dsh-instance-child.targetUrl` (`HOSTED_IMPORT.targetSetting`); the user's `target.url` applies
  only when the instance supplies none (absent, not a string, or blank), as in standalone.
  `src/settings/target.js` `effectiveTarget` is the rule; F-WIRE feeds its result to the link.

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
