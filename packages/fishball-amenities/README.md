# fishball-amenities

An umbrella that installs the optional Fishball amenities together. Each amenity is its own package
and DSH bundle, installable on its own; this package depends on them and carries their settings
pages.

| Package | What it is |
|---|---|
| [`fishball-board`](../fishball-board/README.md) | Fishball's session-linked work board (shelved, not offered in 1.0.0-alpha.1). |
| [`fishball-heartbeat`](../fishball-heartbeat/README.md) | Keeps Fishball's prompt cache warm while it is idle with useful heartbeat turns; off until both of its timer settings are set; when it stops, it compacts a long context once. |
| [`fishball-taskboard`](../fishball-taskboard/README.md) | Fishball's own task board and memo pad, which the user views and edits in the right sidebar's **Task board** tab. |

Installing `fishball-amenities` installs all three and loads them: its dependencies bring the
packages, and its own patch inserts their rows (DSH makes only a profile's direct dependencies
bundles, so an umbrella carries its members' rows, as DSH's own `dsh-cua-bundle` does). Install an
amenity on its own instead and its own patch is used. Do not install the umbrella together with an
amenity as a direct dependency: both would insert the same rows.

Installed through the umbrella, the amenities show as its components on its plugin page. Open
`fishball-heartbeat` there (the arrow beside its name) to set its two settings. A saved change
applies at once: the heartbeat re-applies itself with the new values, without a DSH restart, and
the values are kept in the profile's `cordis.patch.yml`. `fishball-board` and
`fishball-taskboard` have no settings page: the taskboard has no settings, and the board's settings
(`inject`, `contextCards`, `doneWindowHours`) are read by nothing yet, so they are not offered.

Known limit: the pages are this umbrella's (`client.js`); the amenities have no browser code.
Installed alone, without the umbrella, `fishball-heartbeat` has no settings page: edit its row's
`config` in the profile's `cordis.patch.yml` instead.

Only this umbrella (`client.js`: the settings-page hint and the heartbeat's settings page) and
`fishball-taskboard` (its Task board tab) have browser code, so only they declare `dsh.client`.
