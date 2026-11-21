# fishball-amenities

An umbrella that installs the optional Fishball amenities together. Each amenity is its own package
and DSH bundle, installable on its own; this package only depends on them and shows a hint on its
settings page.

| Package | What it is |
|---|---|
| [`fishball-board`](../fishball-board/README.md) | Fishball's session-linked work board (shelved, not offered in 1.0.0-alpha.1). |
| [`fishball-heartbeat`](../fishball-heartbeat/README.md) | Keeps Fishball's prompt cache warm while it is idle with useful heartbeat turns; off until both of its settings are set. |
| [`fishball-taskboard`](../fishball-taskboard/README.md) | Fishball's own task board and memo pad, which the user views and edits in the right sidebar's **Task board** tab. |

Installing `fishball-amenities` installs all three and loads them: its dependencies bring the
packages, and its own patch inserts their rows (DSH makes only a profile's direct dependencies
bundles, so an umbrella carries its members' rows, as DSH's own `dsh-cua-bundle` does). Install an
amenity on its own instead and its own patch is used. Do not install the umbrella together with an
amenity as a direct dependency: both would insert the same rows.

Installed through the umbrella, the amenities show as its components on its plugin page; configure
each from its component settings there. Installed alone, each is its own entry in the Plugins list.

Only this umbrella (`client.js`, its settings-page hint) and `fishball-taskboard` (its Task board
tab) have browser code, so only they declare `dsh.client`.
