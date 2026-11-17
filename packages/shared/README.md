# fishball-shared

The Fishball side's library. It is not a DSH plugin: its manifest
has no `dsh` field, so it has no bundle, row, client or service and never appears on a Plugins page.
It ships inside the tarball of every Fishball-side package that uses it, as a bundled dependency,
so an install fetches nothing from a registry. You never install it by hand.

It holds only modules that at least two Fishball-side packages use: a
module with one user lives in that user. Today that is one module:

- `./ui-seam`: the contract between `fishball-core` and `fishball-ui` (the status words, the
  `fishballInstance.ui` seam), so fishball-ui never imports core.

It imports no other Fishball package. The DSH side has its own library, `dsh-connector-shared`; no module
is shared across the two sides.
