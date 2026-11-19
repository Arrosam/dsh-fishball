# dsh-connector-adapter

A DeepSeek Harness (DSH) plugin that lets one DSH use **another** DSH's
[`dsh-agent-connector`](https://www.npmjs.com/package/dsh-agent-connector) through DSH's own MCP
client (`dsh-mcp-client`). The stock client has no OAuth support, so the adapter adds it: a browser
sign-in, tokens that are stored and refreshed, and a loopback proxy the stock client connects
through.

Install it in the DSH that **uses** a connector, never in the connector's own DSH. It works only
with `dsh-agent-connector` endpoints and needs no other plugin of this set.

## Requirements

- DSH **0.2.1-rc.5** or **0.2.2-rc.1**.
- Node 22 or later. DSH itself needs Node 24.9 or later.
- A Client ID Metadata Document that you host on a public https URL (see
  [below](#the-client-id-metadata-document)).
- A token from the connector's settings page (**New token** on the connector's DSH).

## Install

Quit DSH, then add the plugin to your profile (`--profile` is required; `web` is an example):

```bash
dsh plugin --profile web add dsh-connector-adapter
```

Start DSH. pnpm may report DSH's own packages as missing peers. DSH provides them at run time, so
you can ignore that warning.

## Uninstall

Remove it on DSH's Plugins page, or quit DSH and run:

```bash
dsh plugin --profile web remove dsh-connector-adapter
```

The connectors' tools disappear from this DSH. The stored grants stay in DSH's credential store.
To end the access on the connector's side as well, switch off or delete the token on the
connector's settings page.

## Settings

DSH → Plugins → `dsh-connector-adapter`:

| Setting | Meaning |
| --- | --- |
| `clientMetadataUrl` | **Required, with no default.** The https URL of your Client ID Metadata Document. It must be `https:` and have a path other than `/`. While it is missing or invalid, every server is `needs-configuration` and no request is sent. |
| `servers` | The connectors to sign in to, as a list of `{serverName, url}`. Each entry gets its own grant and its own MCP client row. |
| `servers[].serverName` | A local name of 1 to 32 characters (`A–Z`, `a–z`, `0–9`, `_`, `-`), unique in the list. The server's tools appear as `mcp__<serverName>__<tool>`. |
| `servers[].url` | The connector's MCP endpoint, ending in `/api/agent/mcp`. |

### https, or http on loopback only

The adapter sends the access token to `url`, so `url` must be **https**. Plain `http` is allowed
only on a loopback host (`127.0.0.1`, `[::1]`, `localhost`). The adapter refuses to start with any
other `http` URL (`insecure-server-url`) or with two entries of the same name (`duplicate-server`).

The same rule applies to the endpoints the connector advertises: its approval page and token
endpoint must be https or loopback http, and the token endpoint must be on the configured URL's
origin. To reach a connector on another machine, that DSH must serve https, directly or through
its owner's own tunnel.

## The Client ID Metadata Document

The adapter is a public OAuth client: it has no secret. Its client id is the URL of a JSON document
that you host yourself. The connector fetches it over https from a public address (private and
loopback addresses are refused), follows no redirects, and reads at most 5 KiB. Template:

```json
{
  "client_id": "https://example.com/dsh/client.json",
  "client_name": "My DSH",
  "redirect_uris": ["http://127.0.0.1/callback"],
  "token_endpoint_auth_method": "none"
}
```

- Host it at the exact URL you put in `client_id`, and set `clientMetadataUrl` to that same URL.
- `client_name` is shown on the connector's approval page, marked unverified.
- The adapter receives the sign-in on `http://127.0.0.1:<port>/callback`, with a fresh port for
  each attempt. A loopback redirect may differ from the registered one in its port only, so register
  `http://127.0.0.1/callback`. `localhost` counts as a different host.
- Do not add `client_secret` or any other authentication method: the connector refuses a document
  with a secret.

## Sign in

Ask the agent in this DSH to call **`dsh_connector_sign_in`** with the server's `serverName`. The
tool returns at once with one of these statuses:

| `status` | Meaning |
| --- | --- |
| `authorized` | Already signed in. Nothing to do. |
| `approval-url` | Open `url` in your browser. On the connector's approval page, enter a token from the connector's settings and press **Authorize**. Calling again while that sign-in is pending returns the same URL. The URL holds no secret and stops working once the sign-in ends (after at most 10 minutes). |
| `needs-authorization` | The attempt ended before an approval URL was ready (for example it was cancelled or refused). Call the tool again. |
| `needs-configuration` | Fix the settings first. `reason` is `client-metadata-url-missing`, `client-metadata-url-invalid`, or `not-a-dsh-connector` (the server is not a `dsh-agent-connector` endpoint). |
| `failed` | `reason` is `discovery-failed` (the server's metadata could not be read) or `authorization-failed`. |
| `unknown-server` | No server of that name is configured. |

Never paste a token into the chat: it is typed only on the approval page.

Before it sends any authorization request, the adapter checks that the server is a
`dsh-agent-connector`: its metadata must name the `/api/agent/mcp` resource, the `/api/agent/oauth`
issuer on the same origin, and the `agent` scope.

Once the grant is stored, the adapter mounts a stock `dsh-mcp-client` row for the server, and its
tools appear. The grant survives a restart of this DSH without a new sign-in. Access tokens are
refreshed before they expire and once after a 401. A refresh before expiry that fails for a passing
reason (network, server error) is tried again after 30 s, then after twice the previous wait each
time, never longer than 5 minutes. If the connector refuses the grant (for example the token was
switched off or deleted), the server returns to `needs-authorization`. The proxy does not follow or
pass on a redirect from the connector: the request fails with 502.

Tokens are kept only in DSH's credential store. They never appear in the settings, the logs, the
tool's result or the chat, and the stock client row never sees them.

## Licence

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
