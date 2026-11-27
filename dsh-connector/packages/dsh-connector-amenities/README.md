# dsh-connector-amenities

An umbrella that installs the optional DSH Connector amenities together. Each amenity is its own
package and DSH bundle, installable on its own; this package depends on them and carries their
settings pages.

| Package | Role |
| --- | --- |
| [`dsh-connector-adapter`](../dsh-connector-adapter/README.md) | Lets this DSH sign in to another DSH's connector through DSH's stock MCP client. |
| [`dsh-connector-watchdog`](../dsh-connector-watchdog/README.md) | Supervises a managed session for its managing agent and answers its in-scope permission requests. |

Installing `dsh-connector-amenities` installs both and loads them: its dependencies bring the
packages, and its own patch inserts their rows (DSH makes only a profile's direct dependencies
bundles, so an umbrella carries its members' rows, as DSH's own `dsh-cua-bundle` does). Install
an amenity on its own instead and its own patch is used. Do not install the umbrella together with
an amenity as a direct dependency: both would insert the same rows.

Installed through the umbrella, the amenities show as its components on its plugin page. Open
`dsh-connector-adapter` or `dsh-connector-watchdog` there (the arrow beside its name) to configure
it. A saved change applies at once: the amenity re-applies itself with the new values, without a
DSH restart, and the value is kept in the profile's `cordis.patch.yml`. `preset-watchdog` is
DSH's agent preset row and has no settings.

- **dsh-connector-watchdog:** Watchdog's own model selector (unset by default, which disables Watchdog until a model is chosen; saved immediately on selection), plus the patrol interval and the judgement's read and time bounds, each a whole number within its range.
- **dsh-connector-adapter:** the client metadata URL, and the connectors to sign in to: a list of
  a server name and its MCP URL (Add, Remove, then Save the list). The list is checked before it
  is saved: each server name once, and each URL https, or http on this computer only (`localhost`,
  `127.0.0.1`, `[::1]`).

Known limits:
- The pages are this umbrella's (`client.js`); the amenities have no browser code. Installed alone,
  without the umbrella, an amenity has no settings page: edit its row's `config` in the profile's
  `cordis.patch.yml` instead.
- A change the page cannot check but the amenity refuses when it applies it (for example a
  connector list the adapter cannot start with) fails the amenity's row, as it did before the
  pages existed. A failed row has no settings page, so fix that value in `cordis.patch.yml`.

Only this umbrella has browser code (`client.js`: the settings-page hint and its amenities'
settings pages); the amenities have none.

## Structure

```
packages/dsh-connector-amenities/
  index.js          the umbrella's own row (no behaviour)
  client.js         the settings-page hint and the members' settings pages
  cordis.patch.yml  inserts the umbrella's row and its members' rows
  assets/           the icon
  tests/            the package's suites
```

## Testing

```bash
npm test --workspace dsh-connector-amenities
```

| `tests/` folder | What it checks |
| --- | --- |
| `settings-page` | The members' settings pages (`client.js`) in a scripted Plugins page served by DSH's own settings service: entries, fields and bounds, the adapter's list rules, Save, read-only and unavailable states, the manifests ([use cases](<tests/settings-page/USE-CASES.md>)). |

Its icon is checked with the others in
[`integration/package-icons`](<../../integration/package-icons/README.md>), before a release. See
[the testing guide](<../../docs/testing/README.md>).

