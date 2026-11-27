# T-SK — Fishball private Skills: requirements-only test design

**Status: Proposed / Not Run.** Branch `test/v2-skills-cases` from `bf71cef40ad1e0dc5a06191784f1a74fb33ba40f` (`docs/v2-sk-seam`). Assignment: [final scope T-SK row](<../planning/v2-final-scope.md#L156>). Owner of every unrunnable case: **SK** ([scope row](<../planning/v2-final-scope.md#L158>)).

The author is independent of SK. No Fishball implementation was read. Sources were: S1–S8 and UC-25–28/EP-19–22/BVA-12/DT-09/ST-09/10 in `design/core-requirements` at `6392798` (`docs/test-design/core-requirements.md`, lines 248–311 and 337–340, 359, 465–476, 492–493); the [final scope](<../planning/v2-final-scope.md>); the [SK-SEAM report](<../planning/v2-sk-seam.md>); and the immutable installed SDK sources for **0.2.1-rc.5** and **0.2.2-rc.1**. Only `node --check` was run. No product, test, browser, model, network, install or credential operation was run, and `~/.npmrc` was not read.

Techniques used: **Use Case (first), EP, BVA, Decision Table, State Transition**, and no others.

## 0. Requirement contract

### 0.1 User's quoted requirements
1. Fishball's skills are its own lessons.
2. Fishball writes them on its own or on request, with no user approval.
3. It creates and updates them in its own DSH dir; they belong to Fishball only.
4. The user does not need to view them.
5. A dedicated tool may bypass read-only, but only for its own skills dir.
6. Fishball judges anomalies itself.

### 0.2 SK-SEAM decisions (settled by Fishball)
1. A confined native reader rejects escaping symlinks **before reading**. Host watching is off; refresh is explicit only.
2. The Fishball child holds only the Fishball session, so there is no co-resident worker isolation. Workers get skill bodies through Fishball's messages, never through registration or config.
3. Invalidation affects **future** list/load calls and the **next** model catalog. Already-loaded text stays as it is; there is no native menu refresh.
4. A dedicated trusted storage service handles writes, with ownership, confinement and atomic publish, without widening generic permissions.

### 0.3 Fishball answers to this task's questions
| Q | Answer (binding oracle) |
|---|---|
| Q1 | Anything produced only by writing the skills dir **outside** the dedicated tool is "it is what it is". The only oracles are safety rules: an escaping symlink is refused before any read, nothing outside the dir is read or written, and the manager never crashes. |
| Q2 | Removing a `<name>/` that holds extra files is "it is what it is". Assert only that nothing outside `<root>/<name>/` is touched. |
| Q3 | Reject an empty or whitespace-only **body** on create and update, with a clear validation error. |
| Q4 | Reject a whitespace-only **description**: trim it, then require it to be nonempty. The tool is stricter than native on writes; reading stays native. |
| Q5 | I/O or permission failure, concurrency, cancellation before/after commit, and commit-then-refresh failure are real cases. **Concurrency oracle:** both calls settle; the final `SKILL.md` equals exactly one caller's complete write, never torn or mixed; each result is truthful. **Added:** update or remove of a nonexistent name returns a clear not-found and changes nothing. |
| Q6 | DSH bundled/preset skills and child-profile plugin skills **may** be in Fishball's catalog; assert neither presence nor absence. Hard cases: (a) no main-home source appears (`~/.dsh/skills`, `~/.agents/skills`, project `.dsh`/`.agents` skills, main `customSkillDirs`); (b) private skills appear; (c) on a collision, native precedence decides, and a private skill is never silently replaced by a main-home one. |

**Edge-case rule.** Only bypass-UI states are "it is what it is" (Q1). Every failure Fishball itself can hit through the tool is a real case: I/O, permission, conflict, not-found, validation, cancellation, concurrency and refresh failure.

### 0.4 Out of scope / not invented
There is no upper limit on name or body length, no reload deadline, no secret scanner, no duplicate policy, no freshness timer and no semantic winner policy (S8, BVA-12). There are no migration cases. There is no slash-menu live-refresh claim (decision 3). The meow-memory algorithms are out of scope. Power-loss durability is not promised (SK-SEAM §5.2.5).

## 1. Executable layout and how to read it

| Module | Content |
|---|---|
| [sk-uc.test.mjs](<../../test/private-skills/sk-uc.test.mjs>) | Use Cases, all `test.todo` (SK) |
| [sk-ep.test.mjs](<../../test/private-skills/sk-ep.test.mjs>) | EP-19–22 todos + native-oracle premises |
| [sk-bva.test.mjs](<../../test/private-skills/sk-bva.test.mjs>) | BVA-12 and content/catalog-size boundaries + native grammar premises |
| [sk-dt.test.mjs](<../../test/private-skills/sk-dt.test.mjs>) | DT-09 and DT-SK-01–04, all todos |
| [sk-st.test.mjs](<../../test/private-skills/sk-st.test.mjs>) | ST-09/10, ST-SK-11/12 todos + native reread premises |
| [support/](<../../test/private-skills/support/constants.mjs>) | Requirement constants, the [native oracle](<../../test/private-skills/support/native-oracle.mjs>), [fixtures](<../../test/private-skills/support/fixtures.mjs>) |

- **Both SDKs.** Every case, todo or executable, is declared once per version under `[SDK 0.2.1-rc.5]` and `[SDK 0.2.2-rc.1]`. The oracle imports each version's own `@deepseek-ai/dsh-skill` and `@deepseek-ai/dsh-skill-filesystem` from `~/Library/Application Support/DSH/data/versions/<v>/node_modules` (override: `FBTEST_DSH_VERSIONS`). It refuses an install whose `package.json` version does not match.
- **`test.todo` = SK-owned.** Each title is `<id> <oracle> — owner: SK`. These need the dedicated tool, its trusted storage service and the child manager, none of which exists yet.
- **`-N` premises are executable but NOT run here.** They use only the public `isSkillName`, `isModelInvocable` and `FileSystemSkillProvider` (single custom root, `includeDefaultRoots: false`, `watch: false`, no `fs` service) over disposable `/private/tmp/fbtest-private-skills-*` fixtures. They pin what each fixture means natively, so the SK oracles are grounded rather than invented. Without an `fs` service the provider uses the **stock** Node reader, so the escape premises (EP-21-06/07-N) are expected to show that the stock reader *does* follow the link. That fact is the reason for decision 1, not a confinement pass.
- The modules live under `test/private-skills/`, which [test/run.mjs](<../../test/run.mjs>) does not discover (it reads `test/*.test.mjs` only). Running them is a separate, explicit selection: `node --test test/private-skills/*.test.mjs`.

## 2. Use Cases (written first)

| ID | Story / oracle (abridged; full text in module) | Trace |
|---|---|---|
| SK-UC-25-M | Read-only Fishball lists and loads its own skill and messages the worker the **body text**, not a path or name; no approval, no write | S1/S2/S6, UC-25 |
| SK-UC-25-A1 | Main-only skill: not found by Fishball, not imported | S1, Q6a |
| SK-UC-25-A2 | Worker has the same name: handoff carries Fishball's body; the worker's own skill is unchanged | S2 |
| SK-UC-25-E1/E2 | Load not-found / send refused: the real error is reported, nothing resent automatically, no library access granted | S2/S7 |
| SK-UC-26-M/A1 | Autonomous or requested create: no approval card; one complete native file; visible on the next call with no restart | S3/S5/S7 |
| SK-UC-26-A2 | Fishball decides not to save: bytes unchanged, no false success | S8 |
| SK-UC-26-E1 | Invalid content (blank description, empty body) → validation error; a corrected retry succeeds | S6, Q3/Q4 |
| SK-UC-26-E2 | Traversal or absolute name refused whatever Fishball intended | S5 |
| SK-UC-27-M | Update → the next load is new; delivered text is not rewritten | S7, decision 3 |
| SK-UC-27-A1 | Rename = create + remove; no atomic claim; each step reports truthfully | UC-27 |
| SK-UC-27-A2/A3 | Create conflict; update or remove not-found; nothing changes | UC-27, Q5 |
| SK-UC-27-E1/E2 | Remove → no longer resolves; failed update → old version intact, no "catalog changed" claim | S7 |
| SK-UC-28-M/A1 | Pre-commit fault on update/create → clear "not committed"; prior state exact; no leftover | S7, Q5 |
| SK-UC-28-A2 | Commit then refresh failure → distinct outcome; reload converges; retry → conflict, not duplicate | S7, Q5 |
| SK-UC-28-A3 | Cancellation before or after commit is reported truthfully | Q5 |
| SK-UC-28-E1 | Ordinary write/edit/shell on the skills dir is still denied | S4 |
| SK-UC-28-E2 | Concurrent same-name writes → one complete winner; truthful results | Q5 |
| SK-UC-LIFE-M/A1 | Restart/resume keeps the library and re-registers for the manager only; a fresh child gets an empty catalog and the first create makes the root | S1/S7, decision 2 |
| SK-UC-UI-M | No viewer, review or approval card; no slash-menu refresh claim | S3/S8, decision 3 |

## 3. Equivalence partitions

| Family | Partitions (todo ids) | Native premise |
|---|---|---|
| **EP-19 visibility** | own (01); main-home sources (02); main collision (03); bundled/preset/plugin, presence unasserted (04, Q6); absent (05); worker caller (06); worker's own same name (07) | 19-02-N: a single-root composition ignores main homes passed as `dshHome`/`agentsHome` |
| **EP-20 operations and callers** | list (01), read (02), create (03), update (04), remove (05), reload (06); ordinary write route (07); non-manager caller (08); widening attempts (09); path/command/extra-file input (10) | — |
| **EP-21 target and format** | valid (01); absolute (02); traversal (03); sibling prefix (04); separators/aliases (05); escaping file symlink (06); escaping dir symlink (07); no or unclosed front matter (08); missing name/description (09); name mismatch (10); `disable-model-invocation: true` (11); legacy camelCase keys (12); blank description (13, Q4); empty body (14, Q3); non-UTF-8/YAML (15); YAML-significant text round-trip (16); bypass-only shapes, "it is what it is" + safety (17, Q1) | 01-N valid loads exactly; 08-N/09-N ignored; **10-N native does not enforce dir = name**; 11-N model hidden vs visible; 12-N legacy keys unloadable; **13-N/14-N native accepts blank description and empty body** (so Q3/Q4 are tool-only); 16-N quoted round-trip; **06-N/07-N stock reader follows escapes** (fixture validity) |
| **EP-22 outcomes** | committed+refreshed (01); pre-commit failure (02); interrupted/cancelled (03); committed-not-refreshed (04); semantic cases, Fishball decides (05); not-found (06, Q5); conflict (07) | — |

## 4. Boundary values

| Boundary | Values (SK todo; `-N` = native grammar premise) |
|---|---|
| BVA-12 name length | `""` invalid, `a` valid, `ab` valid |
| Separator adjacency | `a-b` valid; `-a`, `a-`, `a--b` invalid |
| Character-class edges | `0`, `9`, `z` valid; `/` (below `0`), `:` (above `9`), `` ` `` (below `a`), `{` (above `z`), `A`, `Z` invalid |
| Description (Q4) | `""` refused; `" "` refused (native would accept); `"a"` accepted; `" a "` accepted (stored spacing unspecified, trimmed equals `a`) |
| Body (Q3) | `""` refused; whitespace only refused; `"x"` accepted |
| Catalog size | 0 (absent or empty root: empty complete catalog, no error); 1 → remove → 0; 2 → remove one → the other is byte-identical |

16 names × (SK todo + native premise), plus 10 content and size todos. No upper bound is tested because none is specified.

## 5. Decision tables

- **DT-09 (R1–R8):** the settled requirement table carried over unchanged (own load; valid create/update; remove; ordinary write or outside target; worker handoff; pre-commit failure; commit + reload failure; semantic judgment).
- **DT-SK-01 caller × route:** manager+tool allowed without approval; manager+ordinary route denied; worker+tool unavailable or refused before I/O; worker+ordinary route has no private catalog; nested dispatch from a worker refused by live-agent identity.
- **DT-SK-02 operation × state × validity (R1–R12):** create absent/present/invalid; update present/absent (not-found)/invalid; remove present/absent (not-found); read present/absent; invalid name refused before filesystem access; reload succeeds on an empty library.
- **DT-SK-03 commit × refresh × delivery (R1–R5):** not committed; committed+ok; committed+refresh failed (distinct); committed+cancelled delivery (kept, reported committed later); refresh failure then reload converges and a retry gets a conflict.
- **DT-SK-04 bypass safety (R1–R5, Q1/Q2):** escaping file or dir symlink refused before read, never written or deleted through; an inside link has only the outside-untouched oracle; extra files on remove → nothing outside `<root>/<name>/`; corrupt, mismatched, non-regular or hardlinked entries → manager and other skills keep working, the entry's own result unspecified.

## 6. State transitions

| Machine | States / transitions | Forbidden |
|---|---|---|
| **ST-09** library lifecycle | Absent →create→ Visible →restart→ Visible →update→ Visible(new) →remove→ Absent →create same name→ Visible(new body) (T1–T5); invalid moves X1: update/remove in Absent → not-found, create in Visible → conflict | pre-write approval; private skill in worker/main catalog; old body called current; removed text called erased |
| **ST-10** failure and recovery | Valid(old) →pre-commit fault→ Valid(old) (T1); Absent →fault→ Absent, no leftover (T2); →commit→ RefreshFailed (T3) →reload ok→ Valid(new) (T4) / →reload fails→ RefreshFailed (T5); cancel → whole old or whole new (T6); concurrent → one complete winner (T7) | torn or mixed publish; outside mutation; ambiguous commit called no-write; semantic winner policy (X1) |
| **ST-SK-11** catalog visibility (decision 3) | mutation → fresh next call and next model step (T1); loaded text unchanged (T2); watcher off, bypass edits only after explicit reload (T3); no wake (T4); no menu-refresh claim (T5); incomplete discovery ≠ success, per SDK (T6) | — |
| **ST-SK-12** manager lifecycle (decision 2) | setup registers manager scope only (T1); disposal releases and fences stale calls (T2); resume registers again exactly once (T3); never in worker, preset or main (T4) | — |

Native premises: **ST-11-T2-N**, a held candidate rereads its file, so a later load sees an update; **ST-09-T4-N**, a removed file no longer loads.

## 7. Dual-SDK notes the SK owner must honour

- Grammar (`SKILL_NAME`) and the front-matter parser are identical across rc.5 and rc.1. So are the registry declarations.
- Discovery failure differs. rc.5 can lose a provider's whole observation on a root failure; rc.1 skips the failing root, warns, and marks the observation incomplete. Both are covered by **SK-ST-11-T6**: an incomplete observation is never a successful reload on either SDK (SK-SEAM E12).

## 8. Counts

Per SDK, declared (all Not Run):

| Group | SK todo | Native premise | Total |
|---|---:|---:|---:|
| Use Case | 25 | 0 | 25 |
| EP | 41 | 12 | 53 |
| BVA | 26 | 16 | 42 |
| Decision Table | 35 | 0 | 35 |
| State Transition | 24 | 2 | 26 |
| **Total per SDK** | **151** | **30** | **181** |
| **Both SDKs** | **302** | **60** | **362** |

Verification performed: `node --check` on all eight modules. Nothing was executed.
