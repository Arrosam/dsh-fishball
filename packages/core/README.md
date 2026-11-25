# fishball-core

The backend of the Fishball plugin set (`fishball-core`, `fishball-ui`), on the
Fishball side. It turns a DSH into Fishball: one long-lived manager session that reaches the DSH it
manages only through that DSH's `dsh-connector` MCP endpoint, as any agent does. It imports nothing
from the DSH-side packages; its copy of the connector's public MCP surface
is its own (`contracts/constants.js`, `MCP` and `LINK`), checked against the connector by contract
tests.

Version `1.0.0-alpha.1`. Requires DSH `>=0.2.1-rc.5`. In hosted mode `dsh-instance` places it in Fishball's child (last, so
its guard patch reaches every row); in a standalone DSH you install it yourself, last (see the
[root README](<../../README.md>)).

## Rows (`cordis.patch.yml`)

- `fishball-core` (`fishball-core/main`, `src/main/`): the target list (`src/targets/`: one link,
  Connect, pairing and bridge façade per DSH target), the interception service, the ask cards,
  status, and the one manager session with its persona, reminders (`schedule_*`), `message_user`
  (its one way to speak to the user on the Fishball page) and private Skills. It provides `fishballInstance` (apiVersion 2) and `fishballStatus`.
- `fishball-core-session` (`src/session/route.js`): `GET|POST /api/fishball/session`, the manager
  session the Fishball page opens.
- `fishball-core-guards` (`src/guards/`): the guard check, the `guards-overridden` report and, in a
  standalone DSH, the self-reorder to the end of `dsh.profile.bundles`.
- `preset-fishball`: core's own agent preset (read and read_image only, plus DSH's `ask_user_question`).
- Guard rows: the session-creating service rows (`schedule`, `open-in-app`,
  `terminal-controller`), `dsh-instance` (no nested hosted Fishball), every DSH-shipped agent preset
  (switched off, never deleted), and the read-only sandbox, `ask` approval and read-only permission
  preset. fishball-ui's UI guard rows (`ui-*`, `entry-customization`) and the hosted child's Preview
  Notice acknowledgement are here too, but apply only while fishball-ui is in the profile; without
  fishball-ui core leaves DSH's own UI as it is. The owner may override any guard; core then reports
  `guards-overridden` and changes nothing back.

- fishball-ui's sub-package rows (`./ui/`): `fishball-ui`, `fishball-page`, and one of two rows
  by mode (DESIGN §28). The child is instance-run while the instance's launch overlay inserts its
  row `dsh-instance-child`; only the main DSH installs plugins into it then. Standalone:
  `fishball-recommend-plugins`, the **Fishball Recommended** tab on DSH's Plugins page.
  Instance-run: `fishball-child-plugins`, which hides DSH's own install entries on the child's
  Plugins page with a style rule (Add plugin and its menu, the Discover tab, every Uninstall and Update) and
  shows "Plugins for this Fishball are installed from the main DSH: Plugins → Fishball tab." where
  Add plugin was. Nothing is refused on the Host; the rule reads DSH's markup and words, so a later
  DSH can bring a control back.

Core's rows are not `required`: a failure is that row's alone, and the DSH still boots.

## Settings page

Core's own page on DSH's Plugins page (`client.js` with `client.settings.js`, in the
`plugins.bundle.config` slot), the same in standalone and hosted mode:

- **DSH targets**: every DSH Fishball works with, one MCP endpoint of a connector each, for example
  `http://127.0.0.1:<port>/api/agent/mcp`. There is no count limit, and an endpoint already in the list is refused. Each
  target shows its name (the DSH's advertised `<name>-DSH`, with ` (2)`, ` (3)` … for a later equal
  name) and its state (connected, connecting, failed, not set). A name follows a rename at once. Per target:
  its URL, its own write-only token field, **Connect** / Cancel / Retry and **Remove**. Removing a
  target, or pointing it at another endpoint, asks first; its waiting cards are voided, its saved
  token is deleted and its history stays read-only. Nothing is sent to the DSH. In a hosted child the DSH
  it runs in comes first, with the URL the instance supplies; it cannot be removed or edited.
  Below the cards, a labelled **Add a DSH** block takes another DSH's connector MCP URL (Enter or
  **Add**) and says what comes next: that target's token and **Connect** on its new card. The
  global fields below sit under their own **Connection and identity** heading.
- **Client metadata URL** (`connect.clientMetadataUrl`): the https URL of the Client ID Metadata
  Document you host, one for every target. **Connect** needs it.
- **Fishball id** and **Name** (`identity.id`, `identity.name`). An unset id is generated and kept
  in core's own storage; the id is sent as `agent_id`.
- **Token** (per target): write-only. A pasted token, freshly generated on that target connector's
  settings page, is saved in DSH's credential store under that target alone and tried at its next
  connection; it replaces a saved credential only once the target accepts it.
- **Connect**: browser OAuth through the connector's approval page. A loopback target may be plain
  http; any other target must be https. From a browser on another machine, Fishball's page must be
  served over https (callback `/api/fishball/connect/callback`), else `web-callback-insecure`.
- **Fishball's model** (`model`: provider, model, reasoning effort): the model the manager session
  uses. Unset means this DSH's default model; nothing blocks. Only this page and fishball-ui's model
  dialog write it. The instance's model sync copies providers and model lists only and never sets it.

## Programmatic tool calling

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
compacted; no migration or extra compaction is needed. On PTC, ask blocking user questions in a separate
program with time for a reply; the Node deadline defaults to two minutes and caps at ten.

## Model tools

Every tool of a target is offered to the manager as `mcp__<target>__<tool>_<id>` (at most 64
characters), so two DSHs' `sessions_list` never collide. Each target has its own `ask_user` too. A tool's description
names its target. A renamed target's tools are renamed together; an old name is never reused for
another target. Reminder and private Skill tools are unprefixed and exist once.

## Without the other plugins

Core runs normally without `fishball-ui` (no page, no strip) and reports nothing about it. Core's
status's set check has no member in 1.0.0-alpha.1, so it always reports the set `ok`.
`fishball-board` is shelved, not in 1.0.0-alpha.1.

## Known limits

- Reminders: creates and growing updates may fill 90% of the 4 MiB store, and the rest is kept for delivery. Roughly 10k+ tiny recurring reminders (their delivery receipts), or thousands falling due at once, can still use up that reserve; the failed delivery is then logged, and the reminder stays due and is retried until space frees up.
