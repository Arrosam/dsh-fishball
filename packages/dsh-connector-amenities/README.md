# dsh-connector-amenities

An umbrella that installs the optional DSH Connector amenities together. Each amenity is its own
package and DSH bundle, installable on its own; this package only depends on them and shows a hint
on its settings page.

| Package | Role |
| --- | --- |
| [`dsh-connector-adapter`](../dsh-connector-adapter/README.md) | Lets this DSH sign in to another DSH's connector through DSH's stock MCP client. |
| [`dsh-connector-watchdog`](../dsh-connector-watchdog/README.md) | Supervises a managed session for its managing agent and answers its in-scope permission requests. |

Installing `dsh-connector-amenities` installs both and loads them: its dependencies bring the
packages, and its own patch inserts their rows (DSH makes only a profile's direct dependencies
bundles, so an umbrella carries its members' rows, as DSH's own `dsh-cua-bundle` does). Install
an amenity on its own instead and its own patch is used. Do not install the umbrella together with
an amenity as a direct dependency: both would insert the same rows.

Installed through the umbrella, the amenities show as its components on its plugin page; configure
each from its component settings there. Installed alone, each is its own entry in the Plugins list.

Only this umbrella has browser code (`client.js`, its settings-page hint); the amenities have none.
