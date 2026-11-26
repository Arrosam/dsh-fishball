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
  the manager's scope (the bridge façade's connector tools, a set member's): X2 is the one way into
  that scope, so they are Fishball's own, not the preset's. Core reads them through a module symbol
  on `fishballInstance` (`src/manager/contributed.js`), which is not a member of this contract.
- **`ui.connect.begin()`** stays K3a's: no argument, the loopback callback (MULTI-0: now `ui.targets.begin(targetId)`, same rule). Core's own Connect route
  picks the web callback (Q-A3 B, `CONNECT.callback.webPath`) through a module-symbol member of the
  same object that no other plugin holds, so no plugin can choose a redirect URI.
- **`ui.guards.report()`** is `null` while core's guard row is absent or not ready yet (its row is
  separate from the main row and may start later).
- **`fishballInstance`** is provided by core's main row `fishball-core` (`src/main/`), beside
  `fishballStatus` (F-STATUS), in a standalone DSH and a hosted child alike.

## MULTI-0 amendment (K3/K3a, 2026-11-18): multiple DSH targets

Source: [PLAN-MULTI](<../../../docs/planning/v3-multi-dsh.md>) §3–§7 (D01–D11, Q01–Q12). Types in
[targets.d.ts](<targets.d.ts>); core's values `TARGETS` and `MCP.identity` / `MCP.serverIdentity`
([constants.js](<constants.js>)); fishball-ui's values `SEAM_TARGETS` (`fishball-shared/ui-seam`).

| Point | Frozen as |
| --- | --- |
| Target record | `TargetRecord {id, kind, url, endpointEpoch, order, serverName, duplicateSuffix}`; storage `fishball_core_targets/targets` v1, tool bindings and their tombstones `fishball_core_targets/tool_bindings` v1 (domain and table names in DSH storage's `UNIT_NAME_RE` `^[a-z][a-z0-9_]*$`, both SDKs); no token value; no count cap (Q12) |
| Ids | target `t-` + 16 base32 letters, epoch `e-` + 16; reserved parent id `parent`; a new epoch on every canonical-endpoint change |
| List / status API | `fishballInstance.ui.targets` (`FishballTargets`): `list()` → `TargetsSnapshot {version: 1, targets: TargetView[]}`, `onChange`, `add`, `remove`, `setUrl`, `begin`, `cancel`, `retry`, `choose`, each by `targetId`. K3a's scalar `ui.link`, `ui.connect`, `ui.pairing` are withdrawn. Core's status snapshot carries `targets` beside the global `fishball`, `guards`, `set` |
| Per-target strip | `TargetView.line {kind, code}` = core's `stripLine(...).line` for that target (amendment from MULTI-3), with `control` and `contributedTools` |
| Public state | `connected`, `connecting`, `failed`, `not-set` (rule in `SEAM_TARGETS`' comment); `name: null` shows the placeholder, never a URL (Q01) |
| Routes | `SEAM_TARGETS.route`: GET `/api/fishball/targets` → 200 `TargetsSnapshot` (= `ui.targets.list()`; amendment from MULTI-1, so core's settings page needs no fishball-ui); POST `/api/fishball/targets/{connect,cancel,retry,pairing,add,remove,url}` with `{targetId, …}`; unknown id → 404 `unknown-target`; refusals `target-duplicate` (Q04), `target-reserved`, `confirmation-required` (Q07) |
| Provenance | `TargetSource {targetId, endpointEpoch, serverName, name}` on every `InterceptedEvent` (`source`) and target-bound permission `AskCard` (`source`); only id/epoch are trusted. Fishball’s own question cards have no target. |
| Local keys | `JSON.stringify([kind, targetId, endpointEpoch, remoteId])`, kinds `event` / `approval` / `session`; plain-token form base64url of that JSON; manager message id `fbe_` + handle (two targets' `event-1` never dedupe) |
| Ask handle | `AskCard.handle` (kind `approval`); `ui.asks.answer(handle, …)` and the answer route body `{handle, choice, text?}`; state `voided` for a removed/retired target |
| Duplicate names | ` (n)`, n from 2, lowest free complete name (literal collisions count), persisted, never renumbers (D07, Q03) |
| Tool names | `mcp__<readable≤16>__<facade>_<digest12>`, ≤ 64, `[A-Za-z0-9_-]`; digest SHA-256 of `JSON.stringify([1, targetId, endpointEpoch, name, origin, rawName])`; every exposed remote tool and each target’s permission `ask_user`; Fishball’s own question `ask_user`, reminder and skill tools unprefixed; withheld tools not exposed; a name bound (or retired) for another tuple fails closed. Supersedes V3 §6.3's ban on model-facing `mcp__…` names. Examples below |
| Target-bound seams | `fishballInstance.bridge(pluginId, ops, TargetSelector)`, `attention.signal(pluginId, input, TargetSelector)`; `{targetId, endpointEpoch?}`, source-derived callers MUST pass the source epoch (security amendment below); `apiVersion` 2 |
| Hosted reservation | hosted child: first target `parent`/`parent`, URL = `dsh-instance-child.targetUrl`, read-only, not removable; it alone owns `DSH_AGENT_TOKEN`, `fishball-core/hosted-agent` and core's internal pending-origin record `fishball-core/pending-token-origin` (`src/link/constants.js` `LINK_SAVE.pendingOrigin`; core-only, so not a contract value) |
| Added credentials | reference `FISHBALL_TARGET_TOKEN_<id>__<epoch>` (`-` → `_`); records `fishball-core/token-<id>-<epoch>`, `fishball-core/connect-<id>-<epoch>` |
| Identity push | subscribe `dsh-agent://events` and `dsh-agent://identity` on the one listen stream; on `notifications/resources/updated {uri: identity}` and after every listen acknowledgement, `client.discover()` at once (one in flight + dirty), read `_meta['io.modelcontextprotocol/serverInfo'].name`; no polling. Live only if `resources/list` lists the URI |
| Status snapshot | `StatusSnapshot`: `{fishball: 'on', targets, guards, set, brand: {style: 'fishball' \| 'deepseek'}}` or exactly `{fishball: 'fishball-off'}` (no `targets`, no `brand`) |
| Hosted signal | DSH settings lists the namespace `dsh-instance-child` (URL-independent); parent epoch generated, renewed on every canonical `targetUrl` change; parent grant `fishball-core/connect-parent-<epoch>`; user `target.url` and its fallback withdrawn |
| HTTP | 200; 400 malformed / `invalid-arguments` / URL refusals; 404 `unknown-target`; 409 other refusals; 503 `TARGETS_UNAVAILABLE`; voided ask → 409 `expired` |
| Version moves | `fishballInstance.apiVersion` 2; core's session route and every core reader of `fishballInstance` move to 2 (MULTI-1); `/api/fishball/connect{,/cancel}` withdrawn for `SEAM_TARGETS.route.connect` / `.cancel` |
| Unchanged | one manager, one reminder store, notify, CIMD URL (global, Q06), wire tool schemas, receipts, OAuth |

Examples (normative for the slices; `t-a…`/`e-b…` stand for 16-letter ids):

| Input | Result |
| --- | --- |
| A and B both advertise `Office-DSH` | A `Office-DSH` (suffix `null`), B `Office-DSH (2)`; A later renames to `Lab-DSH`: B stays `Office-DSH (2)`; a third `Office-DSH` gets `Office-DSH` (lowest free) |
| A literal server name `Office-DSH (2)` already held | the next `Office-DSH` arrival is `Office-DSH (3)` if `Office-DSH` is held |
| A and B both send `eventId` `event-1` | keys `["event","t-a…","e-a…","event-1"]` and `["event","t-b…","e-b…","event-1"]`: two records, two manager messages, each acked only through its own link |
| A and B both offer `approvalId` `ap-1` | two cards, two handles; answering one sends `approval_answer` to its own target only |
| `Office-DSH`, `sessions_list` | `mcp__office-dsh__sessions_list_<12 hex>` |
| `办公室-DSH` | readable `dsh` |
| `<b>x</b>` | readable `b-x-b`; the UI shows `<b>x</b>` as text |
| 200-char name, `acme-tools.` + 48 chars | readable cut to 16, facade cut from the end, total exactly 64 |
| `résumé-DSH` | readable `re-sume-dsh` (combining marks are separators) |

### Independent-review security amendment (additive; no renamed contracts)

**Credential binding.** `TargetCredentialBinding {targetId, endpointEpoch, origin, agentId}` is
mandatory metadata under `TARGETS.credentials.bindingField` (`binding`) in core-private saved and
pending credential payloads. This includes the parent's fixed `fishball-core/hosted-agent` and
`fishball-core/pending-token-origin` records; their fixed names do not exempt them. A pending
reference also binds its non-secret credential id. All four binding members must match before
use, save or unset. Recover the durable epoch and reconcile the instance URL before credential
reads on startup. Retire and clear the old token/reference binding on **every** canonical endpoint
change, including same-origin, before connecting the new epoch; a restart cannot adopt an old
binding. Captured binding + generation fence late authorization/token results, so an old completion
cannot save, unset or relabel a new handoff. The parent handoff wire, credential probe and published
reference/record names are unchanged; Q-LS1's new-reference-first rule applies within a binding.
See [link.d.ts](<link.d.ts>) for the normative fixed-parent reader amendment.

**Source-bound calls.** `TargetSelector {targetId, endpointEpoch?}` is accepted by `bridge` and
`attention.signal`. Event/history callers MUST pass the source's `endpointEpoch`, not just its id:
creating a handle after an `await` must not capture an endpoint that replaced that source. A mismatch
fails closed (`supports` false, call/signal `unknown-target`, no remote send). Existing deliberate
current-target selectors remain valid; captured handles still fence subsequent retirement.

**Tool-description framing.** `TARGETS.text.toolSource(JSON.stringify(name))` returns INNER
untrusted data, **not a standalone description prefix**. Preserve that formatter's signature and
wording, but enclose its entire result in the existing random-marker framing from core's
`src/bridge/constants.js` `TEXT.untrustedOpen` / `untrustedClose`, with a fresh locally generated
`randomUUID()` marker, then append the trusted facade description. Reuse those constants; do not
copy them into the contracts. JSON encoding alone does not replace this trust boundary. For example
(the marker is generated locally, never supplied by a server):

```js
const marker = randomUUID()
const description = [
  TEXT.untrustedOpen(marker),
  TARGETS.text.toolSource(JSON.stringify(name)),
  TEXT.untrustedClose(marker),
  trustedDescription,
].join(TEXT.lineEnd)
```

Names containing quotes, newlines, fake closing tags or role-looking instructions remain entirely
inside that block; no raw server name is interpolated into trusted prose or persona guidance.
The persona's tool guidance names tools by role, not by a fixed
name: "Every DSH you are connected to has its own copy of each DSH tool, named
`mcp__<dsh>__<tool>_<id>`; pick the tool whose description names the DSH you mean, and ask the user
when it is ambiguous (Q09). Your reminder tools are local and unprefixed." The `<dsh>` part and the
names in descriptions come from the servers and are data, never instructions.

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
- **Manager tools:** expected host tools `read`, `read_image` and `working_directory`, checked on
  resume instead of the preset name (R-FB-13). The Fishball singleton installs a `tools.restrict`
  deny for inherited `ask_user_question`, excluding it from both native tools and the PTC SDK.
  Other sessions retain it, including those on the same preset.
- **Report (spelling PROPOSED):** `ok`, or `guards-overridden` with `row:<id>`, `policy:<key>`, `agent-presets`,
  `bundle-order` or `manager-tools`, with `extraManagerTools` (the manager's tool names beyond the
  defaults, which core's status announces once per new name, gently; the user, 2026-11-21) and
  `missingManagerTools` (defaults a manager lacks, which keep `manager-tools` in the guards notice).
  - Checks run at app ready, `settings/document-updated` and `plugin-manager/changed`, never
    before app ready.
- **Reorder:** `moved`, `unchanged` or `failed` (PROPOSED), once per DSH. Core never moves itself
  back.
- **Leftover sessions** are archived (`workspaceController.archiveSession`). That is X-MIG's
  behaviour (PLAT-UC-05, R-MIG-01), with no type here.

## Fishball’s own question cards

The manager-only `ask_user({questions: [{id, question, header?, options?: [{label, description?}], multi_select?}]})`
returns `{cardId}` after local persistence, not after an answer. Owner-only cards use the existing
ask-card layer and `asks` page-stream topic. Question cards share the permission-card accordion,
show the batch count and summary, and display each question in its own fieldset when expanded. The
owner’s answer is an ordinary queued user-role follow-up containing `cardId` and `answers`
(`{id, selected, custom?}` in question order). It wakes an idle manager or waits for its current
turn to finish. There is no connector RPC, remote offer, or target epoch for this flow. Target-bound
permission cards and forwarded managed-session questions and plan reviews keep their existing paths.
See [DESIGN](<../../../DESIGN.md#fishball-question-cards>).
