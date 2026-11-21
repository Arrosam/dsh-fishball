# fishball-taskboard

Fishball's own task board and memo pad: tasks with subtasks, status and progress, not linked to sessions. The user views and edits it in the right sidebar's **Task board** tab, and each save wakes Fishball with what changed. See [the design](../../docs/plugins/fishball-taskboard.md).

Install it on its own, or with the other amenities through the [`fishball-amenities`](../fishball-amenities/README.md) umbrella. Its routes and tab work without `fishball-core`; its tools and the compaction reminder need core in the same DSH. It is the only amenity with browser code (`client.js`).
