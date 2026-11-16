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
| R1 | Two sides with no dependency between them. The DSH side is dsh-connector, dsh-connector-ui, dsh-instance, dsh-connector-adapter (joined with C-MCP-ADAPTER) and the library dsh-connector-shared (`packages/dsh-connector-shared`). The Fishball side is fishball-core, fishball-ui (since F-UI, R-FB-14), fishball-board and the library fishball-shared (`packages/shared`). |
| R2 | No package is shared across the sides: no import and no dependency field names a package of the other side (libraries included). Neither library imports any other V3 package. |
| R3 | dsh-connector-shared holds `./files`, `./provider-sync`, `./provider-sync-codec`, `./provider-sync-host`, `./redact`, `./request-host` and `./oauth-client`. The five moved modules keep the contracts of the fishball-shared modules they came from (moved, behaviour unchanged). Since C-MCP-ADAPTER it also holds `./oauth-client` (requirements 1.40, design §6.3a: the adapter's token manager, one copy per side), and since I-HOST `./request-host`; neither has a base counterpart. It no longer holds `./admin-protocol` (no file, no export): remove-v2-followups D14 (R-ARCH-08 strict: a library module needs a user on its side) deleted it after I-READY deleted dsh-instance's admin relay, its one user (the user's decision 2026-11-16, "Delete it"). |
| R4 | `files` was duplicated, one copy per library. REMOVE-V2b (R-ARCH-08 rule 5 strict, Fishball 2026-11-16: every library module is imported by at least two packages of its side) moved fishball-shared's single-user modules, `files` (core's Skills store) and `oauth-client` (core's link / Connect), into core. fishball-shared now exports exactly `./ui-seam` and `./package.json` and ships neither `files.js` nor `oauth-client.js`; core imports neither `fishball-shared/files` nor `fishball-shared/oauth-client`. dsh-connector-shared keeps `./files` until C-WIRE-2. |
| R5 | Interim rule: until I-HOST, fishball-shared keeps the admin protocol and provider-sync (codec, engine, host, with redact as the host's internal helper) for core's child halves. Core imports only `fishball-shared/*`. The instance, the connector and the adapter import only `dsh-connector-shared/*`. No Fishball-side package imports fishball-shared's `./redact`. |
| R6 | Both are libraries, not plugins (no `dsh` field), and both are root workspaces. Every importer lists its library in `dependencies` and `bundleDependencies`. dsh-connector-shared peers on cosmokit, dsh-app-boot and dsh-llm-pi-ai. |
| R7 | Hosted-child placement puts both libraries in `vendor/` and `node_modules/`, beside the bundles, never as profile bundles. I-READY removes dsh-connector: it is neither placed nor a profile dependency. dsh-connector-shared comes from the instance's dependencies. fishball-shared comes from core's own package location, never from the instance's graph. The instance imports no Fishball-side module. |
| R8 | Drift guard (interim): each pair of copies, the five interim modules and `files`, holds the same code below its leading header comment. No pair is left: I-HOST deleted the interim copies and REMOVE-V2b moved fishball-shared's `files` into core. |

## Use Cases

**SPLIT-UC-01: a DSH-side package author uses shared code.** Actor: the author of dsh-instance,
dsh-connector or dsh-connector-adapter. Main flow: the author imports a moved module as `dsh-connector-shared/<module>`, and
lists the library in `dependencies` and `bundleDependencies`. A1: every import into the library uses
one of its export subpaths (the five moved modules, `oauth-client` and `request-host`). E1: an import of any Fishball-side package, fishball-shared included,
breaks R2 (SPLIT-DT-01).

**SPLIT-UC-02: a Fishball-side package author uses shared code.** Actor: the author of fishball-core
(later fishball-ui). Main flow: core and fishball-ui import `fishball-shared/ui-seam` (since REMOVE-V2b the library's only module)
and list it in both fields. A1: no Fishball-side package imports `fishball-shared/redact`. E1: an
import of dsh-connector-shared or any DSH-side package breaks R2. Since F-WIRE core has no V2 edge to
`dsh-connector` left (design §1.0b row 2), so core is held to the whole DSH side too.

**SPLIT-UC-03: the release packer packs a package.** Actor: the release packer (`npm pack`). Main
flow: each tarball carries its own side's library under `node_modules/<library>/`
(PLAT-EP-07 row 5, both libraries). A1: no tarball carries the other side's library (SPLIT-EP-01
row 4). A2: a library itself is refused by DSH's bundle inspection as not-a-bundle (PLAT-EP-07 row 4).

**SPLIT-UC-04: the hosted-child placement composes a child profile.** Actor: dsh-instance's
placement, at every child start (here through the public `composedProfile`, which writes files only and
starts no process). Main flow: both libraries are placed in `vendor/`
and `node_modules/`, as dependencies, never as bundles. Since I-READY, dsh-connector is absent
from both placement locations and from profile dependencies and bundles. A1: core's fishball-shared is the one beside
core, even when the instance's own graph resolves another copy (a decoy with a marker file). ST: a
second start on the same home places them again (placed → placed). E1: with no fishball-shared beside
core and none in the instance's graph, composition is refused with a typed code.

## Case list

| Id | Row | Technique | Input / condition | Expected |
| --- | --- | --- | --- | --- |
| SPLIT-DT-01 | `DSH→Fishball <pkg>` for the connector, the connector-ui, the instance, the adapter and dsh-connector-shared | Decision table (side of importer × side of target) | the package's shipped code and manifest | no import or dependency field names core, board or fishball-shared |
| SPLIT-DT-01 | `Fishball→DSH <pkg>` for core, board and fishball-shared | Decision table | the same | no import or field names the connector, the connector-ui, the instance, the adapter or dsh-connector-shared (core included since F-WIRE) |
| SPLIT-DT-01 | `Fishball→DSH fishball-core dsh-connector` | Decision table | core's shipped code and manifest | no import or field names dsh-connector (was a REMOVE-V2 `todo`; runs since F-WIRE) |
| SPLIT-UC-01 | main (instance, connector, adapter) | Use Case | manifests and import graph | imports dsh-connector-shared and lists it in both fields; reaches no fishball-shared |
| SPLIT-UC-01 | A1 | Use Case / EP | every edge into dsh-connector-shared | the specifier is one of the seven `dsh-connector-shared/<module>` (five moved; `oauth-client`, `request-host` added) |
| SPLIT-UC-02 | main (core) | Use Case | the same | imports fishball-shared and lists it in both fields; reaches no dsh-connector-shared |
| SPLIT-UC-02 | main (fishball-ui) | Use Case | the same (F-UI) | imports fishball-shared and lists it in both fields; reaches no dsh-connector-shared |
| SPLIT-UC-02 | A1 | Use Case | Fishball-side edges | none lands on fishball-shared's `redact.js` |
| SPLIT-EP-01 | 1 | EP (library contents) | dsh-connector-shared's `exports` | the seven subpaths (five moved; `oauth-client`, `request-host` added) map to `./<module>.js` and the files exist; `./package.json` is exported |
| SPLIT-EP-01 | 1 (D14) | EP (library contents) | dsh-connector-shared's `exports` and files | no `./admin-protocol` export and no `admin-protocol.js` (remove-v2-followups D14) |
| SPLIT-EP-01 | 2 | EP | its `peerDependencies` | exactly cosmokit, dsh-app-boot and dsh-llm-pi-ai, equal to the base library's |
| SPLIT-EP-01 | 3 | EP (library contents) | fishball-shared's `exports` and files | exactly `./ui-seam` and `./package.json`; no `files.js`, no `oauth-client.js` (**rewritten** by REMOVE-V2b: was "`./files` stays") |
| SPLIT-EP-01 | 4 | EP (packer) | every packed listing | no `node_modules/<other side's library>/` path |
| SPLIT-EP-01 | 5 | EP (packer) | importers of each library | all of that library's side |
| SPLIT-DT-02 | halves present ×5 | Decision table (core's child halves exist?) | `src/slim/child/{admin,provider-sync-target}.js` exist | fishball-shared ships and lists each interim module |
| SPLIT-DT-02 | halves present | Decision table | the halves' imports | from fishball-shared only, none from dsh-connector-shared |
| SPLIT-DT-02 | halves moved | Decision table / State transition (I-HOST) | halves gone | the interim copies are dropped (`todo` I-HOST) |
| SPLIT-EP-02 | one row per module (5 interim + files) | — | **withdrawn**: the interim copies by I-HOST, `files` by REMOVE-V2b (fishball-shared's copy moved into core), so no module has two library copies | registered as skips with those reasons |
| SPLIT-EP-03 / SPLIT-BVA-03 | dsh-connector-shared × 14 rows (fishball-shared's 14 **withdrawn** by REMOVE-V2b: its `files.js` moved into core) | EP / BVA of `inside(root, file)` | same path; trailing `/`; child; deep child; `..hidden`; `...`; parent; `../other`; exactly `..`; `a/../b`; sibling with shared prefix (`root2`, `rootx/a`); unrelated absolute; root `/` | true, true, true, true, true, true, false, false, false, true, false, false, false, true |
| SPLIT-EP-04 | one row per module | EP (moved, behaviour unchanged) | exports of the new module vs base `packages/shared` | the same names, kinds, arities and constant values |
| SPLIT-EP-04 | redact | EP / BVA | bearer, `token=`, JSON `apiKey`, `password:`, a file path, runs of 31/32/33, plain text, empty | the same output as base; 31 stays, 32 is masked |
| SPLIT-EP-04 | provider-sync | EP | `syncFingerprint` samples; `unsafeProfileReason` over safe, http, userinfo, headers, duplicate model, zero tokens, null, array | the same as base |
| SPLIT-EP-04 | provider-sync-codec | EP / BVA | `safeCode` (valid, uppercase, long codes, empty, space, non-string); codec request/encode/decode/acceptRequest, bad JSON, unknown action | the same as base |
| SPLIT-EP-04 | admin-protocol (both rows: the export surface and the refusal/validator differential) | — | **withdrawn** by remove-v2-followups D14: I-READY deleted dsh-instance's admin relay, so nothing imports admin-protocol and dsh-connector-shared no longer holds it | registered as a skip with that reason |
| SPLIT-UC-04 | main | Use Case (integration, no process) | `composedProfile` on a scratch tree | both libraries in `vendor/` and `node_modules/`, as dependencies, not bundles; dsh-connector absent from placement, dependencies and bundles |
| SPLIT-UC-04 | main | Use Case | the placed dsh-connector-shared | exactly its shipped files (`files` plus package.json) |
| SPLIT-UC-04 | A1 | Use Case | core's copy has a marker; the instance's graph has a decoy | the placed fishball-shared carries core's marker, not the decoy's |
| SPLIT-UC-04 | ST | State transition | two compositions on one home | still placed, still not bundles |
| SPLIT-UC-04 | E1 | Use Case | no fishball-shared beside core, none in the graph | rejected with a typed `code` |

PLAT-EP-07, per library (in package-boundaries): row 4 (folder, root workspace, no `dsh` field, DSH
refuses it as not-a-bundle; Plugins page `todo`), rows 3/7b (no edge out), row 5 (importers list and
bundle it, tarballs contain it), row 6 (every module used; every module imported by at least two
packages of the library's own side, see below; no live copy in a plugin package), row 7a (edges in
only from its side). HOST-EP-03 row 1 now reads: core imports fishball-shared, the instance
dsh-connector-shared, and the instance reaches nothing of fishball-shared; since REMOVE-V2b,
`skills-store.js` imports nothing from fishball-shared and core imports neither
`fishball-shared/files` nor `fishball-shared/oauth-client`.

## PLAT-EP-07 row 6: at least two users (decided)

R-ARCH-08 rule 5 says a module only one package uses does not belong in a library. Fishball decided
the strict reading on 2026-11-16: every module of a library is imported by at least two distinct V3
packages of the library's own side (the library itself and the other side never count; a module
re-exported by another library module counts the re-exporter's users). The row runs for
fishball-shared (REMOVE-V2b moved `files` and `oauth-client` into core, leaving `ui-seam`, used by
core and fishball-ui). For dsh-connector-shared it is a `todo` owned by C-WIRE-2: `files`,
`provider-sync`, `provider-sync-codec` and `provider-sync-host` (the instance only) move into
dsh-instance, `oauth-client` (the adapter only) into dsh-connector-adapter; `redact` and
`request-host` pass. A `6 rule` self-check runs the counting rule on synthetic importer tables: 0, 1
and 2 importers (BVA), 3 importers, one package from two files, an other-side importer, the library
importing itself, and users reaching the module only through a re-export.
