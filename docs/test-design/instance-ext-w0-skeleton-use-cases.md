# W0 skeleton use cases — pinned deterministic budget and host-compatible loading

## Authority and boundary

Requirements only: canonical [instance extension design](<../../../design-wd-budget/docs/plugins/instance-extension-points.md>) pinned **`9cafd921be8a8e67f828ab225bf5fe636887c5c5`**, read in full after verifying its HEAD and clean status. §2.8 (lines 404–456) now freezes deterministic measurement, aggregate validation and rollover; §0 U14–U22, §12 and the task rows retain the previously approved stories. Direct follow-up approval keeps exactly EP, BVA, Decision Table, State Transition and Use Case as primary techniques, permits test authoring/reexecution without another sign-off, defers MCP schema freeze to its owners, and selects await for asynchronous manager setup. Canonical decisions override old source wording. FN-1/WD-1/B1 remain local W0 skeletons with no new transport dependency. No product source was read or changed. Existing package-loading support and per-file Cordis stubs are reused; no shared harness changed. Use Cases below are the human stories defined before test edits; executable skeleton observations are not the later live outcomes.

A row `apply` test is a skeleton load, not proof that Samuel's bundle switch, supervision, board, browser or real model loop works. Later journeys are defined below and remain named `it.todo` with their owners. U14 removes approval-time settings, R4 `expiresAt` budgeting and the window-sum test: **WD1-BVA-02 is retired, not blocked**. U15 removes X3 from skeleton stubs; namespace registration belongs to PG-1. U17 removes decision-audit/label retention, not non-decision operational audit. U19 is board **visibility**, not archive pruning.

## Human stories and retained flow IDs

Samuel is the primary actor; Fishball is his assistant. LOAD/CONFIG/BUNDLE IDs are steps beneath human goals, not separate human stories. W0 executable skeleton checks observe package exports, schema/defaults and stub `apply`. Deferred outcomes are requirements predictions, not UI evidence.

## Story 3 — Samuel keeps a busy Fishball conversation manageable (FN-1)

**Everyday trigger:** Samuel returns after other work to a busy Fishball conversation. He wants folded/notification contributions when enabled, sensible defaults, and the option to switch them off without losing his choice on restart.

**Outcome / never happens:** The later feature should make his conversation manageable; disabled contributions must not linger. Skeleton load/schema checks do not prove folding, notifications, attention or persistence.

| Story step | Existing IDs | Evidence / owner |
| --- | --- | --- |
| Start with the plugin available, including an older instance. | FN1-UC-LOAD-M, FN1-UC-LOAD-A | Executable FN-1 stub load. |
| Keep defaults, choose a supported setting, or correct an invalid setting. | FN1-UC-CONFIG-M, FN1-UC-CONFIG-A, FN1-UC-CONFIG-E | Executable schema/default validation; EP/BVA partitions remain independent. |
| Switch the bundle, or encounter unavailable placement. | FN1-UC-BUNDLE-M, FN1-UC-BUNDLE-A, FN1-UC-BUNDLE-E | TODO X0-B; later FN tasks prove contributions. |

### FN1-UC-LOAD — load the row (FN-1, X1/X2)
- Preconditions: installed skeleton, required tools stub, valid empty config.
- M: supply public `fishballInstance`; call `apply`; load completes.
- A: omit the optional service on both context surfaces; load still completes. FN1-EP-V-02 requires `tools`, permits host-compatible runtime public-service lookup, and rejects required `fishballInstance`, literal `fishballInstance?` and internal `fishballChat` injection: Cordis treats `?` literally, never activating such a row.
- Missing package is existing harness diagnostics, not a separately specified recovery flow.

### FN1-UC-CONFIG — choose notification settings (FN-1, X18)
- M: omit settings; defaults are `foldDefault=true`, `systemNotification=when-hidden`, `batchWindowMs=1500`.
- A: accept both valid boolean choices; FN1-EP-02 independently covers notification-policy partitions.
- E: `foldDefault='true'` is rejected. Schema-only checks do not assert persistence/rollback.

### FN1-UC-BUNDLE — switch bundled fold-notify (X0-B, X17/X18)
- Preconditions: disposable child with initialized profile and bundled package, using ordinary DSH plugin management.
- M: first placement enables once; disable then enable restores membership and row loading.
- A: disable survives restart/upgrade; no tool/persona/batcher/presenter/attention contribution; attention resets, seen data stays.
- E: missing/unsafe placement logs `BUNDLED_PLUGIN_UNAVAILABLE`; child starts without this plugin, other placements proceed.
- Postconditions: main profile unchanged; bundled removal is refused `bundled-plugin`. All three are TODO, not W0 evidence.

## Story 4 — Samuel saves Fishball tokens with a small-context helper (WD-1)

**Everyday trigger:** Samuel delegates work and sometimes stays at his desk, sometimes leaves. The watchdog absorbs frequent permission wake-ups and routine supervision in a smaller context in **both** cases; it applies Fishball's existing permission rules, not an extra security layer. Midway Samuel may choose Fishball's direct handling, then deliberately enable the helper again.

**Outcome / never happens:** Routine permission decisions cost less context regardless of Samuel's presence. A request is decided or escalated immediately, not budgeted against a deadline. Turning the helper off **or any detected failure** immediately hands work to Fishball without stopping sessions or erasing briefs. Only enabled **and healthy/ready** is effective on; configured but unregistered/failed is effective off, never a send refusal. Recovery never silently resumes or reclaims kept briefs. Questions and plan reviews always go to Fishball, never watchdog claims/context. W0 proves schema/stub load only, not these live outcomes.

| Story step | Existing IDs | Evidence / owner |
| --- | --- | --- |
| Load the helper with or without the optional instance service. | WD1-UC-LOAD-M, WD1-UC-LOAD-A | Executable WD-1 stub load, not supervision proof. |
| Keep supported defaults, change output budget, or submit an invalid value. | WD1-UC-CONFIG-M, WD1-UC-CONFIG-A, WD1-UC-CONFIG-E | Executable schema checks under U7/U14/U17. |
| Use the helper while present or away; disable it or encounter failed placement. | WD1-UC-BUNDLE-M, WD1-UC-BUNDLE-A, WD1-UC-BUNDLE-E | TODO X0-B/X0-S/WD-13 as below. |
| Re-enable deliberately, or encounter enabled-plugin failure. | WD1-UC-BUNDLE-R, WD1-UC-BUNDLE-F | TODO X0-C/X0-S/WD-13; immediate effective-off handover and dormant recovery, never fault-induced stop or automatic resume. |
| Ask a question or review a plan, optionally refining direction independently. | WD1-UC-QUESTION-M, WD1-UC-QUESTION-A | TODO X0-I/X0-A/WD-3/WD-4/WD-6/WD-10/WD-11/WD-12; questions never reach watchdog claims/context. |
| Rely on immediate decide/escalate without an approval timeout; answer the unlimited user card and later find the result. | WD1-UC-APPROVAL-M; XA-UC-SETTLE-M, XA-UC-HISTORY-M, XA-UC-HISTORY-A | Named W0 WD continuation TODO WD-8/WD-10/K2/PANELS; U17 server DT checks are executable test bodies only. |

### WD1-UC-LOAD — load the helper (WD-1, X1/X2)
- Preconditions: installed skeleton and agents/tools/llm/profileContext stubs, valid empty config.
- M: public instance stub supplied; `apply` completes.
- A: optional service absent; `apply` still completes (older-instance compatibility). WD1-EP-V-02 retains required agents/tools/llm/profileContext, but no required public instance or literal `fishballInstance?`/internal `fishballChat` injection may gate activation. The parent approved this same host-compatibility correction; no extra test body.
- Missing package is harness diagnostics, not a specified product fallback.

### WD1-UC-CONFIG — choose helper settings (WD-1, U7/U14/U17/§2.8)
- M: all **remaining** §9 defaults are declared. `enabled`, `decisionTimeoutSeconds`, `managerReserveSeconds` and `minDecisionSeconds` are absent. The default full Config is valid.
- A: choose `maxOutputTokens=2048` **with `turnGrowthTokens=11009`**, not with incoherent default growth 10000. WD1-BVA-01 independently calls each public numeric field schema at min/max and min−1/max+1; it never promises all independently valid fields can coexist. Fractional numeric budget/byte values are invalid.
- E: `maxOutputTokens=255` is rejected. The aggregate rule is executable W0 Config acceptance, not a freeze TODO: `growth ≥ 3 × ceil(readMaxBytes/3) + 768 + output`. Equality passes. Required companion vectors and primary techniques follow below.
- Postconditions: check timeouts, intentional-pause polling and `guardFailures`/`guardSeconds` health detection remain. Mandatory `guardRestops` assertions stay retired under U20. `auditEntriesKept=2000`, bounds 100–100000, remains **non-decision operational audit**, not decision retention. No approval window sum or R4 deadline is asserted.

#### W0 aggregate acceptance — Samuel saves coherent read/output budgets

| Executable IDs / primary technique | Concrete complete budget overrides (other fields use defaults) | Expected Config result |
| --- | --- | --- |
| WD1-BVA-GROWTH-DEFAULT-9984/9985/9986 / BVA | `readMaxBytes=8192`, output `1024`, growth `9984`, `9985`, `9986` | reject / accept / accept; required growth `9985` |
| WD1-BVA-GROWTH-READ-8190 / BVA | read `8190`, output `1024`; growth `9981/9982/9983` | reject / accept / accept; each read rounds to `2730` |
| WD1-BVA-GROWTH-READ-8191/8192/8193 / BVA | respective read `8191/8192/8193`, output `1024`; each growth `9984/9985/9986` | each reject / accept / accept; each bounded read rounds to `2731` |
| WD1-BVA-GROWTH-READ-8194 / BVA | read `8194`, output `1024`; growth `9987/9988/9989` | reject / accept / accept; each read rounds to `2732` |
| WD1-DT-GROWTH-OUTPUT / Decision Table R1–R4 | read `8192`, output `2048`; growth `10000/11008/11009/11010` | reject / reject / accept / accept |
| WD1-DT-GROWTH-FIELD-VALID / Decision Table R5 | read `1048576`, output `256`, growth `50000` | each field schema accepts independently; full Config rejects: per-read `349526`, required growth `1049602` exceeds allowed maximum `50000` |
| WD1-EP-BUDGET-INTEGER / EP | each of read/output/growth/rollover fractional in isolation, coherent integer companions | reject each fractional field; no coercion |

R1–R4 conditions are the one full-config inequality at the four stated growth values; action is accept/reject. R5 demonstrates that individual field validity is insufficient. Expected thresholds are fixed requirement-derived data, never a test-owned implementation/predicate called to manufacture a pass. Schema parsing is executable now; persisted save rollback is later-owned `WD1-ST-BUDGET-SAVE` (WD-1/WD-12): existing valid growth `10000` → attempted `9984` rejected atomically → stored growth remains `10000` → accepted `9985` replaces it. No public persistence API is invented here.

#### WD1-UC-BUDGET — Samuel keeps the helper small while work continues (later WD-8/WD-10/WD-12)

**Story first:** a permission request arrives, a turn reads evidence and may answer several times, then a later turn may need a new epoch. Samuel never loses an intact request, gets a fault-induced halt, or pays for cumulative/request-duplicate accounting. The deterministic budget is fully specified; these are concrete owner TODOs because canonical measurement/card/rotation APIs and model-window save fixtures are not yet declared, **not** because an oracle needs user approval. No invented import/export or fake model helper is an executable substitute.

- Measurement: RFC 8785 canonical JSON UTF-8 bytes, no Unicode normalization, `T=ceil(bytes/3)` and `T(0)=0`. `WD1-EP-BUDGET-MEASURE` (WD-8/WD-10/WD-12) uses byte lengths `0/1/2/3/4/6/7/9/10` → tokens `0/1/1/1/2/2/3/3/4`: canonical JSON examples `0` (1 byte), `""` (2), `"a"` (3), `"é"` (4), `"😀"` (6), `{"a":0}` (7), `{"a":"é"}` (10). Empty bytes test T only, not a claim that empty input is valid JSON.
- `WD1-EP-BUDGET-CANONICAL` (same owners): `{b:0,a:"é"}` and reverse insertion order both serialize as `{"a":"é","b":0}` = 16 bytes / 6 tokens; `"é"` = 4 bytes / 2 versus decomposed `"é"` (actual `e` + U+0301, not literal backslash escape text) = 5 bytes / 2 stay distinct bytes; `"😀"` = 6 bytes / 2. Do not count JS UTF-16 code units or normalize.
- `WD1-UC-BUDGET-CONTEXT-M` (same owners): the **entire** provider-neutral context contains system instructions, brief/criteria once, tool schemas, digest, retained messages, tool calls/results and proposed input. Later request includes earlier context, but count once per measured request, never sum usage across requests; largest C governs rollover. A turn whose request sizes are `60000` then `63000` keeps its epoch at `R=64000`, not cumulative `123000`; provider-reported usage `1` or `999999` cannot change it. Provider framing/transport headers are excluded. No concrete provider-neutral object schema is invented.

##### Card data / byte BVA (WD-10/WD-12)

Test-described canonical input is `{"arguments":{"text":"<padding>"},"clarification":"c","label":"untrusted","quotes":["é","😀"],"reason":"r","title":"t","tool":"read"}`. Empty padding is **127 UTF-8 bytes** including all braces, keys, quotes, wrappers, multibyte quote contents and clarification. This is test data, not a proposed public card shape; later owners map **all actual declared card fields** before measurement and regenerate padding if their wrapper differs. Existing per-field caps apply first. All payload/evidence must remain intact.

| Actual TODO ID / primary technique | ASCII padding / complete bytes / tokens | Oracle |
| --- | --- | --- |
| WD1-BVA-CARD-2303 / BVA | `a` × `2176` / `2303` / `768` | fits total allowance; otherwise eligible request may use watchdog model |
| WD1-BVA-CARD-2304 / BVA | `a` × `2177` / `2304` / `768` | exact inclusive cap fits |
| WD1-BVA-CARD-2305 / BVA | `a` × `2178` / `2305` / `769` | route intact request immediately to Fishball; zero model calls, truncation or plugin fault |

`WD1-DT-BUDGET-NONREAD` (WD-8/WD-10/WD-12): individually valid fields do not assure a valid total. Complete measured non-read input of `2304` bytes fits; `2305` does not, including all wrappers for card and additions (never add separately serialized fragments while omitting their combined framing). No fresh `768` allowance per quote, clarification, check trigger or calibration. A card that cannot fit goes intact to Fishball without plugin fault; a check that cannot fit causes effective-off hand-over. Read byte caps include result wrappers; brief/criteria already in system are not duplicated.

##### Rollover, growth and output boundaries (all later-owned actual TODOs)

Use growth `10000`, output `1024`, configured rollover `64000`, resolved integer window `200000` unless overridden: `R=min(64000,188976)=64000`. No new model-window setting or Config parameter is specified.

| TODO ID / primary technique / owner | Concrete steps/data | Exact oracle |
| --- | --- | --- |
| WD1-BVA-CONTEXT-MIN / BVA / WD-1, WD-8, WD-12 | windows `27023/27024/27025`, other above companions | save yields R `15999/16000/16001`: reject `model-context-too-small` / accept / accept; accepted save does not waive fresh-epoch checks |
| WD1-ST-BUDGET-ROLLOVER / State Transition / WD-8, WD-12 | largest turn C `63999/64000/64001`, growth/output within allowance; next rebuilt C `1000` | same epoch below; equality/above finish turn then exactly one new epoch before next turn; never binary 65536 threshold or mid-turn rotation |
| WD1-ST-BUDGET-PREFLIGHT / State Transition / WD-8, WD-12 | prior C `63000`; new input or brief revision makes proposed next-turn C `64000/64001`, rebuilt C `1000` | rotate once before dispatch even though prior turn was below R; proposed `63999` keeps epoch |
| WD1-ST-BUDGET-FRESH / State Transition / WD-8, WD-12 | boundary requires new epoch; rebuilt C `63999/64000/64001` | dispatch below; equality/above effective off, no loop/overbudget dispatch/managed stop, claims released, sends pass, recovery dormant; digest has no compacted decision records |
| WD1-BVA-CONTEXT-TURN / BVA / WD-8, WD-10, WD-12 | ceiling `R+growth=74000`, C `73999/74000/74001`; eligible initial C `63999` | ceiling guard alone fits / fits / fails. **Whole-turn conjunction:** growth deltas `10000/10001/10002` mean dispatch / fail / fail; exact ceiling equality does not excuse independent growth violation |
| WD1-BVA-BUDGET-GROWTH / BVA / WD-8, WD-10, WD-12 | turn initial C `63000`, later C `72999/73000/73001`, aggregate output within `1024` | measured growth `9999/10000/10001`: dispatch / dispatch / effective-off failure; same-turn C may exceed R without rotating; check before every request |
| WD1-BVA-BUDGET-OUTPUT / BVA / WD-8, WD-10, WD-12 | canonical response1 `"` + `a`×`1533` + `"` = `1535` bytes / `512` tokens; response2 padding `1531/1534/1537` = bytes `1533/1536/1539`, tokens `511/512/513` | turn sums `1023/1024/1025`: fits / fits / failure before next request or acting on verdict; each response includes tool calls, rounded separately; discriminator: `1535+1537` bytes separately round `512+513=1025` and fail, although wrong combined rounding gives `1024`; provider per-request output cap remains additional |
| WD1-DT-BUDGET-FAILURE / Decision Table / WD-8, WD-9, WD-10, WD-12, X0-S, WD-13 | measurement throws; model window absent/noninteger/unresolvable; provider rejects context; check/non-card shared allowance or growth/output exceeded | each causes whole-plugin effective-off Fishball hand-over, no stop/halt, released claims/passing sends; recovery dormant. Ordinary rollover and oversized individual card are explicitly **not** plugin faults |

No runtime TODO is counted as executed W0 budget evidence. Exact actual card/context fixtures and observations must use later declared interfaces; the fully determined expected values above must not be weakened to match implementation.

### WD1-UC-BUNDLE — switch or recover the helper (X0-B/X0-S/WD-13, U1–U8/U16/U20)
- Preconditions: disposable child, bundled helper, supervised entries, briefs/criteria, operational history, ordinary decision transcripts and watches.
- M: first placement enables; manifest membership is configured enablement regardless of user presence. Enabled but unregistered/not ready is **effective off**: both send paths pass, Fishball owns permissions/supervision. Only verified current-generation readiness activates the brief gate; registration alone is not readiness.
- A: manifest removal precedes disposal; `endingReason` is `hand-over`. Immediately invalidate old generation, remove claims/hooks, re-route open permission cards/held items once, preserve briefs/criteria/history, move entries to `handedOver`, and issue one durable/retryable waking notice when sessions are affected. No stop/halt/unwatch/grace timer; gate off; choice survives restart/upgrade.
- E: enabled package unavailable logs `BUNDLED_PLUGIN_UNAVAILABLE`; child starts, effective-off sends pass. Cause is `plugin-gone`, `endingReason` is `failure`, **same hand-over** and one visible fault notice even with zero affected sessions. Configured enablement stays unchanged.
- R: re-enable/repair verifies model/stores/hooks, persists retained briefs dormant before `ready()`, and never reclaims/checks/resumes them automatically. One recovery notice lists nonempty retained briefs; healthy sends then require explicit resume/new brief. Failure to persist stays effective off; stale generation cannot set/claim/answer.
- F: disposal/reload while manifest remains enabled is `failure`: immediate whole-plugin Fishball hand-over, pass sends and one durable cause/session notice, **no grace or fault-induced stop**. Pending notification retry reuses a stable message identity, including same-home recovery; no lost/duplicate delivery. Storage failure opens gate/routes in memory first, then retries persistence/notification.
- Postconditions: no separate enabled Config or `gateOn` file. M/E TODO X0-B + X0-S; A/R/F TODO X0-S + WD-13 (A also switch path X0-B, F local notice persistence X0-C).

### WD1-UC-QUESTION — Fishball answers independently of the helper (U21)
- M: independent question or plan review arrives for an active or paused claimed session. It goes directly to Fishball and never enters watchdog `onCard`, decision queue, X9 claim or side-session context. Fishball may answer/escalate immediately without a timer.
- A: Fishball separately refines direction with the existing `watchdog_refine` revision contract. Failed refinement never withholds, repeats or undoes the answer. Paused/dormant refinement does not resume/check/claim; an active next turn uses the revised section. Failed/off watchdog has no refine authority; direct Fishball handling continues.
- Ownership: both named TODO **X0-I/X0-A/WD-10/WD-11/WD-12** (A also WD-3/WD-4/WD-6). No external watchdog endpoint or callback-MCP topology.

### WD1-UC-APPROVAL — use the helper without waiting on approval timers (U14/U17)
- M: whether Samuel is present or away, watchdog decides/escalates immediately; if a decision turn ends without an answer, the still-open request escalates at once. Fishball similarly decides/escalates, and the user's card waits without a time limit. There is no R4 `expiresAt` budget or custom fail-safe timer. On resolution the normal tool result returns, cards clear, and only reached-layer ordinary history remains.
- Ownership: one named W0 TODO WD-8/WD-10/K2/PANELS; a never-ending call without a DSH-reported failure is not promised elapsed-time escalation. Detailed completion/invalid/error/crash/cancel paths belong to the later owners, not WD-1 schema coverage.

### XA-UC-SETTLE — Samuel answers an escalated request (U17, K2/PANELS)
- Preconditions: request reached Fishball/user and is still open; Samuel sees the user's card.
- M: Samuel answers; normal requesting-tool result returns. Connector pile, requesting-session, Fishball, user-result and instance cards clear immediately. Repeated callbacks/reload never restore any closed card or retained attribution label.
- Ownership: TODO K2/PANELS for requesting-tool/connector/UI integration, not claimed by W0 server checks.

### XA-UC-HISTORY — Samuel can find a reached decision after continuing work (U17/Q-T)
- M: watchdog-only resolution records only in watchdog history, never automatically in Fishball. Fishball/user resolutions record once at each reached layer; a watchdog merely holding a claim without handling gets no decision copy. User resolution wakes Fishball once; own Fishball decisions add no duplicate note/wake. Attribution is ordinary transcript data, not a label store.
- A: compact reached-layer context; the result leaves context but remains searchable in its transcript. Reload restores neither closed cards nor retained labels. Only an explicit `watchdog_decisions` pull may bring watchdog-only history into Fishball's ordinary tool-result context/transcript, subject to normal compaction.
- Ownership: M TODO PANELS/WD-9/WD-10; A TODO PANELS/WD-8 (explicit pull WD-11). These are defined continuations, not a W0 real-compaction/search claim.
- Related executable server bodies: XA-EP-05 now rejects legacy-label/closed-card restoration or history import; XA-ST-03 clears on repeated settlement; XA-DT-06 proves no automatic Fishball record/wake for watchdog-only resolution; XA-DT-07 checks the reached-user once-only note/wake. Requesting-session actual tool-result delivery remains K2.

## Story 5 — Samuel revisits finished work without losing the board's history (B1)

**Everyday trigger:** Samuel returns to ongoing work, changes context injection or temporarily disables board contributions. Weeks later he wants old completed work by a remembered title/note keyword; he may clear finished clutter early, reopen it, or export history before uninstalling.

**Outcome / never happens:** Open work remains available; Done **and Dropped** remain on board for 30 days inclusive unless cleared early, then stay archived and searchable while installed. The 30-day window never deletes archive records. Reopen restores the open board/context projection; clear refuses unfinished work. Optional uninstall export covers the full archive, not merely current board JSON. W0 schema/load tests do not prove any of this storage/UI behavior.

| Story step | Existing IDs | Evidence / owner |
| --- | --- | --- |
| Load board, including an older instance. | B1-UC-LOAD-M, B1-UC-LOAD-A | Executable B1 load/warning. |
| Keep defaults, change injection, or correct an invalid value. | B1-UC-CONFIG-M, B1-UC-CONFIG-A, B1-UC-CONFIG-E | Executable schema checks. |
| Switch board bundle or encounter failed placement. | B1-UC-BUNDLE-M, B1-UC-BUNDLE-A, B1-UC-BUNDLE-E | TODO X0-B; later board tasks prove contributions. |
| Revisit, clear or reopen completed cards. | B1-UC-HISTORY-M, B1-UC-HISTORY-A, B1-UC-HISTORY-E | TODO B2/B3/B4/B5; B2 owns reopen/clear transitions. |
| Search year-old off-board/cleared work. | B1-UC-SEARCH-M | TODO B11. |
| Export before uninstall, decline, or retry failed export. | B1-UC-UNINSTALL-M, B1-UC-UNINSTALL-A, B1-UC-UNINSTALL-E | TODO B10. |

### B1-UC-LOAD — load board (B1, X1/X2)
- M: installed skeleton, tools stub and public points; `apply` completes.
- A: points absent; load completes and logs exactly one `instance-hooks-missing`. B1-EP-V-02 requires `tools` and permits runtime public-service lookup without required `fishballInstance`, literal `fishballInstance?` or internal `fishballChat` injection. Later tools/context/panel must not be added; W0 observes load/warning only.
- Missing package remains harness diagnostics, not a product recovery promise.

### B1-UC-CONFIG — choose board settings (B1, U19)
- M: required defaults `inject=true`, `contextCards=20`. If `doneWindowHours` is retained, its original 24 default and 0–168 bounds apply **only to the recent-done count**. Tests permit the property to be absent, and never treat it as the visibility cutoff.
- A: both boolean inject choices are accepted.
- E: string `true` is rejected. No schema-only UI/persistence claim.
- B1-BVA-02 is conditional on the retained property, not a requirement to retain/remove it. No arbitrary visibility constant name is asserted; B3/B5 behavioral boundaries below own the 30-day projection.

### B1-UC-BUNDLE — switch board (X0-B, X17/X18)
- M: first placement enables once; disable/re-enable restores bundle and the same saved cards.
- A: disable survives restart/upgrade; no tools/context/panel, data retained.
- E: failed placement logs `BUNDLED_PLUGIN_UNAVAILABLE`; other bundles remain loadable.
- Main profile unchanged; bundled removal still refused. All three TODO X0-B with later board tasks.

### B1-UC-HISTORY — revisit, clear and reopen (B2/B3/B4/B5, §12.6)
- M: for both Done and Dropped, `closedAt` age 30 days−1ms / exactly 30 days / +1ms gives on board / on board / off board. Panel and context share that projection (existing context card/character budgets still apply), and archive retains the final snapshot. No installed-plugin housekeeping prunes history. TODO B2/B3/B5.
- A: clear either closed status early; remove from board/panel/context, keep archive; reopen the off-board id from archive and restore its open group in both projections. TODO B2/B3/B4/B5, using existing status-transition rules.
- E: attempt clear for each open status; refuse `not-closed`, board/archive unchanged. TODO B2/B4.

### B1-UC-SEARCH — find old work (B11, §12.7)
- M: search a title/note keyword from a year-old closed card, including an early-cleared card; `board_search` returns the historical hit without changing visibility. TODO B11. The exact query/filter/limit/refusal partitions belong to B11, not a new W0 executable scope.

### B1-UC-UNINSTALL — keep history before explicit removal (B10, §12.6)
- M: accept export; complete archive, including off-board/cleared history, finishes at a chosen location outside runtime before deletion.
- A: explicitly decline export; runtime including archive is deleted.
- E: export fails; runtime/archive remain for retry or later explicit decline. All three TODO B10. “Never deleted” applies while installed, not explicit uninstall.

## Counting, IDs and verification boundary

Counts are top-level test bodies, not assertions or parameter values. Primary techniques are mutually exclusive; LOAD M/A supply secondary DT present/absent rules without double counting. TODO is a defined deferred journey, never executable W0 proof.

Each cell is **executable / TODO**. Only five primary techniques are used; load/config stories have secondary Decision Table rules but are counted once as Use Case.

| Task | EP | BVA | Decision Table | State Transition | Use Case | Total executable / TODO |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FN-1 | 4 / 0 | 1 / 0 | 0 / 0 | 0 / 0 | 5 / 3 | 10 / 3 |
| WD-1 | 4 / 2 | 9 / 7 | 2 / 2 | 0 / 4 | 5 / 9 | 20 / 24 |
| B1 | 3 / 0 | 2 / 0 | 0 / 0 | 0 / 0 | 5 / 10 | 10 / 10 |
| Skeleton total | 11 / 2 | 12 / 7 | 2 / 2 | 0 / 4 | 15 / 22 | 40 / 37 |

Follow-up deltas (executable / TODO): FN-1 and B1 unchanged in every technique; WD-1 EP **+1/+2**, BVA **+8/+7**, Decision Table **+2/+1** (old aggregate TODO removed), State Transition **0/+4**, Use Case **0/+1**, total **+11/+15**. All three skeletons move from **29/22** to **40/37**. Field/parameter samples are not separate bodies; read-rounding vectors generate five BVA bodies, default-growth vectors three.

B1 has 10 executable bodies; the optional-field BVA asserts retained bounds only when `doneWindowHours` exists. Counts are static body/declared-vector inventory, without executing callbacks or importing product code. This author runs only `node --check` on the three owned test files; the parent owns safe runtime reexecution on both host versions. Missing package remains a legitimate red executable case, never a skip/TODO. X0-A is parent-owned; approval continuations are explanatory stories, not additional cases/counts owned here.

| UC flow group | Executable IDs | Deferred IDs |
| --- | --- | --- |
| FN1-UC-LOAD / CONFIG | LOAD-M/A; CONFIG-M/A/E | — |
| WD1-UC-LOAD / CONFIG | LOAD-M/A; CONFIG-M/A/E | — |
| B1-UC-LOAD / CONFIG | LOAD-M/A; CONFIG-M/A/E | — |
| FN1-UC-BUNDLE | — | M/A/E |
| WD1-UC-BUNDLE | — | M/A/E/R/F |
| WD1-UC-APPROVAL | — | M |
| WD1-UC-QUESTION | — | M/A |
| WD1-UC-BUDGET | — | CONTEXT-M |
| B1-UC-BUNDLE | — | M/A/E |
| B1-UC-HISTORY | — | M/A/E |
| B1-UC-SEARCH | — | M |
| B1-UC-UNINSTALL | — | M/A/E |
| XA-UC-SETTLE | — | M |
| XA-UC-HISTORY | — | M/A |

**ID migration:** all existing FN1/WD1/B1 UC IDs remain. WD1-BVA-02 → **retired by U14**, not renamed/blocked. WD1-EP-01 now also excludes the three removed approval-time settings. B1-BVA-02 → same ID, conditional recent-done-count bounds, never a presence requirement or panel cutoff. XA-EP-05 → same ID, **discard legacy labels/closed/retired**, replacing “load as manager-decided.” XA-ST-03 → same ID, once-only clear/no labels. New executable IDs: XA-DT-06/07. New TODO IDs: WD1-UC-APPROVAL-M, B1-UC-HISTORY-M/A/E, B1-UC-SEARCH-M, B1-UC-UNINSTALL-M/A/E, XA-UC-SETTLE-M, XA-UC-HISTORY-M/A. Previous DT/default/boolean-to-UC aliases in existing titles remain unchanged; reclassification is not extra coverage.

These 3 human stories contain 17 flow-group definitions (15 skeleton groups plus 2 parent-owned approval continuations), 40 defined UC flows = 15 executable + 25 deferred. Skeleton-only totals are 37 UC flows = 15 executable + 22 TODO. WD1-DT-GROWTH is replaced by the concrete executable budget cases; 16 fully specified later-owned budget TODOs include the one additional UC flow, not an unresolved budget freeze. New deferred IDs WD1-UC-QUESTION-M/A cover U21; WD1-UC-BUNDLE-M/E/F replace obsolete enabled-no-owner refusal and fault grace-stop oracles with immediate effective-off behavior. `guardRestops` mandatory assertions are retired, not changed into a new field-removal requirement. [Core use cases](<instance-ext-w0-core-use-cases.md>) owns X0-C inventory independently; K1 and X0-A inventories remain parent-owned. No product, shared harness or parent-owned main test-design doc changes by this author; syntax checks are not runtime passes.

One-way MCP is not a new skeleton feature: external delegated approvals/questions are default-on with no off setting, idle non-polling items wait, first committed outcome wins, and W1 MCP-SERVER removes old control endpoints/exports in the coordinated upgrade with no legacy path. Watchdog `approvalsEnabled` controls its own permission helper only, not an external-delegation off switch. Full transport/settlement tests belong to K1/K2/MCP-SERVER/FB-PUSH and local routing owners, never fabricated FN-1/WD-1/B1 implementation tests.
