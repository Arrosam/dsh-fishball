# dsh-connector-shared

An internal library of the DeepSeek Harness (DSH) connector packages. It is **not** a DSH plugin
and has no settings, routes or UI. It ships bundled inside the packages that use it
(`dsh-agent-connector`, `dsh-connector-ui`, `dsh-instance`, `dsh-connector-adapter` and
`dsh-connector-watchdog`), so you never install it yourself.
Its interface may change in any release.

## Exports

| Export | What it holds |
| --- | --- |
| `dsh-connector-shared/redact` | `redact(text)`: masks secret shapes in a diagnostic line before it is logged: the whole value of a credential name (`token`, `key`, `secret`, `password`, `credential` or `authorization` as a word of the name, such as `apiKey`, `access_token`, `X-Api-Key`), whether it is a header, a query parameter, a JSON property or a `key=value` pair, quoted or bare; an `Authorization` header's scheme and credential (Basic, Bearer or any other); a `Bearer` credential; and long opaque runs. `redactContinued(text, carry)` does the same for a text that arrives in whole-line pieces, such as a child's stderr: a credential object or list opened in one piece stays masked in the next ones until it closes. |
| `dsh-connector-shared/request-host` | `requestHostname(request)`: the hostname of a Fetch request's `Host` header, parsed as a WHATWG URL parses it, or `undefined` when the header is missing or malformed. |
| `dsh-connector-shared/live-settings` | `runWithSettings(ctx, config, body)`: runs a row's `body(scope, settings)` as a child plugin with a plain snapshot of its `.volatile()` settings (`settingsSnapshot(config)`), and runs it again after each live settings change (the Loader's `loader/volatile-update`), so a row that computes everything at apply keeps doing so while DSH's settings page edits it. |

All are plain ES modules with no dependencies.

## Compatibility

Node 22 or later. Used by packages for DSH **0.2.1-rc.5** and **0.2.2-rc.1**.

## Install and uninstall

There is nothing to install or remove yourself. The library arrives inside the plugins that bundle
it (`dsh plugin --profile <name> add dsh-agent-connector`, and likewise `dsh-connector-ui` or
`dsh-instance`) and leaves with them (`dsh plugin --profile <name> remove <npm name>`).

## Licence

MIT. See `LICENSE`.
