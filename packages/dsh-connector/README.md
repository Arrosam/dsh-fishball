# dsh-agent-connector

A DeepSeek Harness (DSH) plugin that lets external agents manage this DSH's sessions. It serves a
generic MCP endpoint with its own OAuth 2.1 authorization server. An agent with a token can start
sessions, message them, read them, and answer their permission requests, questions and plan
reviews. Fishball is one such agent, but any standard MCP client can connect.

The plugin changes nothing in DSH's own UI. Its only browser code is its own settings page. The
sidebar entry, the marks on managed sessions and **Hand over** / **Take back** come from
[`dsh-connector-ui`](https://www.npmjs.com/package/dsh-connector-ui), which is optional.

## Requirements

- DSH **0.2.1-rc.5** or **0.2.2-rc.1**.
- Node 22.14 or later. DSH itself needs Node 24.9 or later.
- **DSH's web app** (`@deepseek-ai/dsh-web-app`) in the same profile. The connector serves its
  routes on DSH's web server and uses the web app's session services. Without the web app, the
  plugin stays pending in DSH's missing-dependency state.

## Install

Quit DSH, then add the plugin to your profile (`--profile` is required; `web` is an example):

```bash
dsh plugin --profile web add dsh-agent-connector
```

Start DSH. pnpm may report DSH's own packages as missing peers. DSH provides them at run time, so
you can ignore that warning.

## Uninstall

Remove it on DSH's Plugins page, or quit DSH and run:

```bash
dsh plugin --profile web remove dsh-agent-connector
```

DSH runs no plugin code when a plugin is removed. The connector's settings and stored data stay in
the profile. Agents that used it lose access at once.

## What it serves

All routes are on DSH's own web listener, except the approval page.

| Path | What it is |
| --- | --- |
| `/api/agent/mcp` | The MCP endpoint (Streamable HTTP, protocol revision `2026-07-28` only). |
| `/api/agent/oauth` | The OAuth issuer. The token endpoint is `/api/agent/oauth/token`. |
| `/.well-known/oauth-protected-resource/api/agent/mcp` | Protected-resource metadata (RFC 9728). |
| `/.well-known/oauth-authorization-server/api/agent/oauth` | Authorization-server metadata (RFC 8414). |
| `/authorize` on the approval port | The approval page, where a person authorizes a browser client. |

Every MCP request needs `Authorization: Bearer <access token>`. Scopes are `agent` (full power) and
`agent:pair` (pairing only). A request that carries an `Origin` header is refused, so web pages
cannot call these routes from a browser.

Events reach an agent through its own mailbox. The agent subscribes to the resource
`dsh-agent://events` to get change hints, reads events with `inbox_poll` and confirms them with
`inbox_ack`. An agent counts as **connected** while it holds an open listen stream on that resource.

## Settings

Open DSH → Plugins and open the connector's settings. The same fields are in DSH's own settings
form for the plugin. Every change applies at once, without a restart.

### Tokens

Each agent gets its own token. A token is the only credential: whoever presents a valid token gets
manager rights over this DSH's sessions.

- **New token**: enter a label and press **New token**. The value (it starts with `dsht_`) is shown
  **once**, in a dialog with **Copy**. After you close the dialog, nobody can view or edit it. If you
  lose a token, delete it and create a new one.
- Each entry has a label, an **On** switch, **Delete** and reorder buttons; press **Save** to store
  list changes. The page also shows each entry's pairing state: the agent's name or id, whether it
  is connected, and when it was last seen.
- **Off** refuses the agent until you switch the token on again. **Delete** removes it for good.
  Either way the agent loses its sessions: they return to you, and any request waiting for that
  agent is shown to you in its session.
- A token serves **one** agent. The first agent to pair with it keeps it.
- Tokens that are duplicated or added by hand refuse service; the page names them. Delete them and
  create new ones.

`dsh-instance`, when installed, creates its own token entry for its hosted Fishball. That entry
appears in the same list.

### Approval page port

The port of the approval page that browser clients sign in on. The default is **47615**. It binds
the same host as DSH (and uses DSH's TLS when DSH has it). The page shows the listener's status. If
the port is in use, the connector tries again every 30 seconds. Choose another port, or free this
one. Port `0` lets the system choose a free port; an empty field is not saved.

The page re-reads the pairing states and the listener's status about once a second while it is
open. If they cannot be read, the page says so and offers **Retry**.

A field is saved when you leave it or press Enter; Esc discards your change. If someone changes the
same setting elsewhere while you are editing it, the page tells you and keeps your text. Leave the
field or press Enter again to save it anyway, or press Esc to keep the other change.

### DSH name

Optional. MCP discovery advertises `<name>-DSH`, where `<name>` is this setting verbatim, or
`node:os.hostname()` (the OS device name) when unset, empty or whitespace-only. Nonblank names
keep Unicode, spaces and special characters unchanged. The literal suffix is always appended,
including to a name that already ends in `-DSH`. The approval page shows the same base name,
without the appended suffix; neither identity is derived from an address or request Host.

**Fishball's decision:** while the setting is blank, a small local watcher checks the OS hostname
every 30 seconds and detects changes through the same local trigger as a setting rename. It makes
no network requests. Setting a nonblank name stops the watcher; clearing it starts the watcher
again. Disposing the connector stops it. A live identity read also observes hostname changes
without waiting for the next check.

Full-power clients can list/read `dsh-agent://identity` (`dsh-identity`, `application/json`). Its
single JSON text content is the same live `{name, version}` as modern MCP discovery at
`result._meta['io.modelcontextprotocol/serverInfo']`. Include that URI in the existing
`subscriptions/listen` filter to receive standard `notifications/resources/updated {uri}` hints.
A setting rename or observed hostname change broadcasts only to subscribed authenticated clients;
unchanged effective names send nothing. Rediscover/read on a hint and after reopening the stream:
hints are not durable replay. Renames do not remount the endpoint, change tools or OAuth, or require
re-pairing. Pair-only clients retain their existing restricted surface.

The settings page and the server preserve nonblank names verbatim, including leading/trailing
spaces. A whitespace-only setting counts as unset.

### Limits

Each limit is a whole number of at least 1, with no maximum.

| Setting | Default | Meaning |
| --- | --- | --- |
| `maxQueuedInputs` | 200 | Events waiting for an agent that it has not taken yet (messages, finish notices, contributed events). Past it those events are refused with `queue-full`. Permission requests, questions and their outcomes are always delivered. |
| `argumentExcerptBytes` | 8192 | How much of a requested tool call the managing agent sees, in bytes. |
| `maxMessageBytes` | 65536 | The size of one message to or from a managed session, in bytes. |
| `readSessionMessages` | 12 | The number of messages `session_read` returns. |
| `readSessionBytes` | 12288 | The number of bytes `session_read` returns. |

## Connect an agent

Create a token first (see [Tokens](#tokens)). Then use one of two ways.

### Machine clients: client credentials

For an agent that runs without a browser.

1. Request an access token at `<origin>/api/agent/oauth/token` with `grant_type=client_credentials`.
   The client id is the agent's own id: 1 to 64 characters of `A–Z`, `a–z`, `0–9`, `_` and `-`
   (case-sensitive). The client secret is the token. Send them with `client_secret_basic` or
   `client_secret_post`, and set `resource` to the MCP endpoint's URL.
2. The first access token can only pair. Call the MCP tool `pair` (optionally with a `name`) once to
   bind your id to the token. From then on, that id's access tokens, the current one included,
   have full power.
3. An access token lasts one hour, and there is no refresh token. Request a new one when it expires.

### Browser clients: authorization code with PKCE

For a client that signs in through a person's browser, such as
[`dsh-connector-adapter`](https://www.npmjs.com/package/dsh-connector-adapter).

- The client is public (no secret). Its client id is the https URL of a **Client ID Metadata
  Document (CIMD)** that you host. The connector fetches that document over https only, from a
  public address (private and loopback addresses are refused), with no redirects and a 5 KiB limit.
  The document needs `client_id` equal to its own URL, a `client_name` and `redirect_uris`. It must
  hold no secret, and `token_endpoint_auth_method` must be `none` or absent. Loopback redirects
  (`http://127.0.0.1/...`) may use any port.
- The flow is the authorization code grant with PKCE `S256`. The authorization endpoint is the
  approval page. There a person enters a token and, optionally, a name for the agent, then presses
  **Authorize**. The page shows the client's name (marked unverified), the redirect host and this
  DSH's name, and it warns that authorizing grants full manager rights.
- The agent may pass its id in the `agent_id` request parameter. Without one, the connector derives
  a fixed id from the client id (`cid-…`). The page pairs the token at once, so no `pair` call is
  needed. A token paired on the page refuses client credentials.
- Refresh tokens rotate. If a client presents a refresh token that has already been used, the
  connector ends that sign-in.

Repeated failed credentials are rate-limited (HTTP 429). A valid credential always passes.

### Plain http only on loopback

`localhost`, `127.0.0.1` and `[::1]` may use plain `http`. Every other host must use `https`: start
DSH with TLS, or put it behind your own tunnel. The connector has no tunnel feature of its own. Add
each public host name to DSH's `--trusted-host` list; requests to any other host are refused. If
DSH listens on a non-loopback address over plain http, every connector route answers 503
(`insecure-listener`).

Behind a tunnel, route both DSH's port and the approval port under one public host name, using path
routing.

## Session routing

- **An agent sees and operates only the sessions it manages.** It manages a session that it started
  with `session_start`, or one you handed to it with **Hand over** (from `dsh-connector-ui`).
  `sessions_list` omits every other session, and every session tool refuses one it does not manage.
- **A managed session's questions, plan reviews and permission requests go to its agent.** The agent
  answers them with `question_answer` and `approval_answer`. They wait without a timer and without a
  cap, whether or not the agent is connected. A standing grant (`grant` answer) allows matching
  calls later without asking again.
- **Questions and plan reviews also open your card in the session, and the first answer counts.** If
  you answer first, the agent receives your answer as the outcome.
- **A permission request waits for the agent.** Your own prompt shows when the agent escalates the
  request, or when the session leaves the agent's management.
- **An escalated request belongs to you.** It leaves the agent's lists, and the agent can no longer
  answer it. Your answer settles it, and the agent receives that outcome.
- A session's management ends with `session_release` (the agent's own), **Take back** (yours), or
  when its token is switched off or deleted. Requests still waiting then go to you.
- Inside a managed session, the model has the tool `message_agent` for writing to its agent.
- Sessions nobody manages behave as plain DSH: their requests and questions go to you only.

## MCP tools

| Group | Tools |
| --- | --- |
| Sessions | `sessions_list`, `session_start`, `session_message`, `session_redirect`, `session_stop`, `session_read`, `session_release` |
| Requests | `approvals_list`, `approval_answer`, `question_answer`, `prompts_list`, `prompt_answer` |
| Grants | `grants_list`, `grant_revoke` |
| Attachments | `attachment_put`, `attachment_read` |
| Events | `inbox_poll`, `inbox_ack` |
| Identity | `pair`, `set_name` |

Other plugins in the same DSH can add tools and events through the contribution service. Their
names are `<namespace>.<tool>`, and they are listed after the connector's own tools.
[`./tools`](<tools/README.md>) describes the contribution interface, and
[`./mcp-schema`](<mcp-schema/README.md>) the full contract: schemas, events, codes and limits. Both
are the maintainers' contract notes, with the history of each decision; this README is the
user-facing description.

## Licence

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
