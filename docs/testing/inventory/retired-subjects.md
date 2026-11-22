# Old-test behaviour inventory: retired-subjects

Generated from the baseline run of `integrate/2026-11-22-fixes` (0377153f) on DSH 0.2.1-rc.5 and 0.2.2-rc.1, before the restructure.
One row per case id of an old suite: the number of distinct behaviours (test names, SDK folded) it registered,
their baseline results, and one sample title. **Where now** is filled in by the port: the new test file, or
`retired: <reason>` (withdrawn, todo placeholder, subject moved to another repository), or `bug: <report id>`.

## test/e1-card-titles

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| CT-BVA-01 | 2 | fail 2 | E1 the Plugins card titles come from the exported locale files > CT-BVA-01 the connector titles are non-empty, trimmed and not the package name |  |
| CT-DT-01 | 2 | fail 2 | E1 the Plugins card titles come from the exported locale files > CT-DT-01 the connector manifest exports the locale path DSH reads |  |
| CT-DT-02 | 2 | fail 2 | E1 the Plugins card titles come from the exported locale files > CT-DT-02 the connector tarball ships the locale files |  |
| CT-EP-01 | 1 | fail 1 | E1 the Plugins card titles come from the exported locale files > CT-EP-01 the connector card is titled "Fishball connector" in en |  |
| CT-EP-02 | 1 | fail 1 | E1 the Plugins card titles come from the exported locale files > CT-EP-02 the instance card is titled "Fishball instance" in en |  |
| CT-EP-03 | 1 | fail 1 | E1 the Plugins card titles come from the exported locale files > CT-EP-03 the connector card is titled "Fishball 连接器" in zh |  |
| CT-EP-04 | 1 | fail 1 | E1 the Plugins card titles come from the exported locale files > CT-EP-04 the instance card is titled "Fishball 实例" in zh |  |
| CT-EP-05 | 2 | fail 2 | E1 the Plugins card titles come from the exported locale files > CT-EP-05 the connector title is localized |  |
| CT-EP-06 | 1 | fail 1 | E1 the Plugins card titles come from the exported locale files > CT-EP-06 the two cards are distinct and neither is just "Fishball" |  |

## test/e1-d2-invalid-main-home

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| D2-BVA-01 | 1 | fail 1 | D2 a symlinked DSH home is reported as INVALID_MAIN_HOME > D2-BVA-01 the same home reached by its real path does start |  |
| D2-DT-01 | 1 | fail 1 | D2 a symlinked DSH home is reported as INVALID_MAIN_HOME > D2-DT-01 the status names the canonical-path refusal, and no child starts |  |
| D2-EP-01/02 | 1 | fail 1 | D2 a symlinked DSH home is reported as INVALID_MAIN_HOME > D2-EP-01/02 the card explains the requirement in English and Chinese |  |

## test/provider-sync-official

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| PS-F01 | 1 | pass 1 | PS-F01 official disposable provider round-trip uses owner-only persistence without exporting a key |  |
| PS-F02 | 1 | pass 1 | PS-F02 official locked modifyRecord preserves existing records and admits only one concurrent insertion |  |

## test/runtime-isolation-boundary

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| rc.3 | 1 | skip 1 | rc.3 public runtime isolation boundary (not Fishball migration acceptance) |  |

## test/runtime-isolation-transport

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| public | 1 | skip 1 | public rc.3 private gateway transport boundary |  |
