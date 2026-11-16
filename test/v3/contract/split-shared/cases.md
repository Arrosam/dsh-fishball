# SPLIT-SHARED: test cases (one library per side)

Sources: design `design/v3` @ 9a531192 (`v3-design.md` §1.0, §1.0b row 5, §1.0c, the "Shared
libraries (requirements 1.40)" row, §6.3a "One copy per side"); `v3-requirements.md` R-ARCH-01,
R-ARCH-08 (amended by 1.40), R-BND-01, §1.40 and §1.41; `.runtime/reports/v3-remaining-plan.md` §5
row SPLIT-SHARED and §6; Fishball's interim rule for this task (relayed 2026-11-16: core's child halves
keep `fishball-shared` copies until I-HOST, so both copies must behave the same). Expected outcomes
come from these sources only. The oracle for "moved, behaviour unchanged" is `packages/shared` at the
task's base commit 131ad65f, read with `git show`.

Entry files: `sdk-0.2.1-rc.5.test.mjs` and `sdk-0.2.2-rc.1.test.mjs` call `registerSplitCases` in
[cases.mjs](<cases.mjs>). Each test name is `<case id> <row> [SDK x] <title>`. The rows that hold for
either library on its own (PLAT-EP-07 rows 3/7b, 4, 5, 6, 7a) are registered once per library by
[package-boundaries/cases.mjs](<../package-boundaries/cases.mjs>).

## Requirements under test

| # | Requirement |
| --- | --- |
| R1 | Two sides with no dependency between them. The DSH side is dsh-connector, dsh-connector-ui, dsh-instance, dsh-connector-adapter (joined with C-MCP-ADAPTER) and the library dsh-connector-shared (`packages/dsh-connector-shared`). The Fishball side is fishball-core, fishball-board and the library fishball-shared (`packages/shared`). |
| R2 | No package is shared across the sides: no import and no dependency field names a package of the other side (libraries included). Neither library imports any other V3 package. |
| R3 | dsh-connector-shared holds `./admin-protocol`, `./provider-sync`, `./provider-sync-codec`, `./provider-sync-host`, `./redact` and `./files`. Their contracts are those of today's fishball-shared modules (moved, behaviour unchanged). Since C-MCP-ADAPTER it also holds `./oauth-client` (requirements 1.40, design §6.3a: the adapter's token manager, one copy per side), which has no base counterpart. |
| R4 | `files` is duplicated, one copy per library. fishball-shared keeps `./files`. |
| R5 | Interim rule: until I-HOST, fishball-shared keeps the admin protocol and provider-sync (codec, engine, host, with redact as the host's internal helper) for core's child halves. Core imports only `fishball-shared/*`. The instance, the connector and the adapter import only `dsh-connector-shared/*`. No Fishball-side package imports fishball-shared's `./redact`. |
| R6 | Both are libraries, not plugins (no `dsh` field), and both are root workspaces. Every importer lists its library in `dependencies` and `bundleDependencies`. dsh-connector-shared peers on cosmokit, dsh-app-boot and dsh-llm-pi-ai. |
| R7 | Hosted-child placement puts both libraries in `vendor/` and `node_modules/`, beside the bundles and the contract-only connector, never as profile bundles. dsh-connector-shared comes from the instance's dependencies. fishball-shared comes from core's own package location, never from the instance's graph. The instance imports no Fishball-side module. |
| R8 | Drift guard (interim): each pair of copies, the five interim modules and `files`, holds the same code below its leading header comment. |

## Use Cases

**SPLIT-UC-01: a DSH-side package author uses shared code.** Actor: the author of dsh-instance,
dsh-connector or dsh-connector-adapter. Main flow: the author imports a moved module as `dsh-connector-shared/<module>`, and
lists the library in `dependencies` and `bundleDependencies`. A1: every import into the library uses
one of its export subpaths (the six moved modules and `oauth-client`). E1: an import of any Fishball-side package, fishball-shared included,
breaks R2 (SPLIT-DT-01).

**SPLIT-UC-02: a Fishball-side package author uses shared code.** Actor: the author of fishball-core
(later fishball-ui). Main flow: core imports `fishball-shared/*` (its child halves, its Skills store)
and lists it in both fields. A1: no Fishball-side package imports `fishball-shared/redact`. E1: an
import of dsh-connector-shared or any DSH-side package breaks R2. Until REMOVE-V2, core's V2 edge to
`dsh-connector/contract` stays (design §1.0b row 2, `todo`).

**SPLIT-UC-03: the release packer packs a package.** Actor: the release packer (`npm pack`). Main
flow: each tarball carries its own side's library under `node_modules/<library>/`
(PLAT-EP-07 row 5, both libraries). A1: no tarball carries the other side's library (SPLIT-EP-01
row 4). A2: a library itself is refused by DSH's bundle inspection as not-a-bundle (PLAT-EP-07 row 4).

**SPLIT-UC-04: the hosted-child placement composes a child profile.** Actor: dsh-instance's
placement, at every child start (here through the public `composedProfile`, which writes files only and
starts no process). Main flow: both libraries and the contract-only connector are placed in `vendor/`
and `node_modules/`, as dependencies, never as bundles. A1: core's fishball-shared is the one beside
core, even when the instance's own graph resolves another copy (a decoy with a marker file). ST: a
second start on the same home places them again (placed → placed). E1: with no fishball-shared beside
core and none in the instance's graph, composition is refused with a typed code.

## Case list

| Id | Row | Technique | Input / condition | Expected |
| --- | --- | --- | --- | --- |
| SPLIT-DT-01 | `DSH→Fishball <pkg>` for the connector, the connector-ui, the instance, the adapter and dsh-connector-shared | Decision table (side of importer × side of target) | the package's shipped code and manifest | no import or dependency field names core, board or fishball-shared |
| SPLIT-DT-01 | `Fishball→DSH <pkg>` for core, board and fishball-shared | Decision table | the same | no import or field names the connector-ui, the instance, the adapter or dsh-connector-shared; also the connector, except for core (REMOVE-V2 `todo`) |
| SPLIT-UC-01 | main (instance, connector, adapter) | Use Case | manifests and import graph | imports dsh-connector-shared and lists it in both fields; reaches no fishball-shared |
| SPLIT-UC-01 | A1 | Use Case / EP | every edge into dsh-connector-shared | the specifier is one of the seven `dsh-connector-shared/<module>` (six moved, `oauth-client` added) |
| SPLIT-UC-02 | main (core) | Use Case | the same | imports fishball-shared and lists it in both fields; reaches no dsh-connector-shared |
| SPLIT-UC-02 | A1 | Use Case | Fishball-side edges | none lands on fishball-shared's `redact.js` |
| SPLIT-EP-01 | 1 | EP (library contents) | dsh-connector-shared's `exports` | the seven subpaths (six moved, `oauth-client` added) map to `./<module>.js` and the files exist; `./package.json` is exported |
| SPLIT-EP-01 | 2 | EP | its `peerDependencies` | exactly cosmokit, dsh-app-boot and dsh-llm-pi-ai, equal to the base library's |
| SPLIT-EP-01 | 3 | EP | fishball-shared's `exports` | `./files` stays |
| SPLIT-EP-01 | 4 | EP (packer) | every packed listing | no `node_modules/<other side's library>/` path |
| SPLIT-EP-01 | 5 | EP (packer) | importers of each library | all of that library's side |
| SPLIT-DT-02 | halves present ×5 | Decision table (core's child halves exist?) | `src/slim/child/{admin,provider-sync-target}.js` exist | fishball-shared ships and lists each interim module |
| SPLIT-DT-02 | halves present | Decision table | the halves' imports | from fishball-shared only, none from dsh-connector-shared |
| SPLIT-DT-02 | halves moved | Decision table / State transition (I-HOST) | halves gone | the interim copies are dropped (`todo` I-HOST) |
| SPLIT-EP-02 | one row per module (5 interim + files) | EP (drift guard, R8) | both copies, leading `/** … */` comments removed | identical code |
| SPLIT-EP-03 / SPLIT-BVA-03 | per library × 14 rows | EP / BVA of `inside(root, file)` | same path; trailing `/`; child; deep child; `..hidden`; `...`; parent; `../other`; exactly `..`; `a/../b`; sibling with shared prefix (`root2`, `rootx/a`); unrelated absolute; root `/` | true, true, true, true, true, true, false, false, false, true, false, false, false, true |
| SPLIT-EP-04 | one row per module | EP (moved, behaviour unchanged) | exports of the new module vs base `packages/shared` | the same names, kinds, arities and constant values |
| SPLIT-EP-04 | redact | EP / BVA | bearer, `token=`, JSON `apiKey`, `password:`, a file path, runs of 31/32/33, plain text, empty | the same output as base; 31 stays, 32 is masked |
| SPLIT-EP-04 | provider-sync | EP | `syncFingerprint` samples; `unsafeProfileReason` over safe, http, userinfo, headers, duplicate model, zero tokens, null, array | the same as base |
| SPLIT-EP-04 | provider-sync-codec | EP / BVA | `safeCode` (valid, uppercase, long codes, empty, space, non-string); codec request/encode/decode/acceptRequest, bad JSON, unknown action | the same as base |
| SPLIT-EP-04 | admin-protocol | EP | `refusal` per code, `refusalOf` typed and untyped, `validateRequest` per operation with `{}` and `null` | the same as base |
| SPLIT-UC-04 | main | Use Case (integration, no process) | `composedProfile` on a scratch tree | both libraries and dsh-connector in `vendor/` and `node_modules/`, as dependencies, not bundles |
| SPLIT-UC-04 | main | Use Case | the placed dsh-connector-shared | exactly its shipped files (`files` plus package.json) |
| SPLIT-UC-04 | A1 | Use Case | core's copy has a marker; the instance's graph has a decoy | the placed fishball-shared carries core's marker, not the decoy's |
| SPLIT-UC-04 | ST | State transition | two compositions on one home | still placed, still not bundles |
| SPLIT-UC-04 | E1 | Use Case | no fishball-shared beside core, none in the graph | rejected with a typed `code` |

PLAT-EP-07, per library (in package-boundaries): row 4 (folder, root workspace, no `dsh` field, DSH
refuses it as not-a-bundle; Plugins page `todo`), rows 3/7b (no edge out), row 5 (importers list and
bundle it, tarballs contain it), row 6 (every module used; no live copy in a plugin package; the
"at least two users" rule is `todo` because of the conflict below), row 7a (edges in only from its
side). HOST-EP-03 row 1 now reads: core imports fishball-shared, the instance dsh-connector-shared,
and the instance reaches nothing of fishball-shared.

## Open point for Fishball

R-ARCH-08 rule 5 says a library holds modules "more than one" package uses. The SPLIT-SHARED contents
contradict that at this commit. In dsh-connector-shared, the admin protocol, files and provider-sync
have one user (the instance), and only redact has two. fishball-shared has one user (core) until F-UI.
PLAT-EP-07 row 6 "at least two" is therefore a `todo` until Fishball reconciles the two texts.
