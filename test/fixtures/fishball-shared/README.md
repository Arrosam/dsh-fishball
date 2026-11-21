# fishball-shared's frozen seam (test fixture)

`ui-seam.js` is fishball-shared's frozen core/ui seam (requirements 1.38, 1.41; design §1.0). It is
imported by the copied fishball-core oracles under `test/v3/fishball-core/` that the connector's UI
suites use for target and status vocabulary.

- Source: dsh-fishball `packages/shared/ui-seam.js` at the split point (see
  `../fishball-core/README.md`); it is data-only and imports nothing.
- Refresh it together with the fishball-core contracts fixture.
