# dsh-connector-shared

An internal library of the DeepSeek Harness (DSH) connector packages. It is **not** a DSH plugin
and has no settings, routes or UI. It ships bundled inside the packages that use it
(`dsh-agent-connector`, `dsh-connector-ui` and `dsh-instance`), so you never install it yourself.
Its interface may change in any release.

## Exports

| Export | What it holds |
| --- | --- |
| `dsh-connector-shared/redact` | `redact(text)`: masks secret shapes in a diagnostic line before it is logged: the whole value of a credential name (`token`, `key`, `secret`, `password`, `credential` or `authorization` as a word of the name, such as `apiKey`, `access_token`, `X-Api-Key`), whether it is a header, a query parameter, a JSON property or a `key=value` pair, quoted or bare; an `Authorization` header's scheme and credential (Basic, Bearer or any other); a `Bearer` credential; and long opaque runs. |
| `dsh-connector-shared/request-host` | `requestHostname(request)`: the hostname of a Fetch request's `Host` header, parsed as a WHATWG URL parses it, or `undefined` when the header is missing or malformed. |

Both are plain ES modules with no dependencies.

## Compatibility

Node 22 or later. Used by packages for DSH **0.2.1-rc.5** and **0.2.2-rc.1**.

## Install and uninstall

There is nothing to install or remove yourself. The library arrives inside the plugins that bundle
it (`dsh plugin --profile <name> add dsh-agent-connector`, and likewise `dsh-connector-ui` or
`dsh-instance`) and leaves with them (`dsh plugin --profile <name> remove <npm name>`).

## Licence

MIT. See `LICENSE`.
