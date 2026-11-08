# fishball-source-example

A small, read-only DSH plugin using the public APIs shipped in
`fishball-connector@0.1.0-alpha.0` (connector contract **1.1**). The historical example name is
retained, but this is **not a source publisher**: the retired `ctx.fishball.registerSource` API
is not shipped in this release.

- **Install:** install `fishball-connector@0.1.0-alpha.0` in your main DSH profile, then install
  this example folder from DSH's Plugins page using its absolute path and enable its bundle.
  No retired `fishball` package or `fishball-instance` dependency is needed.
- **Use:** enable the connector row. When the connector service becomes available, the example
  calls its public `current()` method and logs either the attached instance's name and id or
  that no instance is attached. If the connector row is disabled or not loaded yet, the example
  waits through optional `ctx.inject` without blocking its own activation.
- **Scope:** this is one snapshot per service activation, not a live attachment-status feed.
  It has no settings, publishes no notes, starts no assistant, and attaches no instance, so it
  does not compete with the built-in instance. There are no delivery or deduplication guarantees
  to demonstrate here.
- **Public API:** imports only `CONNECTOR_SERVICE` from `fishball-connector/contract`, then reads
  `scope[CONNECTOR_SERVICE].current()`. The package version and contract version are independent.

See the [connector contract](../../docs/connector-contract.md#1-binding-the-fishballconnector-service)
for the supported binding and the read-only snapshot fields. The old source-publishing guide does
not describe the APIs shipped in this release.
