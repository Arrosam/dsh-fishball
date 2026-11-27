# C-TOKENS-REVEAL — use cases and derived test cases

Sources: design §5.1–§5.3, §5.6, §5.7, §5.9 (read with §1.0c: `dsht_`, `dsh-connector`,
`dsh_connector_tokens`, `routing.agentToken`); requirements 1.27–1.29, R-ARCH-03, R-ARCH-04,
R-CON-10, R-TOK-03, R-TOK-04, R-TOK-06, R-TOK-08, R-TOK-09, R-TOK-11, R-OA-03, R-OA-06; K1d
(`mcp-schema/index.d.ts`, `constants.js`), K3 `host-services/tokens.d.ts`; the surface the dev
session relayed (2026-11-16). The user's words: "不允许改token值，一旦生成确定了连看都不能看，只有生成的时候弹出modal显示token并允许复制".

Registry rows live in `packages/dsh-connector/tests/tokens/` (suite `dsh-connector.tokens`); route, route
registration and page rows in `packages/dsh-connector/tests/settings-page/` (suite
`dsh-connector.settings-page`). Both run on the current DSH day to day and on every DSH of the
release matrix before a release (`npm test --workspace dsh-agent-connector`; `npm run test:release`).

## Use cases

### AUTH-UC-01 (rewritten) — The owner creates a token for an external agent and it is revealed once
- **Actor:** the DSH owner. **Pre:** the connector runs; its settings page is open in Plugins.
- **Main:** 1. The owner types a label and presses **New token**. 2. The page POSTs `{label}` to the
  connector's owner-only create route. 3. The registry generates `dsht_` + 32 random bytes
  (base64url), writes the entry's digest record **first**, then adds `{label, enabled: true, key}`
  through the SettingsWriter. 4. It returns `{entryKey, label, value}` once; the route answers
  `{ok: true, entryKey, label, value}`, JSON, `Cache-Control: no-store`. 5. The page shows the
  value in a modal with Copy and Close. 6. The list shows the entry, without a value.
- **A1:** the label has surrounding spaces → it is trimmed.
- **E1:** blank or non-string label → registry: `TypeError`; route: 400 `bad-body`; nothing created.
- **E2:** the record write or the settings save fails → `operation-failed` (route 500); the record is
  removed again; no item, no value.
- **E3:** the answer is lost after step 3 → the entry exists, nothing can show its value again; the
  owner deletes it and creates another (R4).
- **Post:** only the SHA-256 digest is stored; the host credential store receives no write; no log,
  file, registry answer, settings document or SettingsWriter call holds the value; the entry is
  `status: ok`, `hosted: false`; `match(value)` finds it and nothing else does.

### AUTH-UC-15 (new) — Create a token and copy it once
- **Main:** New token → modal with the value → **Copy** writes exactly the value to the clipboard →
  **Close** → the value is gone from the page; reopening the page shows the entry, never the value.
- **A1:** Close without Copy (works at any time, Q-D3 B) → the value is gone; replace by delete + New token.
- **E1:** the create is refused → no modal; the page shows the refusal code; nothing is created.

## Derived cases

### AUTH-EP-04 — token value classes (rows 1 and 8 reworded; 2–7a withdrawn)
| # | Class | Expected |
| --- | --- | --- |
| 1 | New token (page `create`), and the hosted create | `dsht_` + 43 base64url = 32 bytes (≥ 256 bits); only the hex SHA-256 digest is in the record; no host credential write |
| 8 | ten created values | all distinct; each matches its own entry; none in settings, logs, records, answers |
| — | values that are not a live entry's (random `dsht_` value, the value ± one character, its body, empty, the digest itself, the entry key) | `match` → undefined |

### AUTH-BVA (label and route body)
- label: `''`, `'   '`, `'\t\n'` → refused; `'A'` (1 char) → accepted; padded → trimmed.
- create body: 4096 bytes → accepted; 4097 bytes → `bad-body`; 4096 bytes made of multi-byte
  characters → accepted (bytes, not characters); 4097 bytes with ≤ 4096 characters → `bad-body`.

### AUTH-DT-05 — what a delete or a switch does to the stored digest (rows 1–2 and 5; 3–4 withdrawn)
| Rule | Entry | Action | Afterwards |
| --- | --- | --- | --- |
| 1 | page-made or hosted | delete | record dropped; one `deleted` revocation; nothing unset anywhere on the host (the hosted value stays dead in the child: I-HOST) |
| 2 | page-made or hosted | disable | record kept; one `disabled` revocation; value refused |
| 5 | disabled, then enabled | enable | the same entry and the same value authenticate again; no revocation; the generation does not go back |

### AUTH-DT-13 (new) — what a save of the tokens list does
Conditions: sync reason (user save / start / restore echo); what the list changes; whether the
problem already existed.

| Rule | Sync | List | Expected |
| --- | --- | --- | --- |
| 1 | save | a label edited | accepted; label updated; no revocation; generation kept |
| 2 | save | a switch off / on | accepted; `disabled` revocation / nothing |
| 3 | save | an item removed | accepted; `deleted` revocation; record dropped |
| 4 | save | items reordered | accepted; nothing else changes |
| 5 | save | two items with one `key` (new problem) | refused `token-duplicate`, labels grouped; nothing changes; previous list to `restoreTokens`; notice = those labels |
| 6 | save | an item whose record has another entry's digest (new problem) | refused `token-duplicate`; as rule 5 |
| 7 | save | an item with no record (added by hand; new problem) | refused `token-duplicate`; as rule 5 |
| 8 | echo | the list `restoreTokens` wrote | accepted; not refused again; the notice stays until the next accepted save |
| 9 | start | two items with one key / two records with one digest / an item with no record | not refused; listed; `enabled: false`; never matches; notice shown; no revocation; generation kept |
| 10 | save | keeps a problem found at start, edits something else | accepted; the problem stays; notice stays |
| 11 | save | removes the copy that made a start problem | accepted; the other entry serves again; notice cleared |
| 12 | `findDuplicates` | lists of 0, 1, 2 distinct, 2 same key, 3 same key, two pairs | `[]`, `[]`, `[]`, one group of 2, one group of 3, two groups |

### AUTH-ST-01 — token entry lifecycle (Unconfigured removed; row 10 and 10a–10m withdrawn)
States: **none**, **Ready** (enabled), **Off** (disabled), **Gone**. Bound(X) / Off-Bound(X) differ
only in C-PAIR's store, so the registry's transitions are Ready's and Off's.

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | none | New token | Ready | value returned once; matches; generation g |
| 5/7 | Ready | disable | Off | one `disabled`, generation > g; refused |
| 6/8 | Off | enable | Ready | same entry; matches; no revocation |
| 9 | Ready | delete | Gone | one `deleted`, record dropped, unknown |
| 12 | Gone | any request, save again, the old key re-added by hand | Gone | no match, no second revocation; re-adding is refused (no record) |
| r1 | Ready / Off | connector restart | Ready / Off | the value still matches / still refused; generation kept |
| r2 | Gone | New token | Ready (new) | a new entry key and value (R4: a new principal) |
| r3 | any | read or change the value | — (invalid) | no registry member shows, returns or changes a value |
| r4 | store of a W2 build (version 1) | start | none | its records authenticate nothing |

### AUTH-ST-08 (new) — the reveal modal
| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | Closed | New token, created | Open | the value element holds exactly the value |
| 2 | Open | Copy | Open (copied) | `navigator.clipboard.writeText(value)` once |
| 3 | Open / Open (copied) | Close | Closed | no value anywhere in the page tree |
| 4 | Closed | the page re-renders or is opened again | Closed | the entry is listed by key, no value; nothing reopens the modal |
| 5 | Closed | New token, refused | Closed | no modal; the refusal code shown |

### AUTH-ST-01 / AUTH-UC-01 route and page rows
- PLAT-EP-03 row 1 (reworded): the connector's one browser module registers only
  `plugins.row.config` key `dsh-connector#dsh-connector`, requires only `react` and the
  primitives, adds no sidebar, other slot, style element or stylesheet, and registers only its own
  two JSON routes (create, notice).
- HAND-EP-01 row 3 (reworded): a browser fetch reaches only those two routes; neither serves
  hand-over, HTML or a value outside the create answer.

## Withdrawn (design §5.9) — deleted from the suites, IDs kept in the docs
AUTH-UC-01 A1, A2, E1, E2, E3 (old); AUTH-EP-04 rows 2–7, 7a; AUTH-BVA-03 rows 1–7; AUTH-DT-05
rows 3, 4; AUTH-ST-01 row 10 and 10a–10m.

### UI-POLISH-D — the settings page's layout (../settings-page/polish-cases.mjs)

From the UI-POLISH-D requirements relayed 2026-11-18 (and the developer's note: a setting row's
error spans sit outside its `<label>`). Behaviour, routes, keys, hooks and roles are unchanged.

| Id | Technique | Rows |
|---|---|---|
| UIPD-SET-SECTIONS | EP (language) | en "Tokens", "Approval page", "Safety limits" / zh "Token", "授权页面", "安全限制": three `h3` sections in order; the token parts in the first, `approval.port` and `approval.dshName` in the second, the five limits in the third |
| UIPD-SET-COUNT | BVA (list length) | 0 → no count beside Tokens; 1 → "1"; 3 → "3" |
| UIPD-SET-BUTTONS | EP (language), BVA (row index), ST | each row's Move up / Move down / Delete (上移 / 下移 / 删除) are icon-only, named by aria-label and title; single item: up and down disabled; first of 3: up disabled; middle: both enabled; last: down disabled; Delete always enabled; Move down on row 1 stages B, A, C, saves nothing |
| UIPD-SET-DOTS | EP (pair state, listener status) | paired + connected → StateDot `done`; paired + offline → `idle`; unpaired → no dot; approval ok → a `role=status` line, StateDot, "Approval page: listening on port N"; port in use → a different dot; the status sits beside the port's `<label>`, not in it |
| UIPD-SET-PRIMITIVES | UC / EP | text fields are DSH's Input (hooks on it); New token has a plus icon; Copy keeps its word, its icon turns to a check after a copy, "Copied"; the duplicate notice keeps `role=alert` with a warning icon first; a limit field's error (`role=alert`, invalid only) sits outside its `<label data-dsh-connector-setting>` |

### R-FIX-CUI — scalar drafts, runtime state, number fields (../settings-page/cui-cases.mjs)

From the requirements relayed for R-FIX-CUI (2026-11-18; `.runtime/reports/review-x-dsh-connector-ui.md`
UI-03, UI-04, UI-05) and the dev session's answers of that day (the conflict alert's words, `request-failed`,
Retry, the 1000 ms poll that skips while a read is pending and pauses while hidden). The page's host form
holds the row's other settings and refuses a mutate whose expected revision is stale, as DSH fences it.

| Id | Technique | Rows |
|---|---|---|
| RFC-UI03 | DT (same field changed × blur / Enter), ST | DSH name, approval port, a limit: a draft, then another editor saves the same field → blur / Enter sends nothing, the draft stays, a role=alert says "changed elsewhere"; a second blur / Enter saves the draft with the live revision, the alert goes; Escape discards it and shows the live value; Escape with no conflict discards; another field changed (revision bumps) → the draft saves with the live revision, both changes kept |
| RFC-UI04 | ST, EP | the state refreshes with no config change (unpaired / port in use → paired / ok within 3 s); re-read while mounted, none after unmount; none while hidden, again once visible; first read pending → no pair line, no "Not paired"; a failed read (500 `{ok:false, operation-failed}`, fetch rejects, body not JSON) → no pair line, one alert "The connector's status could not be read (<code>)." with Retry; Retry re-reads and the alert goes; a held older read answering after a newer one (Retry / revision re-read) does not overwrite it |
| RFC-UI05 | BVA, EP | approval.port: "" / "   " / "\t\n" / "-1" / "65536" / "abc" → "Enter a whole number.", aria-invalid, blur sends nothing, the field reverts; "0", "65535" save; a limit: "" / "  " refused, "1" saves; Enter on a cleared port sends nothing |

### R-FIX-CUI — the DSH name field, multi-DSH naming (../settings-page/cui-cases.mjs)

From the user's multi-DSH naming decision relayed 2026-11-18 ("照 MCP 协议来": the name is saved exactly
as typed; only an entirely blank value unsets).

| Id | Technique | Rows |
|---|---|---|
| RFC-DSHNAME hint | EP (language) | en "The name the approval page shows for this DSH. Empty: this DSH shows as <device name>-DSH." / zh "授权页面为此 DSH 显示的名称。留空则此 DSH 显示为 <设备名称>-DSH。" in the row; the old address wording nowhere |
| RFC-DSHNAME save | DT (saved × typed), EP, BVA | "  Office DSH  " → `set` verbatim (saved or not; blur and Enter); "Lab/α <b>x</b>" → `set` verbatim, shown as text (no `<b>` element); "Office" with none saved → `set`; equal to saved → nothing; saved + one trailing space → `set`; a padded saved name typed the same → nothing, typed trimmed → `set`; '' / "   " / "\t" → `unset` with a saved name, nothing without one |
| RFC-DSHNAME R1B slow save / lost reply (en, zh) | DT (persisted × reply), EP (language) | Enter + blur sends one write. The field shows the persisted name. An intact reply leaves no alert. After a lost reply, the form learns the saved value from a recovery read, then shows one localized alert to check the current value and retry if needed, with no automatic retry. |
| RFC-DSHNAME R1B stale save | ST (refused → explicit retry → saved) | A stale write leaves the original value saved, the draft visible and the same unconfirmed-change alert. Only a second Enter retries, using the refreshed revision; the alert clears on success. |
