# T-RP: V2 native recommendation tab — independent requirements-only cases

**Requirements-only delivery; not an approved or executed Test Plan.** Worktree `test/v2-recommend-cases`, base `cd87106f3bc761d68c6e919e83ffd40ac8e86262`. The independent case author read only requirements/design documents; a separate static dual-SDK audit supplied public-contract evidence. No Fishball implementation, existing tests, live profiles or credentials were inspected; no product, browser, network, install or model operation was run. All product cases below are **Not Run**, registered as real `test.todo` calls, without callbacks or a runnable product adapter. *(Authoring-time state; superseded by the RP execution in §10 and the statuses in §7.)*

## 1. Use Cases FIRST

### UC-01 — Browse the child's curated recommendations (TC-01–03, TC-15–17)

- **Actor:** user of a fresh/V2-only Fishball child; main DSH user for the isolation alternative.
- **Preconditions:** final native child composition is ready; native Plugins remains reachable; locale is `en` or `zh`.
- **Main flow:** open child Plugins → select `fishball-recommended` → see **Fishball Recommended** in English or **Fishball 推荐** in Chinese → browse the fixed curated categories/entries → inspect the meow-memory note and empty Pet category.
- **Alternatives:** open main DSH Plugins: no recommendation tab. Switch to the other supported locale: stable id and curated structure remain; localized resources render. Installed rows still carry the meow-memory note. Pet stays empty with a note that does not claim the native child lacks a browser part.
- **Observable result:** child-only native tab, curated—not market-derived—content, existing native tabs intact. No exact-copy snapshots except the frozen tab id/labels.

### UC-02 — Explicitly install a recommendation using DSH (TC-04, TC-07–13, TC-22)

- **Actor:** user; DSH's native install UI and child plugin manager are supporting actors.
- **Preconditions:** curated package absent from child; reviewed local fixture pack available to the later verifier; supported curated-spec → native confirmed-target seam proven on the selected SDK.
- **Main flow:** choose the row's Install → satisfy native target/confirmation requirements through a reviewed supported seam → native check/progress/result → reconcile authoritative child bundle presence. The documented owner `install` accepts an **already-confirmed** target/version, then opens check/progress without a spec form; how curated data reaches that confirmed target is an RP proof gate, not an invented extra confirmation screen.
- **Alternatives:** main-only presence still offers child Install; native check failure; package failure leaving no bundle; application failure leaving a bundle; confirmed cancellation where native supports it; lost/unconfirmed outcome; second rapid action while native pending. These are acceptance obligations, not accepted limitations.
- **Observable result:** native outcomes and actual presence, no Fishball retry/rollback protocol, legacy custom install path or model turn. Native internal reconciliation, cancellation races and fallback remain permitted. Failure does not imply absent; cancellation does not promise rollback; applying need not be cancellable. Exact confirmation UX is not invented here.

### UC-03 — Recognize actual child installations (TC-05–07, TC-10, TC-18, TC-23–24, TC-29)

- **Actor:** user managing child plugins through native DSH.
- **Preconditions:** a curated package can be listed by the authoritative child bundle inventory.
- **Main flow:** observe a child-present package → show localized Installed with no Install → disable it using native Installed controls → revisit: still Installed → remove natively → revisit: Install → explicitly reinstall.
- **Alternatives:** enabled versus disabled presence gives the same recommendation state; main-only package does not count; two **distinct** installed recommendations affect only their own rows; native error and Installed may coexist when a dependency remains.
- **Observable result:** child bundle presence—not enablement, main inventory, an install return value or legacy shared-runtime scope—determines Installed.

### UC-04 — Re-enter, dispose and resume the client safely (TC-19, TC-25–28, TC-34)

- **Actor:** user opening/leaving/reloading the child view; native slot/lifecycle owner.
- **Preconditions:** instance-owned child contribution active; controllable native operation for pending coverage.
- **Main flow:** open and re-enter the recommendation view → retain one live contribution → begin native install → leave/reload to dispose old client → allow native work to finish → reopen and obtain current inventory.
- **Alternatives:** repeated same-id activation uses supported native replacement/lifecycle semantics, not an invented duplicate-id error; dispose twice removes each owned subscription once; generation A callbacks arriving after generation B activates cannot update old or replacement UI.
- **Observable result:** native pending/dedup only, no competing Fishball lock/retry policy, no stale updates or leaked owned subscriptions. Disposal does **not** require cancelling a native install that may finish.

### UC-05 — Return through allowed native destinations (TC-14)

- **Actor:** Fishball user.
- **Preconditions:** LITE/SET/RP integrated; explicit allowed navigation available.
- **Main flow:** Fishball → native Settings → native Plugins → recommendation tab → explicit Fishball return; repeat in `en` and `zh`.
- **Alternatives:** repeat navigation/re-entry without new session or duplicate contribution.
- **Observable result:** same Fishball session returns, native Settings/Plugins remain accessible. No corrective navigation or archive fallback. Package-detail Back-to-calling-tab is **not** a common dual-SDK requirement.

### UC-06 — Deliver fixed data as owned V2 composition, not bundles (TC-20–21, TC-30–32)

- **Actor:** RP developer through a reviewed public test seam; BOUNDARY/INTEGRATE release verifier.
- **Preconditions:** proposed final connector/instance artifacts; fresh/V2-only child; selected SDK recorded.
- **Main flow:** validate actual shipped instance-owned curated constants → integrate child module through supported native root/list slot → inspect proposed artifacts/loader composition → start with no manually installed recommendations.
- **Alternatives:** unrelated market suggestions must not become curated rows; unsupported confirmed-target or inventory seam is an RP engineering gate, not permission to fork DSH or invent a custom installer.
- **Observable result:** one owned child asset; no standalone recommendation package/placement, automatic recommendation installs, deferred plugin payloads or startup prerequisites. The sole shipped-data unit case tests **product data**, never this test catalogue.

## 2. Numbered acceptance criteria and authoritative sources

Precedence: current direct user instructions and **user/Fishball decisions relayed by the parent on 2026-11-10** → final V2 scope → retained native extension requirements → unchanged curated-list structure. The relay closes the previously unanswered list/note/failure/duplicate/runtime-data questions; it is attributed, not represented as an edit to approved design documents.

| AC | Observable acceptance criterion | Requirement source |
|---|---|---|
| AC1 | Child-only `plugins.tab` id `fishball-recommended`; exact en **Fishball Recommended**, zh **Fishball 推荐**; absent from main. | [Final scope, scope contract](<../planning/v2-final-scope.md#L9-L20>), [T-RP/RP tasks](<../planning/v2-final-scope.md#L152-L153>), [extension §11.9 retained tab contract](<../plugins/instance-extension-points.md#L1505-L1508>). |
| AC2 | Fixed instance-owned curated data, not market index; category/entry ids, order, highlight flag and per-category empty-note layout validated structurally, not exact prose. Context/Memory highlights must not depend on V3 features. Pet empty; stale no-browser-part copy must be rewritten. | [Curated source decision inst-OQ-17](<../slim-native-design.md#L2502>), [list/layout](<../../DESIGN.md#L1281-L1326>), parent relay decision 1/6. |
| AC3 | A child bundle of the listed name means Installed, enabled **or disabled**. Child absence means Install even if main has it. No legacy On/Turn-on-for-Fishball states. | [Extension presence rule](<../plugins/instance-extension-points.md#L1505-L1508>), parent relay decision 3; supersedes [historical shared-runtime statuses](<../../DESIGN.md#L1295-L1308>). |
| AC4 | Install follows native DSH into child for the curated spec via a reviewed supported target/confirmation seam (or approved supported native alternative). Owner `install` takes an already-confirmed target/version before native check/progress; the prior confirmation/version-selection seam remains unproven. Approved local pack for later tests; no old custom install route, marker/model turn or invented confirmation UX. Main unaffected. | [Native install requirement](<../plugins/instance-extension-points.md#L1505-L1512>), [inst-OQ-17](<../slim-native-design.md#L2502>), parent relay decisions 3/4 and static SDK audit. |
| AC5 | Present native error/result and actual installed state independently; no Fishball-added retry/custom rollback/model turn. Native reconciliation/fallback allowed; confirmed cancel only as native supports; unknown is not success. Failure may leave a present bundle. | [Native error expectation](<../plugins/instance-extension-points.md#L1005-L1013>), parent relay decision 4 and SDK native-outcome clarification. |
| AC6 | UI-reachable repeated actions obey native pending/unconfirmed/dedup semantics only; do not introduce stronger custom locks or auto-retry. | [T-RP duplicate obligation](<../planning/v2-final-scope.md#L152>), parent relay decision 5 and SDK pending audit. |
| AC7 | One live owned contribution; owned subscriptions removed once on dispose, repeated disposal inert, no stale-generation UI updates. Native install may finish after disposal. | [T-RP disposal obligation](<../planning/v2-final-scope.md#L152>), parent relay decision 5 and native slot lifecycle audit. |
| AC8 | meow-memory note has nonempty en/zh resources and explains optional external memory recommended because V2 has no built-in memory, **no board link**. No prose pinning; no V3-dependent promises. | [Note presentation obligation](<../planning/v2-final-scope.md#L152-L153>), [retained note-key requirement](<../../DESIGN.md#L1312>), parent relay decisions 1/2. |
| AC9 | Recommendation is instance-owned child client asset, not separately packaged/placed plugin. No auto-bundled recommendations; no V2 board/Watchdog/fold/MCP feature gate or payload/startup dependency. Fresh/V2-only, no migration. | [Final scope](<../planning/v2-final-scope.md#L15-L20>), [artifact boundary](<../planning/v2-final-scope.md#L54-L56>), [delivery decision](<../planning/v2-final-scope.md#L291-L296>). |
| AC10 | Native Settings/Plugins allowed, explicit return to same Fishball; no corrective navigation/archive fallback. | [LITE/SET tasks](<../planning/v2-final-scope.md#L151-L154>), [native return requirement](<../plugins/instance-extension-points.md#L1001-L1004>). |
| AC11 | Reuse supported native root/list contribution/install seams and preserve other native tabs. No DSH fork or fictional recommendation-plugin enable/disable table. Do not assume a global runtime installer or arbitrary raw-entry invocation is public: owner props are documented; other supported native alternatives need RP proof. Native ordering after Installed; no fixed order relative to Marketplace/Discover. | [Native mechanism](<../plugins/instance-extension-points.md#L1482-L1491>), [current RP allocation](<../planning/v2-final-scope.md#L153>), parent SDK audit. |

**Authoritative curated identities:** category order Context management, Memory, Channel, Pet; counts **3 / 3 / 4 / 0**. The catalogue's `context`, `memory`, `channel`, `pet` are **test category aliases**, not assertions about undocumented product serialized enum values. Context: `dsh-idle-compact`, `dsh-plugin-save-token`, `smart-compaction`; Memory: `meow-memory`, `@a9i5k4/dsh-auto-memory`, `@zilliz/memsearch-dsh`; Channel: `@michengai/dsh-im-connect`, `dsh-telegram-notify`, `dsh-plugin-discord`, `dsh-dingtalk-channel`. Context and Memory highlighted, Channel/Pet not. Historical checked versions in [the list](<../../DESIGN.md#L1314-L1326>) are **not** new install pins. Copy/resources live in product-owned constants; tests check structure, presence and stated semantics, not exact sentences.

**Superseded, not gates:** [extension standalone-package/placement proposal](<../plugins/instance-extension-points.md#L1500-L1504>), [standalone enable/disable test proposal](<../plugins/instance-extension-points.md#L1011-L1012>), [old settings placement/status/custom dialog](<../../DESIGN.md#L1290-L1310>), stale Pet no-browser-part wording, welcome-card behavior and all migration/deferred-feature execution. Historical custom confirmation-step order, private shared-runtime installation folder and automatic Fishball-scope enablement are not native V2 oracles. Child-native profile changes follow DSH; **main** must stay unchanged. No edits to those design/plan documents are made by T-RP.

### Dual-SDK public-seam evidence (parent's static audit, not a read/run by this author)

| Contract / limit | 0.2.1-rc.5 | 0.2.2-rc.1 | Consequence |
|---|---|---|---|
| Documented root/list `plugins.tab` | [manager README:101](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/README.md#L101>) | [manager README:119](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/README.md#L119>) | Use native slot; do not assert fixed order between other contributed tabs. |
| Owner props include install of confirmed `spec`, `title`, exact `version` (+ optional registry), not inventory/completion | [slot contract:80–127](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts#L80-L127>) | [slot contract:80–127](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts#L80-L127>) | RP must prove confirmed-target and authoritative inventory seams separately; no optimistic completion assumption. |
| Injection/unload disposal; entries are render-erased | [registry:96–111](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/types/client/registry.d.ts#L96-L111>), [159–174](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/types/client/registry.d.ts#L159-L174>) | [registry:96–111](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/types/client/registry.d.ts#L96-L111>), [159–174](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/types/client/registry.d.ts#L159-L174>) | One active same-id contribution, not a mandated duplicate rejection. Raw entry lookup/invocation as an external installer seam is unproven, not established impossible. |
| Native pending, cancellation and unknown outcome protocol | [README:57–61](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/README.md#L57-L61>), [172–178](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/README.md#L172-L178>) | [README:65–69](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/README.md#L65-L69>), [190–196](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/README.md#L190-L196>) | Native blocks pending/unconfirmed repeat; applying cannot cancel; native recovery is not prohibited Fishball retry. |

`openPackage` detail Back-to-calling-tab is extra on rc.1, not a common rc.5 guarantee. Explicit Fishball return belongs to LITE/SET. SDK audit is feasibility evidence only; neither SDK's actual RP component/UI acceptance has run.

## 3. Supporting Equivalence Partitioning (EP)

| Domain | Valid partitions / concrete representatives | Invalid or excluded partition | Cases |
|---|---|---|---|
| Document context | Child Plugins; main Plugins | No standalone recommendation-plugin configuration domain exists. | TC-01–03, TC-21, TC-31 |
| Locale | `en`, `zh`; stable id, localized copy | Unspecified locale fallback is not invented. | TC-01–02, TC-15–17, TC-33 |
| Package presence | Child absent; present enabled; present disabled; main-only present | Two same-name installed bundle records are not a reachable fixture. | TC-04–07, TC-18, TC-23–24 |
| Curated data | Fixed product-owned categories/ids/flags; nonempty en/zh resources; empty Pet note layout | Runtime malformed/unavailable data requires bypassing UI; excluded per owner decision, no runtime-data UX cases. | TC-17, TC-20, TC-30, TC-33 |
| Native outcome | Success; pre-application check failure; package failure/absent; application failure/present; confirmed cancel; unknown/unconfirmed | Do not infer installed state from success/failure alone or invent exact native error codes. | TC-04, TC-08–12, TC-29 |
| Lifecycle | Active current owner; disposed owner; replacement current owner | Stale callback is invalid as a UI update even if native operation commits. | TC-19, TC-25–28, TC-34 |

The **only** “it is what it is” exclusion is bypass-UI runtime mutation/unavailability of the fixed curated constants. All UI-reachable native error, pending, rapid-repeat, race, disposal and re-entry behavior remains acceptance work.

## 4. Boundary Value Analysis (BVA): real ordered adjacency, no invented limits

| Ordered domain / partition boundary | Values and derivation | Expected boundary distinction | Cases |
|---|---|---|---|
| Child presence count for **one named package**: absent `0` versus present `1` | **2-value BVA: 0 ↔ 1**. No same-name count `2`, max, timeout or length invented. | Install ↔ Installed; present enablement is a don't-care. | TC-23; UI TC-04–06/18 |
| Number of **distinct** installed curated entries | `0`, `1` (`dsh-idle-compact`), `2` (+ `smart-compaction`). Only 0 ↔ 1 is a lower-presence boundary; `2` is EP interior/row-independence data, **not** a 3-value boundary around 1 or a maximum. | Each present row Installed; unrelated absent `meow-memory` still Install; list unchanged. | TC-24 |
| User install invocations in one native pending episode | `0` (none), `1` (first), `2` (first repeat); adjacent 0 ↔ 1 and 1 ↔ 2 behavior partitions, no numeric cap. | No install intent before action; first follows native; repeat follows native pending/unconfirmed blocking/dedup. | TC-13, TC-28 |
| Supported composition activations / re-entry | `0`, `1`, `2`; adjacent absent/first/repeated lifecycle partitions, not 2 simultaneous invented bundle records. | No owned contribution before activation; one live after first and repeated supported activation. | TC-25 |
| Disposer invocations for one owner | `0`, `1`, `2`; active/first-dispose/repeat partitions. | Active subscriptions until dispose; removed once; repeat inert. | TC-26 |

## 5. Minimized Decision Table

Conditions are **page context** and **actual matching child bundle presence**. Main presence and enabled state cannot change these decisions and are collapsed as don't-cares. In main context, child presence is irrelevant. Native pending/error is an independent overlay owned by DSH, not another fabricated Fishball state/action table.

| Condition / action | R1 | R2 | R3 |
|---|---|---|---|
| Plugins context | Main | Child | Child |
| Matching child bundle present | — | No | Yes |
| Main bundle present | — | — | — |
| Child bundle enabled | — | N/A | — |
| Recommendation tab | Absent | Present | Present |
| Row install action | No row | Native Install | None |
| Row installed indicator | No row | Not Installed | Installed |
| Representative cases | TC-03/23 | TC-04/07/23 | TC-05/06/23 |

## 6. State Transition table

Two independent dimensions: **inventory** `A` absent / `I` present, and **client owner** active / disposed / replacement. Native flow's own pending, unconfirmed, result and error states are observed as reported—not reimplemented. No completion value is guessed from a void install callback.

| Transition | Current state / event / guard | Next state and observable action | Cases |
|---|---|---|---|
| ST1 | A + explicit Install; supported confirmed-target seam | Native flow opens; inventory stays actual, no optimistic I. | TC-04/22 |
| ST2 | Native confirms completion + authoritative listing says present | I / Installed, native result retained. | TC-04/29 |
| ST3 | Check/package failure + listing absent | A / Install and native failure; no Fishball automatic retry. | TC-08/09/29 |
| ST4 | Application failure + listing present | I / Installed **and** native failure; no custom rollback. | TC-10/29 |
| ST5 | Native cancellable stage + user Cancel | Native confirmed cancel/result and actual inventory; no extra rollback promise. Applying-stage cancel is not required/offered by this oracle. | TC-11/29 |
| ST6 | Lost response / unconfirmed + no authoritative final settlement | Native unknown/pending stays honest; no success/cancel claim or competing Fishball retry. | TC-12/29 |
| ST7 | Native pending/unconfirmed + second UI invocation | Native-owned block/dedup; no independent Fishball operation. | TC-13/28 |
| ST8 | I + native disable | I; still Installed. | TC-06/18 |
| ST9 | I + native removal confirmed absent; then explicit reinstall | A → native flow → I when present; no model turn. | TC-18 |
| ST10 | Active + repeated supported same-id activation/re-entry | One live contribution, native tabs unchanged. | TC-25/34 |
| ST11 | Active + dispose once/twice; old callback arrives | Disposed; owned subscriptions removed once; no old UI updates, native work may continue. | TC-19/26 |
| ST12 | Disposed A + activate B + late A callback/settlement | B remains current; no stale update into B; refresh from current inventory. | TC-27 |
| ST13 | Fishball → Settings → Plugins/recommendation → explicit return | Same Fishball; allowed native destinations, no corrective/archive action. | TC-14 |

0-switch coverage covers each specified transition above; 1-switch sequences target install→settle→remove→explicit reinstall, activate→dispose→replacement/late callback, and the explicit return route. Invalid actions covered are stale-owner updates and repeated actions forbidden by native pending/unconfirmed state. No fictional standalone package switch transition is specified.

## 7. Canonical full catalogue — statuses as of the 2026-11-11 RP execution (§10)

Fixtures are **later authorized local packs**, not public package installs in this task. For owner `install`, supply an already-confirmed exact target through a reviewed supported handoff; selection/confirmation remains an RP proof gate, not a prescribed native screen. Do not pin historical checked versions. Each SDK registration contains the same stable case id, SDK version, TODO owner(s) and observable intent. Module catalogue records concrete entrypoint/data/owner as well as AC/technique; ownership/dependencies are separate below to retain exactly seven table columns.

| TC No. | TC Name | Details | Techniques Used | AC Covered | Expected Behaviour | Status |
|---|---|---|---|---|---|---|
| TC-01 | Browse English child tab | Fresh child, `en`, zero curated bundles; open native Plugins/recommendation. | Use Case, EP | AC1, AC2, AC11 | One Fishball Recommended tab/id, fixed categories, native tabs intact. | TODO (post-merge e2e) |
| TC-02 | Browse Chinese child tab | As TC-01 with `zh`. | Use Case, EP | AC1, AC2, AC11 | One Fishball 推荐 tab, same id/structure, localized resources. | TODO (post-merge e2e) |
| TC-03 | Keep main tab absent | Disposable V2 main; open Plugins in `en`, then `zh`. | Use Case, EP, Decision Table R1 | AC1, AC11 | No `fishball-recommended`; main native tabs unchanged. | TODO (post-merge e2e) |
| TC-04 | Complete native child install | `dsh-idle-compact` absent both; local pack, explicit native target/version confirmation. | Use Case, State Transition | AC3, AC4, AC5 | Native child install/result; actual present means Installed; main unchanged, no model turn. | TODO (post-merge e2e) |
| TC-05 | Recognize enabled presence | `dsh-idle-compact` present/enabled in child, absent main. | Use Case, EP, Decision Table R3 | AC3 | Installed; no Install/legacy On action. | TODO (post-merge e2e) |
| TC-06 | Recognize disabled presence | Disable same child bundle natively; revisit recommendation. | Use Case, EP, Decision Table R3 | AC3 | Still Installed; no Turn on for Fishball. | TODO (post-merge e2e) |
| TC-07 | Install despite main-only presence | Same bundle present main only; child row Install → local native flow. | Use Case, EP, Decision Table R2 | AC3, AC4 | Install offered; child targeted; main unchanged. | TODO (post-merge e2e) |
| TC-08 | Surface check failure | Child absent; local native check rejects before application. | Use Case, EP, State Transition | AC4, AC5 | Native error and actual absence; no Fishball retry/rollback/model turn. | TODO (post-merge e2e) |
| TC-09 | Surface package failure with no remainder | Confirmed local operation fails; native listing absent. | Use Case, EP, State Transition | AC5 | Native failure retained; Install follows absence; native recovery allowed. | TODO (post-merge e2e) |
| TC-10 | Surface failure with present remainder | Native application/publication fails; native inventory reports present. | Use Case, EP, State Transition | AC3, AC5 | Native failure **and Installed**; no inferred absence/custom rollback. | TODO (post-merge e2e) |
| TC-11 | Respect native cancellation | User Cancel at native cancellable stage; reconcile result/inventory. | Use Case, EP, State Transition | AC5, AC6 | Native confirmed cancel/actual state; no rollback or applying-cancel promise. | TODO (post-merge e2e) |
| TC-12 | Keep unresolved result honest | Local fixture loses response before confirmation/settlement. | Use Case, EP, State Transition | AC5, AC6 | Native unknown/unconfirmed, not success/cancel; no Fishball retry. | TODO (post-merge e2e) |
| TC-13 | Repeat pending UI action | Separate 0/1/2 rapid-click runs while native pending/unconfirmed. | Use Case, BVA, State Transition | AC6 | Native blocking/dedup only; no competing custom operation. | TODO (post-merge e2e) |
| TC-14 | Return through native destinations | Fishball → Settings → Plugins/recommendation → explicit Fishball; `en`/`zh`. | Use Case, State Transition | AC10, AC11 | Allowed native navigation; same session, no new session/correction/archive. | TODO (post-merge e2e) |
| TC-15 | Render English memory note | `en`; meow-memory row absent then present. | Use Case, EP | AC8 | Nonempty optional-external-memory note, no built-in V2 memory, no board link. | TODO (post-merge e2e) |
| TC-16 | Render Chinese memory note | TC-15 with `zh`. | Use Case, EP | AC8 | Same semantics in nonempty Chinese copy; no exact wording pin. | TODO (post-merge e2e) |
| TC-17 | Render curated categories and empty Pet | `en`/`zh`; 3/3/4/0 entries in fixed order, Context/Memory highlighted. | Use Case, EP | AC2, AC8 | Correct structure/empty note; no stale native-browser or V3-dependent claims. | TODO (post-merge e2e) |
| TC-18 | Follow native disable/remove/reinstall | Present → native disable → native remove → revisit → explicit native reinstall. | Use Case, State Transition | AC3, AC5 | Installed → Installed → Install → actual Installed; main unchanged. | TODO (post-merge e2e) |
| TC-19 | Leave/reload during native work | Pending local install; dispose old document; allow finish; reopen current view. | Use Case, State Transition | AC5, AC7 | Native may finish; old view inactive, reopened view reflects current inventory. | TODO (post-merge e2e) |
| TC-20 | Validate actual shipped curated constants | **One product unit case**; actual shipped data through reviewed public seam, four categories/ten ids/flags/notes/en/zh. | EP | AC2, AC8 | Product-owned structure/resources valid; no exact prose/version snapshots or catalogue self-test. | Automated |
| TC-21 | Use supported native installation seam | Selected SDK root/list slot owner props; component activation or reviewed supported native alternative. | EP, State Transition | AC1, AC4, AC11 | Documented owner seam or proven native alternative; no assumed global/raw-entry installer contract. | Automated |
| TC-22 | Prove confirmed-target handoff | Listed spec/local pack; already-confirmed target fixture before owner.install, or reviewed supported native alternative. | Use Case, State Transition | AC4 | Native child handoff; no prescribed version-picker/extra confirmation screen, custom installer or model path. | Automated |
| TC-23 | Apply minimal presence rules | Main/child context; 0/1 matching child bundle; enabled/disabled; main-only. | EP, BVA, Decision Table R1–R3 | AC1, AC3 | Table R1–R3; child presence alone gives Installed. | Automated |
| TC-24 | Keep distinct row states independent | 0 distinct installed → idle-compact → + smart-compaction; meow-memory absent. | BVA (0↔1 only), EP (2 interior) | AC2, AC3 | Only present rows Installed; fixed list/unrelated absent rows unchanged. | Automated |
| TC-25 | Repeat supported composition activation | 0/1/2 supported activations or re-entries with stable same id. | BVA, State Transition | AC1, AC7, AC11 | One live owned contribution; no mandated duplicate-id rejection. | Automated |
| TC-26 | Dispose subscriptions once | Record subscriptions; 0/1/2 disposer calls; callback after disposal. | BVA, State Transition | AC7 | Owned subscriptions removed once; second dispose inert; no disposed updates. | Automated |
| TC-27 | Fence old generation completion | A pending → dispose A → activate B → late A callback/result. | State Transition | AC5, AC7 | No stale UI mutation; B reads current inventory; native commit may survive. | Automated |
| TC-28 | Delegate pending/repeat policy | 0/1/2 component invocations in native pending/unconfirmed, then explicit post-settlement action. | BVA, State Transition | AC5, AC6 | Native blocking/dedup/subsequent authority only; no Fishball lock/retry policy. | Automated |
| TC-29 | Separate outcome and inventory | Check fail/absent; package fail/absent; apply fail/present; confirmed cancel; unresolved. | EP, State Transition | AC3, AC5 | Native outcomes retained independently of presence; unknown never optimistic success. | Automated |
| TC-30 | Keep curated source local | Fixed shipped data/local pack; unrelated market suggestion in harness native-discovery fixture. | EP | AC2, AC4 | Only curated rows/spec; no discovery request/market row or new market source. | Automated |
| TC-31 | Inspect owned child asset delivery | Proposed release artifacts and fresh main/child composition per SDK. | Use Case, EP | AC1, AC9 | Instance-owned child asset; no standalone recommendation package/placement/main contribution. | Automated (static/artifact part); fresh composition TODO (post-merge e2e) |
| TC-32 | Inspect no automatic bundles | Fresh/V2-only artifact/profile/loader, no manual recommendation Install. | Use Case, EP | AC9 | No auto-installed recommendations, standalone RP package, V3 payload/placement/default enable/startup requirement. | Automated (static/artifact part); fresh composition TODO (post-merge e2e) |
| TC-33 | Render localized note layout | Component with actual trusted en/zh resources; meow row absent/present; Pet empty. | EP | AC2, AC8 | Memory note under meow; empty-category note; no exact-copy snapshot/board link. | Automated |
| TC-34 | Dispose/reactivate only owned tab | Retain SDK native tabs; activate → dispose → activate stable recommendation id. | State Transition | AC1, AC7, AC11 | Remove only owned contribution; restore one; native tabs untouched. | Automated |

## 8. Ownership, entrypoints and execution gates

| Cases | Primary owner(s) / entrypoint | Prerequisites / remaining acceptance |
|---|---|---|
| TC-01–13, TC-15–19 | **TODO BROWSER**: actual child/main native Plugins, Install controls/results, document lifecycle; UI locales and content. | RP reviewed component delivery → final INTEGRATE/reviewed SHA → separate authorized browser-only last step. Native failures, pending and repeat UI are not waived. |
| TC-14 | **TODO BROWSER**, with LITE/SET path ownership: actual explicit Fishball/Settings/Plugins return. | LITE + SET + RP + INTEGRATE; not rc.1-only package-detail Back. |
| TC-20 | **TODO RP**: exactly one unit seam for **actual shipped** curated constants. | Reviewed public data seam; authoring catalogue imports no product and does not test its own constants. UI text semantics still TC-15–17. |
| TC-21–30, TC-33–34 | **TODO RP**: component/public native slot, target, inventory, source and lifecycle seams, as individually named in catalogue. | Both SDK seams proved/reviewed separately. Inventory and final outcome are not supplied by a void owner `install` alone. Actual user interaction still requires BROWSER cases above. |
| TC-31–32 | **TODO BOUNDARY + INTEGRATE**: actual proposed artifact/profile/loader composition. | Final artifact identity pinned separately for each SDK; UI absence/presence also TC-01–03. No source-only “not called” inference. |

### Deliverables and count semantics

- [Shared frozen catalogue and registrar](<../../test/v2-recommendation/cases.mjs>) contains all **34 logical cases**, their concrete data, entrypoint, owners, prerequisites, AC and permitted techniques. Feature constants are in one recursively frozen data object. It imports **only** `node:test`.
- [0.2.1-rc.5 registration](<../../test/v2-recommendation/sdk-0.2.1-rc.5.test.mjs>) and [0.2.2-rc.1 registration](<../../test/v2-recommendation/sdk-0.2.2-rc.1.test.mjs>) separately register that catalogue through one registrar; no copied case blocks or product adapters.
- Each registration calls actual `test.todo(title)` with **no callback**, stable id + SDK + owner(s) + observable intent. No skip, empty body, self-oracle, expected=actual stub or falsely passing test. Registration readiness is not component/API/browser coverage.

| Logical family | Logical count | Two-SDK TODO registrations | Key scenarios |
|---|---:|---:|---|
| Actual UI / BROWSER | 19 | 38 | Child/main, en/zh, install/installed/absent/error/cancel/unknown/pending/repeat, note, native return, reload. |
| Shipped-data unit / RP | 1 | 2 | Actual curated data structure/identities/flags/notes/locales; not test catalogue validation. |
| Component/public seams / RP | 12 | 24 | Slot/confirmed target/inventory, presence boundary/row independence, repeated activation/disposal/stale generation, curated source/note layout. |
| Artifacts / BOUNDARY + INTEGRATE | 2 | 4 | Child-owned composition, no standalone package or automatic/V3 bundles. |
| **Total** | **34** | **68** | Counts are unique case ids × SDK; overlapping techniques and later browser dependencies do not add cases. |

| SDK | Explicit case enumeration | Behavioral execution | Pass / Fail / Blocked / Skipped | TODO / Not Run |
|---|---|---|---|---:|
| **0.2.1-rc.5** | TC-01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34 | Not Run | 0 / 0 / 0 / 0 | 34 |
| **0.2.2-rc.1** | TC-01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34 | Not Run | 0 / 0 / 0 / 0 | 34 |

No node test runner was invoked by T-RP. Syntax-only checks do not import/run product, verify SDK seams, demonstrate UI behavior or change any case status. A future authorized verifier must record exact SDK/build, fixture, locale and observed result rather than inheriting a pass from the other SDK. No behavior/sign-off question is pending; confirmed-target/inventory engineering seams and all registered execution remain owner-named TODOs.

## 9. Authoring verification and review — 2026-11-10

- `node --check` passed separately for all three delivered `.mjs` modules. No JavaScript imports, test registration or product behavior were executed by that check.
- Static text inventory found 34 sequential unique case ids and primary-owner totals 19 BROWSER / 13 RP / 2 BOUNDARY+INTEGRATE. Two SDK entry modules each call the 34-case TODO registrar: **68 registrations by construction**, not an executed runner count. An initial document-count helper included two repeated ownership-table references and failed; scoping it to the canonical catalogue resolved that authoring-check error without changing cases.
- Independent requirements-only review checked all four new files against the approved sources and both SDK contracts. Two P2 oracle-wording findings concerned an assumed native confirmation screen and an overly categorical raw-entry-face prohibition. Both were corrected: target acquisition/confirmation remains an RP proof gate; an alternative public native seam is unproven, not forbidden. No implementation or existing tests were read.
- No product/browser/model/network/install/credential command, test runner, migration work or push was performed. Local Git inspection, syntax checks, static authoring checks and the requested local commit are the delivery operations; all 68 product cases remain **TODO / Not Run**.

## 10. Execution note — RP executable suite, 2026-11-11

- **What runs.** [cases.mjs](<../../test/v2-recommendation/cases.mjs>) is still the one frozen catalogue and the one registrar. A case that has an entry in [checks.mjs](<../../test/v2-recommendation/checks.mjs>) runs as a real test, and every other case stays `test.todo` with the reason "post-merge e2e". Each SDK file registers on its own. A check runs only when `FBTEST_DSH_RUNTIME` names that SDK's own `node_modules`; when the run selects the other SDK, the file's checks are skipped with that reason, never passed. SDK artifacts (`slot-contract.d.ts`, how `lib/client.js` renders `plugins.tab` with `install: props.installFrom`, and the README) are read from the selected install.
- **Seams.** The suite reads the shipped data (`recommendedList`, `RECOMMENDED_*`), the Node half's registered GET route, `launchOverlay` and a real `copyChildCode` into a temp profile. The browser half `client.js` runs through [rp-recommend.mjs](<../../test/support/rp-recommend.mjs>) in `node:vm`, with fakes of the documented surfaces only: `ctx.slots` root list `plugins.tab`, the owner props `install`/`openPackage`, `ctx.locale`, `ctx.remote.pluginManager.listBundles`/`inspect`, `$on('plugin-manager/changed')` and `ctx.on('connection/reset')`.
- **Limit.** React cannot be resolved offline: there is no `node_modules`, and neither SDK install ships `react`. The harness therefore uses a hand-written React shim (hooks, effects with cleanup, re-render and unmount) and a fake element tree, not React's reconciler or a real DOM. Real rendering, the native dialog and lifecycle belong to the browser cases.
- **TODO (post-merge e2e):** TC-01–19 (BROWSER, including TC-14), plus the fresh main/child composition subtests of TC-31/TC-32.
- **Result**, for each SDK run separately with `node --test --test-concurrency=1 --test-timeout=60000 'test/v2-recommendation/*.test.mjs'`:

| SDK (`FBTEST_DSH_RUNTIME`) | Its own file: pass / fail / todo | Other SDK's file |
|---|---|---|
| 0.2.1-rc.5 | 15 / 0 / 19 + 2 subtests | 15 skipped (not selected) + 19 todo |
| 0.2.2-rc.1 | 15 / 0 / 19 + 2 subtests | 15 skipped (not selected) + 19 todo |

- **TC-26 (owner decision 2026-11-11).** A callback captured before disposal and fired after it must start no Host work: no `listBundles`, no render, no install. That is asserted on both SDKs.
