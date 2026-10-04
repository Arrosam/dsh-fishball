# dsh-fishball rename and stored state

Authority is the [owner amendment](owner-amendment-2026-10-04.md). Status: documentation/license/AC prepared; coordinated code and workspace rename follows the current Stage2 security remediation. Final commit and parity evidence will be recorded here. No remote repository exists.

| Boundary | Current target after coordinated rename |
| --- | --- |
| Package / intended public repository | `dsh-fishball` / `Arrosam/dsh-fishball` |
| Abbreviation / private native service | `df` / `ctx.df` |
| Admitted operator RPC channel | `/df-rpc`, same public DSH authentication carrier |
| Native client module / task panel | `dsh-fishball/client.js`, df slot key, dsh-fishball display text |
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
