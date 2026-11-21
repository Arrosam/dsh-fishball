# fishball-shared

The Fishball side's library. It is not a DSH plugin: its manifest
has no `dsh` field, so it has no bundle, row, client or service and never appears on a Plugins page.
It ships inside the tarball of every Fishball-side package that uses it, as a bundled dependency,
so an install fetches nothing from a registry. You never install it by hand.

It holds only modules that at least two Fishball-side packages use: a
module with one user lives in that user. Today there are two:

- `./ui-seam`: the contract between `fishball-core` and `fishball-ui` (the status words, the
  `fishballInstance.ui` seam, and since MULTI-0 the target list `SEAM_TARGETS`), so fishball-ui never imports core.
- `./instance-follower`: `followInstance` and `reportCoreMissing`, how each Fishball amenity
  (`fishball-board`, `fishball-heartbeat`, `fishball-taskboard`) binds to a compatible
  `fishballInstance` and reports a missing core once. It was `board/src/instance.js` inside
  `fishball-amenities` until the amenities became their own packages (2026-11-21).

It imports no other Fishball package. The DSH side has its own library, `dsh-connector-shared`; no module
is shared across the two sides.
