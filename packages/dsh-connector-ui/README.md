# dsh-connector-ui

The DeepSeek Harness (DSH) UI for [`dsh-agent-connector`](https://www.npmjs.com/package/dsh-agent-connector).
The connector is the backend: it holds every state and handles every action. This plugin only draws
them in DSH's web UI and stores nothing of its own.

## Requirements

- DSH **0.2.1-rc.5** or **0.2.2-rc.1**.
- **`dsh-agent-connector` in the same DSH.** Without it this plugin does nothing: it logs one
  `connector-missing` error and draws nothing.
- Optional: `dsh-instance`, which runs a hosted Fishball child in this DSH. The window shows that
  child's page.

## Install

Quit DSH, then add the plugin to your profile (`--profile` is required; `web` is an example):

```bash
dsh plugin --profile web add dsh-agent-connector
dsh plugin --profile web add dsh-connector-ui
```

Start DSH. pnpm may report DSH's own packages as missing peers. DSH provides them at run time, so
you can ignore that warning.

## Uninstall

Remove it on DSH's Plugins page, or quit DSH and run:

```bash
dsh plugin --profile web remove dsh-connector-ui
```

The connector keeps working without it. You lose the fish, the window, the marks and
**Hand over** / **Take back**, and agents lose the `notify` tool.

## What it draws

### The sidebar fish

One **Fishball** row with a fish icon in DSH's sidebar panel list, placed first. DSH's own brand
mark and name are left unchanged. The fish has a light: a dot when an agent asks for your
attention, and an animation when the matter is important. Opening the window clears the light.

### The Fishball window

The fish opens the Fishball window in DSH's main area. It shows the hosted Fishball child's own
page (the Fishball page from `fishball-ui`), framed inside this DSH:

- The page opens only when you opened DSH at `127.0.0.1` or `localhost`. Under any other host name
  the window says "Open DSH at 127.0.0.1 to use Fishball".
- While the child is not running, the window shows the child's state and a **Retry** link to
  `dsh-instance`'s settings page.

### The no-instance hint

With no hosted child in this DSH (no `dsh-instance`, or only external agents connected), the window
shows a hint instead: "No Fishball child instance is running here. Open your Fishball instance's
own page."

### Hand over / Take back

In a session's header and in its row menu:

- **An unmanaged session** offers the agents you can hand it to: the connector's token entries that
  are switched on and paired, in the connector's order, each with a green (online) or red (offline)
  light. With one agent the button reads **Hand over to <name>**; with several, **Handover to…**
  opens a list. You can add an optional note, which the agent receives with the session.
- **A managed session** shows **Managed by <name>** and **Take back**. Take back returns the session
  to you in one click, and the agent is told.
- An agent without a name is shown by its id.

### The notify tool

This plugin declares three tools through the connector's contribution service. Agents connected to
the connector see them in `tools/list`; the connector runs them.

| Tool | What it does |
| --- | --- |
| `embed-ui.notify` | Shows the user a short notice beside the sidebar fish. The notice stays until the user clicks it or opens the window, and a newer notice replaces it. `message` is plain text of 1 to 4000 characters after trimming (an empty one is refused with `message-empty`). Set `important: true` only when the user must act; the fish then animates. |
| `embed-ui.attention.signal` | Lights the fish until the user next opens the window. `important` makes it animate. |
| `embed-ui.attention.state` | Reads the light: count 0 or 1, and whether it is important. |

A model that only allows `[A-Za-z0-9_-]` in tool names sees them with `__` in place of each `.`, for
example `embed-ui__notify`. The tools exist only while this plugin is loaded: uninstalling it
removes them and turns the light off.

## Licence

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
