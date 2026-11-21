# fishball-core's frozen contracts (test fixture)

The connector's K3 suite cross-checks the host-only service contracts against the Fishball side's
frozen copies, which live in fishball-core's `contracts/` folder. fishball-core moved to the
dsh-fishball repository in the connector split (dsh-fishball commit `6b7c53bf`), so this fixture is
the copy the connector's K3 freeze was written against.

- Source: dsh-fishball `packages/core/contracts` at `6b7c53bf^` (the parent of the split commit).
- Why not the latest file: the K3 data-only freeze only admits declarations plus `constants.js`
  built from frozen data; dsh-fishball's newer `constants.js` (WAKE, 2026-11-21) adds a helper that
  calls `join`, so the connector's frozen reader correctly refuses it. Refresh this fixture from the
  dsh-fishball commit the connector is built against, then re-run `tests/contract/k3-host-services`.
- `test/v3/contract/own-schema` and the K1/K2 "core carries no generated schema" rows are TODO in
  this repository: the fishball-core checks now live with fishball-core.
