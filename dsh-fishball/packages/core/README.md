# fishball-core

The backend of the Fishball plugin set (`fishball-core`, `fishball-ui`), on the Fishball side. It turns a
DSH into Fishball: one long-lived manager session that reaches each DSH it manages only through that DSH's
`dsh-connector` MCP endpoint, as any agent does. It imports nothing from the DSH-side packages; its copy of
the connector's public MCP surface is its own (`contracts/constants.js`, `MCP` and `LINK`), checked
against the connector's published contract by its contract tests.

Version `1.0.0-alpha.1`. Requires DSH `>=0.2.1-rc.5`. In hosted mode `dsh-instance` (the
dsh-fishball-instance repository) places it in Fishball's child, last, so its guard patch reaches every
row; in a standalone DSH you install it yourself, last (see the [root README](<../../README.md>)).
[fishball-ui](<ui/README.md>) is its own package in `./ui/`, shipped inside this package's tarball.

## What it does

### Rows (`cordis.patch.yml`)

- `fishball-core` (`fishball-core/main`, `src/main/`): the target list (`src/targets/`: one link,
  Connect, pairing, bridge façade and running-sessions list per DSH target), the interception service,
  the ask cards, status, the Fishball page's one live connection (`/api/fishball/page/events`, DESIGN
  §34), and the one manager session with its persona, reminders (`schedule_*`), `message_user` (its one
  way to speak to the user on the Fishball page, §32), `ask_user` (question cards) and private Skills. It provides `fishballInstance`
  (apiVersion 2) and `fishballStatus`.
- `fishball-core-session` (`src/session/route.js`): `GET|POST /api/fishball/session`, the manager
  session the Fishball page opens.
- `fishball-core-guards` (`src/guards/`): the guard check, the `guards-overridden` report and, in a
  standalone DSH, the self-reorder to the end of `dsh.profile.bundles`.
- `preset-fishball`: core's agent preset. It includes `read`, `read_image` and DSH's
  `ask_user_question`. Only the Fishball singleton denies the inherited question tool with
  `tools.restrict`: it is absent from both native tools and the PTC SDK. Other sessions, including
  those using `preset-fishball`, retain it. It uses DSH's `compaction-basic` with `auto: false`,
  so only an explicit `compactNow` (fishball-heartbeat's, DESIGN §30) compacts.
- Guard rows: the session-creating service rows (`schedule`, `open-in-app`, `terminal-controller`),
  `dsh-instance` (no nested hosted Fishball), every DSH-shipped agent preset (switched off, never
  deleted), and the read-only sandbox, `ask` approval and read-only permission preset. fishball-ui's UI
  guard rows (`ui-*`, `entry-customization`) and the hosted child's Preview Notice acknowledgement are
  here too, but apply only while fishball-ui is in the profile; without fishball-ui core leaves DSH's own
  UI as it is. The owner may override any guard; core then reports `guards-overridden` and changes
  nothing back.
- fishball-ui's rows (`./ui/`): `fishball-ui`, `fishball-page`, and one of two rows by mode (DESIGN
  §28). The child is instance-run while the instance's launch overlay inserts its row
  `dsh-instance-child`; only the main DSH installs plugins into it then. Standalone:
  `fishball-recommend-plugins`, the **Fishball Recommended** tab on DSH's Plugins page. Instance-run:
  `fishball-child-plugins`, which hides DSH's own install entries on the child's Plugins page with a
  style rule (Add plugin and its menu, the Discover tab, every Uninstall and Update) and shows "Plugins
  for this Fishball are installed from the main DSH: Plugins → Fishball tab." where Add plugin was.
  Nothing is refused on the Host; the rule reads DSH's markup and words, so a later DSH can bring a
  control back.

Core's rows are not `required`: a failure is that row's alone, and the DSH still boots.

### Settings page

Core's own page on DSH's Plugins page (`client.js` with `client.settings.js`, in the
`plugins.bundle.config` slot), the same in standalone and hosted mode:

- **DSH targets**: every DSH Fishball works with, one MCP endpoint of a connector each, for example
  `http://127.0.0.1:<port>/api/agent/mcp`. There is no count limit, and an endpoint already in the list
  is refused. Each target shows its name (the DSH's advertised `<name>-DSH`, with ` (2)`, ` (3)` … for
  a later equal name) and its state (connected, connecting, failed, not set). A name follows a rename at
  once. Per target: its URL, its own write-only token field, **Connect** / Cancel / Retry and
  **Remove**. Removing a target, or pointing it at another endpoint, asks first; its waiting cards are
  voided, its saved token is deleted and its history stays read-only. Nothing is sent to the DSH. In a
  hosted child the DSH it runs in comes first, with the URL the instance supplies; it cannot be removed
  or edited. Below the cards, a labelled **Add a DSH** block takes another DSH's connector MCP URL
  (Enter or **Add**) and says what comes next: that target's token and **Connect** on its new card. The
  global fields below sit under their own **Connection and identity** heading.
- **Client metadata URL** (`connect.clientMetadataUrl`): the https URL of the Client ID Metadata
  Document you host, one for every target. **Connect** needs it.
- **Fishball id** and **Name** (`identity.id`, `identity.name`). An unset id is generated and kept in
  core's own storage; the id is sent as `agent_id`.
- **Token** (per target): write-only. A pasted token, freshly generated on that target connector's
  settings page, is saved in DSH's credential store under that target alone and tried at its next
  connection; it replaces a saved credential only once the target accepts it.
- **Connect**: browser OAuth through the connector's approval page. A loopback target may be plain
  http; any other target must be https. From a browser on another machine, Fishball's page must be
  served over https (callback `/api/fishball/connect/callback`), else `web-callback-insecure`.
- **Fishball's model** (`model`: provider, model, reasoning effort): the model the manager session
  uses. Unset means this DSH's default model; nothing blocks. Written from this page or from
  `dsh-instance`'s first-run onboarding wizard. The instance's model sync copies providers and model lists only and never sets it.
- **Sidebar logo** (`brandStyle`): Fishball's fish or DeepSeek's whale in fishball-ui's sidebar brand
  row; absent or unknown reads as Fishball.
- **Waking Fishball** (`wake.quietWindowSeconds`, default 10, ≥ 0; `wake.maxBatch`, default 20, ≥ 1;
  `wake.classes`, each event type wakes or is recorded quietly): connector events are handed to
  Fishball in batches, one turn per batch (DESIGN §29). A save applies from the next event. A message
  you send is never delayed.

### Programmatic tool calling

On DSH 0.2.2, Fishball uses the built-in PTC executor by default. Only its manager session
changes: it keeps the restricted Fishball preset and calls its existing tools from `run_code`.
Other sessions keep their own executor. Fishball rejects requests to widen the program's sandbox.
DSH 0.2.1 keeps its existing tool mode.

To opt out, set `ptc: false` in the `fishball-core` row of the Fishball profile's
`cordis.patch.yml`, preserving any other `config` keys on that row. In a hosted child this is
`~/.dsh/fishball/runtime/dsh-home/profiles/fishball/cordis.patch.yml` with the default DSH home:

```yaml
- id: fishball-core
  config:
    ptc: false
```

Restart the Fishball host process after changing the setting; an open Agent does not switch
executors mid-turn. Keep the existing session and profile: DSH replays old direct calls and results
as history, and the new executor governs only future calls. Previously compacted context stays
compacted; no migration or extra compaction is needed. Fishball’s own `ask_user` returns as soon as
it files the card, so PTC programs do not wait for user input.

### Model tools

Every tool of a target is offered to the manager as `mcp__<target>__<tool>_<id>` (at most 64
characters), so two DSHs' `sessions_list` never collide. Each target has its own namespaced
`ask_user({offer_id})` for permission offers. A tool's description names its target. A renamed
target's tools are renamed together; an old name is never reused for another target. Fishball's own
`ask_user`, `message_user`, reminder and private Skill tools are unprefixed and exist once.

### Fishball’s own question cards

For its own clarifications, Fishball calls
`ask_user({questions: [{id, question, header?, options?: [{label, description?}], multi_select?}]})`.
The tool persists one local card for the batch and returns `{cardId}` without waiting. The card
uses the same ask-card layer and page stream as permission cards. Only the Fishball owner can
see and answer it. The accordion switches between permission and question cards. Each question
card shows the batch count and summary; expanding it reveals a separate fieldset for each question.

Submitting the card queues an ordinary user-role follow-up message in Fishball’s chat. It
contains `cardId` and the answers (`id`, `selected`, optional `custom`) in the original question
order. If Fishball is idle, the message wakes it; if it is busy, the current turn finishes first.
Nothing is sent to a connector. Forwarded managed-session questions and plan reviews still use
their own session cards and the existing answer flow.

### Automatic permission cards

When a current connector enables automatic permission cards, Fishball files the existing
**Allow once / Reject** card on escalation and sends an action notice through Connector UI
if available. If the model leaves an opted-in permission undecided in the turn that received
it, Fishball escalates it automatically. The first answer wins, including from the requesting
session's approval prompt. The target’s namespaced `ask_user({offer_id})` remains a manual
fallback for older or opted-out targets.

While a Fishball page holds the page stream, core re-reads each connected target's running managed
sessions every 15 s for the sidebar (DESIGN §35); with no page open it sends no such call.

### Without the other plugins

Core runs normally without `fishball-ui` (no page, no strip) and reports nothing about it. Core's
status's set check has no member in 1.0.0-alpha.1, so it always reports the set `ok`. Core and
fishball-ui name the amenities nowhere (`fishball-board`, `fishball-heartbeat`, `fishball-taskboard`, `fishball-consultant` ship
through the [`fishball-amenities`](<../fishball-amenities/README.md>) umbrella and bind to
`fishballInstance` themselves).

### Known limits

- Reminders: creates and growing updates may fill 90% of the 4 MiB store, and the rest is kept for
  delivery. Roughly 10k+ tiny recurring reminders (their delivery receipts), or thousands falling due at
  once, can still use up that reserve; the failed delivery is then logged, and the reminder stays due
  and is retried until space frees up.

## Structure

| path | what |
|---|---|
| `package.json`, `cordis.patch.yml` | the manifest (exports `./client`, `./link`, `./contracts`, `./main`, `./session-route`) and the bundle patch: guard rows, `preset-fishball`, core's and fishball-ui's rows |
| `client.js`, `client.settings.js` | core's own settings page (browser half; the chunk holds the page) |
| `contracts/` | K3/K3a declarations (`*.d.ts`, not shipped) and `constants.js`, their runtime values and core's copy of the connector's MCP surface ([README](<contracts/README.md>)) |
| `src/main/` | the main row: composes every module, its settings `Config`, the generated identity, service followers |
| `src/targets/` | the target collection: records and tool bindings, one runtime per target epoch, names, keys, routes `/api/fishball/targets/*`, running sessions |
| `src/link/` | the MCP link to one connector, the target URL rule, status, saved credentials, Connect (OAuth client, web callback) |
| `src/identity/` | `identity.id` / `identity.name` rules, pairing and its records |
| `src/events/` | the interception service, the acceptance ledger, the delivery list and wake batching |
| `src/asks/` | the ask cards: `ask_user` per target, the card store, `/api/fishball/asks/*` |
| `src/bridge/` | the façade that offers a target's tools to the model (names, gates, `attachment_read` as an image) |
| `src/manager/` | the manager session, `fishballInstance.manager`, persona registration, reminders, `message_user`, private Skills |
| `src/status/` | the status snapshot, the per-target strip line, the set check, the once-per-start notices |
| `src/guards/` | the guard row: what the patch intends, the check, the standalone self-reorder |
| `src/page/stream.js` | the Fishball page's one SSE connection and its topic registry |
| `src/session/route.js` | `/api/fishball/session` |
| `src/settings/` | the settings page's Node half (names) |
| `src/persona.js`, `src/tool-output.js` | Fishball's persona text; how core's tools render a JSON result |
| `assets/` | the plugin icon |
| `ui/` | the [fishball-ui](<ui/README.md>) package (its own manifest and tests) |
| `tests/` | core's own tests (not shipped) |

## Testing

```bash
node scripts/test.mjs fishball-core                     # every entry file, current DSH
node scripts/test.mjs fishball-core --file=link         # one entry file
node scripts/test.mjs fishball-core -- --test-name-pattern=MULTI-1-FIX
node scripts/test.mjs fishball-core --against=<git-ref> # today's tests on core's code at <ref>
```

Entry files (the [test index](<tests/README.md>) has the case-id prefixes and counts):

| entry | what it covers |
|---|---|
| `asks.test.mjs` | ask cards: `ask_user` per target, the card store, answers, routes, failed writes |
| `bridge.test.mjs` | the façade: offered tools and names, call gates, attention, `attachment_read` |
| `child-plugins.test.mjs` | which of the two mode rows core's patch turns on (DESIGN §28) |
| `contracts.test.mjs` | `contracts/` against the connector's published K1/K2 and DSH's grammars |
| `events.test.mjs` | interception, ledger, one wake per event, crash recovery, wake batching |
| `identity.test.mjs` | identity and pairing against a fake connector |
| `link-save.test.mjs` | saved credentials and Connect against DSH's real credential store |
| `link.test.mjs` | the MCP link: target rule, status, drop and return, client-import failures |
| `manager.test.mjs` | the manager session: reminders, singleton, identity, model, review fixes, persona |
| `message-user.test.mjs` | `message_user` and the persona's rules for it |
| `package.test.mjs` | core's manifest, patch and shipped source (static) |
| `persona.test.mjs` | the persona's bold-punctuation rule against DSH's own chat markdown parser |
| `settings.test.mjs` | core's settings page in a scripted DSH page |
| `skills.test.mjs` | private Skills tools and store |
| `status.test.mjs` | the status snapshot, strip line, set check and notices |
| `wire.test.mjs` | the main row in a booted standalone DSH, multiple targets, lifecycle, running sessions |

Rows that need fishball-ui (or another package) beside core are not here: each area README lists them
under its integration rows, and the integration packages run them before a release
([`integration-page-stream`](<../integration-page-stream/>): core's page stream with fishball-ui and
fishball-taskboard; [`integration-release`](<../integration-release/>): package boundaries and the
release folder; [`integration-amenities`](<../integration-amenities/README.md>): core's icon as the
family reference). Rules and runner: [docs/testing/README.md](<../../docs/testing/README.md>).
