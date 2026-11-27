# fishball-board's tests

The package's own tests (docs/testing/README.md). fishball-board is shelved from 1.0.0-alpha.1
(SHELVE-BOARD, 2026-11-18) but still in this repository and still shipped inside the umbrella; these
rows keep its row-level behaviour pinned. Run them with

```bash
node scripts/test.mjs fishball-board
```

| entry | area | what it covers |
|---|---|---|
| `peers.test.mjs` | [peers/](<peers/cases.mjs>) | FEAT-PEERS: the board without core (`fishball-core-missing`, boot ok, does nothing), with a fake core (its manager setup), the 30-day visibility window and the append-only archive |

## peers

Ported from `test/v3/fishball-board/peers` (2026-11-22, the test restructure). Written from the
requirements R-FB-06 and R-BRD-01/02, the cases PLAT-EP-04 row 1, PLAT-UC-06 and PLAT-BVA-01, and the
contracts (K3 `fishballInstance` apiVersion 1, X1/X2 and §12.6/§12.7 of
[instance-extension-points.md](<../../../dsh-fishball/docs/history/plugins/instance-extension-points.md>)). The values and
their sources are in [peers/constants.mjs](<peers/constants.mjs>). The one K1 word it names
(`unsupported-operation`, the fake attention member's refusal) is restated there with its source, so
these tests need no connector contract.

**Techniques.** Use Cases (PLAT-UC-06 main and A1), Equivalence Partitioning (PLAT-EP-04 row 1, no
core; PEERS-EP-01 row 1, a fake core), Boundary Value Analysis (PLAT-BVA-01 rows 1–3: 29 d 23:59:59,
30 d, 30 d + 1 s since done; archived at exactly 30 d, Q-24). No ST rows (no states to walk). 7 cases.

**How it is observed.** In-process ([peers/world.mjs](<peers/world.mjs>)): the board's real row
(`index.js`, `fishball-test-helpers/bind` `rowModule`) mounted as a loader row of the current DSH
(real cordis, cordis-plugin-loader and dsh-session through `importDsh`), with DSH's `tools` and
`profileContext` as recording fakes and, for the core partition, a fake `fishballInstance`
(apiVersion 1, X1/X2/X8/X9). The clock is node:test's MockTimers on `Date` only. Oracles: "boot ok" is
the row's fiber ACTIVE; "does nothing" is no tool in the global registry and no file under the home;
"visible" is `board_search`'s `onBoard`; "no record deleted" is the archive file only growing.

**Not here.** PEERS-EP-01 row 3 (the board over core's *real* `fishballInstance`) was a todo for
F-WIRE; it needs fishball-core beside the board (an integration row), and no such row is planned while
the board is shelved and binds apiVersion 1 against core's 2 (DESIGN.md, amenities release row). It
was not ported. The board export (PLAT-UC-06 E1/E2) was dropped by the user on 2026-11-15.

**Regression.** No row of this area names a fix commit.

### Case-id index

PLAT-UC-06 (main, A1) · PLAT-EP-04 (row 1) · PEERS-EP-01 (row 1) · PLAT-BVA-01 (rows 1–3).
