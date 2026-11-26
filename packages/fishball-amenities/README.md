# fishball-amenities

The collection installs the optional Fishball amenities together. Each member is its own package
and DSH bundle and can be installed on its own instead.

| Package | What it is |
|---|---|
| [fishball-board](../fishball-board/README.md) | Fishball's session-linked work board (shelved, not offered in 1.0.0-alpha.1). |
| [fishball-heartbeat](../fishball-heartbeat/README.md) | Keeps Fishball's prompt cache warm when idle; off until both timer settings are set. |
| [fishball-taskboard](../fishball-taskboard/README.md) | Fishball's task board and memo pad in the right sidebar. |
| [fishball-consultant](../fishball-consultant/README.md) | Advisory-only second opinions. Configuration and threads are available; no consultation is sent without a proven protected connector capability. |

The collection's dependencies supply its members and its patch inserts their rows. A member
installed alone uses its own patch. Use one installation source per member: do not install a
standalone member alongside the collection that provides its row.

Under the collection's components, configure the Heartbeat or Consultant row. Consultant also
supplies its own settings when installed alone. Heartbeat installed alone can be configured in its
profile row's `cordis.patch.yml`. Board and Taskboard do not have settings pages.

To remove Consultant while keeping the collection, **disable its row**. Its bundled code is still
installed. This Fishball build does not support physically removing a bundled member. A standalone
Consultant package can be uninstalled through DSH; this does not erase history, installation source
or caches. Archive live consultations first and verify the target's receipt before removal.
