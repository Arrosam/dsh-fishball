# dsh-fishball rename and stored state

Authority is the [owner amendment](owner-amendment-2026-10-04.md). Status: current code uses the new names; independent parity review and the physical workspace move are pending. This unit follows reviewed Stage2 integration `3b136e1`. Final commit and parity evidence will be recorded here. No remote repository exists.

| Boundary | Current target after coordinated rename |
| --- | --- |
| Package / intended public repository | `dsh-fishball` / `Arrosam/dsh-fishball` |
| Abbreviation / private native service | `df` / `ctx.df` |
| Admitted operator RPC channel | `/df-rpc`, same public DSH authentication carrier |
| Native client module / task panel | ModuleLoader ID `dsh-fishball`, bundle `lib/client.js`, df slot key, dsh-fishball display text |
| New synthetic fixture/storage names | df fixture IDs; `dsh-fishball.sqlite` for a genuinely new fixture |
| Historical tickets | DF same-suffix aliases; existing BUB filenames/AC/source text retained |
| ESM memory contracts | `df.fishball-memory/v1`, `df.memory-projection/v1`; only exact known prior bubbles formats may be structurally translated |

## Preservation rules

All historical commits, branches, frozen source hashes/TAP/review reports and approved source text retain their original names. Rename is a new logical commit. The repository directory may move within this authorized workspace without resetting Git history. No user data is deleted or rewritten to accomplish branding.

Existing configured database paths remain explicit. The synthetic runner must prefer an existing legacy `bubbles.sqlite` when no new-name database exists, and must reject ambiguous old+new stores rather than select a blank store or merge them. New synthetic fixtures use the new filename. Rewriting the project-owned stopped synthetic fixture's plugin path/ID is separate from rewriting ledger bytes; personal DSH profiles are untouched.

Owner/workspace/task/action/command/grant identities, action digests, schema versions and authenticated encryption AAD are unbranded and remain unchanged by the rename. Existing encrypted content, source/session events, reservations and unknown outcomes remain exact stored facts. No reference is recomputed from its stored hash. Compatibility checks use a real pre-rename synthetic encrypted store and verify content/metadata/read boundaries after the rename.

Known legacy memory contract labels may normalize on explicit caller-supplied snapshot/projection reads after full bounds/scope/schema checks; unknown/future labels fail closed. This does not inspect a file, import personal memory, or overwrite the old content. New writes emit current labels under normal CAS and new digest receipts. Existing tombstones/revisions/IDs remain intact.

## Separate crypto integrity remediation

The independent Stage2 CR11 finding showed that the initial encrypted format did not authenticate generation metadata. The security fix is independent of branding: records use explicit `cryptoVersion:2` and unbranded `runtime-data/v2` AAD over all immutable metadata plus scope/id/kind/digest. Nonempty prior encrypted format cannot prove the original producer metadata; it fails closed as `CRYPTO_LEGACY_UNVERIFIED` before business recovery/writes, with original bytes preserved. There is no automatic resealing or fabricated provenance.

Such a legacy store needs a separately authorized owner-provenance recovery step; the current native API provides no bypass. Empty/W1-only supported old schemas remain migratable. A prior-format rejection test is separate from the verified-v2 pre/post-brand compatibility test, so a security upgrade is not falsely attributed to the rename.

## Current module verification

The first renamed native-client batch passed14 of15 tests; exact host-capability validation correctly rejected the project-local runtime wrapper whose package name still used the prior brand. Root compared both wrapper lockfiles with only root wrapper-name fields omitted and verified all dependency entries identical, then synchronized those two project-owned wrapper metadata files. No install, download, dependency change or lifecycle script ran. The unchanged client/rename batch then passed15/15 with zero skips (`/tmp/df-rename-client-retest.tap`). Build reproducibility and51 JavaScript syntax checks passed. This does not count as the consolidated Stage3 regression.

The focused retained Stage2/rename runtime batch passed169/169,0 skips. The affected Stage3 module batch passed50 with3 actual-store tests explicitly skipped pending schema4. The public host smoke passed11 loads/10 reloads, zero inference calls, and preserved denial. These commands are bounded change verification, not consolidated acceptance.

## Independent corrective checks

RENAME-CR01 preserved an exact prior approved native ID/sessionRef; only unbound new creations use df. RENAME-CR02 replaced target-existence checks with filesystem-entry checks: a sole nonregular entry rejects STORE_PATH_UNSUPPORTED, unexpected filesystem failure rejects STORE_PATH_UNAVAILABLE, and both names always reject STORE_PATH_AMBIGUOUS. No entry is overwritten or bypassed. Independent encrypted crypto2 basename parity passes on both names; genuine crypto1 refusal remains byte-preserving. The reviewer reports hold the exact oracles and final snapshot.

Before the move the known stopped synthetic profile has fixture generation11, a sole legacy database, no3080 listener and database SHA256 `0144f7f05bd4e12fd9ecde786509437f3274d16b82d3184e7642d477c48bc7a1`. Root will rebase only its known fixture path/ID/database prefix after moving; all settings and database bytes must compare unchanged.

A late CR02 follow-on found a sidecar-only legacy namespace could select a blank new store. The corrective unit now treats SQLite main/WAL/SHM/journal entries as one namespace: both namespaces reject ambiguity, a sole sidecar-only namespace rejects STORE_PATH_ORPHANED, and any selected nonregular entry rejects STORE_PATH_UNSUPPORTED. All original bytes remain untouched. Initial rename commit `05f5bdd` and its35-file manifest are historical; this correction is a new logical commit and final manifest. The initial independent fixture counter error is retained in root-independent-first.tap; the corrected final run retains zero-work/permission assertions. Raw assertion TAP includes two whitespace-only lines, so git diff --check reports those evidence lines without a source-format defect.
