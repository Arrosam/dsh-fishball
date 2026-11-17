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

- `fishball-core` (`fishball-core/main`, `src/main/`): the link to the target, Connect, the
  interception service, the ask cards, status, the bridge façade over the connector's tools, and the
  one manager session with its persona, reminders (`schedule_*`) and private Skills. It provides
  `fishballInstance` (apiVersion 1) and `fishballStatus`.
- `fishball-core-session` (`src/session/route.js`): `GET|POST /api/fishball/session`, the manager
  session the Fishball page opens.
- `fishball-core-guards` (`src/guards/`): the guard check, the `guards-overridden` report and, in a
  standalone DSH, the self-reorder to the end of `dsh.profile.bundles`.
- `preset-fishball`: core's own agent preset (read and read_image only).
- Guard rows: the session-creating service rows (`schedule`, `open-in-app`,
  `terminal-controller`), `dsh-instance` (no nested hosted Fishball), every DSH-shipped agent preset
  (switched off, never deleted), and the read-only sandbox, `ask` approval and read-only permission
  preset. The UI guard rows are fishball-ui's. The owner may override any guard; core then reports
  `guards-overridden` and changes nothing back.

Core's rows are not `required`: a failure is that row's alone, and the DSH still boots.

## Settings page

Core's own page on DSH's Plugins page (`client.js` with `client.settings.js`, in the
`plugins.bundle.config` slot), the same in standalone and hosted mode:

- **Target** (`target.url`): the connector's MCP endpoint, for example
  `http://127.0.0.1:<port>/api/agent/mcp`. In a hosted child the URL the instance supplies wins.
- **Client metadata URL** (`connect.clientMetadataUrl`): the https URL of the Client ID Metadata
  Document you host. **Connect** needs it.
- **Fishball id** and **Name** (`identity.id`, `identity.name`). An unset id is generated and kept
  in core's own storage; the id is sent as `agent_id`.
- **Token for connecting a DSH**: write-only, always shown. A pasted token, freshly generated on the
  target connector's settings page, is saved in DSH's credential store and tried at the next
  connection; it replaces a saved credential only once the target accepts it.
- **Connect**: browser OAuth through the connector's approval page. A loopback target may be plain
  http; any other target must be https. From a browser on another machine, Fishball's page must be
  served over https (callback `/api/fishball/connect/callback`), else `web-callback-insecure`.
- **Fishball's model** (`model`: provider, model, reasoning effort): the model the manager session
  uses. Unset means this DSH's default model; nothing blocks. Only this page and fishball-ui's model
  dialog write it. The instance's model sync copies providers and model lists only and never sets it.

## Without the other plugins

Core runs normally without `fishball-ui` (no page, no strip) and reports nothing about it. Core's
status's set check has no member in 1.0.0-alpha.1 (`fishball-board`, its one member, is shelved, not
in this release), so it always reports the set `ok`.

## Known limits

- Reminders: creates and growing updates may fill 90% of the 4 MiB store, and the rest is kept for delivery. Roughly 10k+ tiny recurring reminders (their delivery receipts), or thousands falling due at once, can still use up that reserve; the failed delivery is then logged, and the reminder stays due and is retried until space frees up.
