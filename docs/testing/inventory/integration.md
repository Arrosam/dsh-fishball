# Old-test behaviour inventory: integration

Generated from the baseline run of `integrate/2026-11-22-fixes` (0377153f) on DSH 0.2.1-rc.5 and 0.2.2-rc.1, before the restructure.
One row per case id of an old suite: the number of distinct behaviours (test names, SDK folded) it registered,
their baseline results, and one sample title. **Where now** is filled in by the port: the new test file, or
`retired: <reason>` (withdrawn, todo placeholder, subject moved to another repository), or `bug: <report id>`.

## test/v3/contract/package-boundaries

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| CP-R1-01 | 1 | pass 1 | CP-R1-01 mode no launch overlay |  |
| CP-R1-02 | 1 | pass 1 | CP-R1-02 mode one overlay inserting dsh-instance-child |  |
| CP-R1-03 | 1 | pass 1 | CP-R1-03 mode an overlay inserting only an unrelated row |  |
| CP-R1-04 | 1 | pass 1 | CP-R1-04 mode the child row among other inserted rows |  |
| CP-R1-05 | 1 | pass 1 | CP-R1-05 mode two overlay files, the second inserts the child row |  |
| CP-R1-06 | 1 | pass 1 | CP-R1-06 mode an overlay file with no patch |  |
| CP-R3-03 | 1 | pass 1 | CP-R3-03 on Installed another contributed tab present: only Discover hides |  |
| CP-R3-04 | 1 | pass 1 | CP-R3-04 on the other tab another contributed tab present: only Discover hides |  |
| CP-R3-05 | 1 | pass 1 | CP-R3-05 on Discover another contributed tab present: only Discover hides |  |
| CP-R3-06 | 1 | pass 1 | CP-R3-06 Discover last another contributed tab present: only Discover hides |  |
| CP-R3-07 | 1 | pass 1 | CP-R3-07 three extra tabs another contributed tab present: only Discover hides |  |
| K3a-MULTI-SEC-ST | 5 | pass 5 | K3a-MULTI-SEC-ST cold restart a cold restart cannot rebind a stale fixed parent reference to a new endpoint epoch |  |
