# Stage3 independent integration review

Reviewer: `/root/code_audit`, requested Sol6.1 max, independent of root and implementation authors, separate from ISTQB. Ownership is evidence only. No author code/tests/Git, dependency install, host/browser/provider/inference, credential or remote action.

Status: **IN PROGRESS; no integrated Stage3, full ticket/MVP or release verdict.** Pure memory/clock/audit/client reviews are separate; typed schema4 and native product composition still require actual implementation and frozen-tree audit. Stage2 preliminary freeze was invalidated for authenticated data-metadata and well-formed-content findings. The corrected `88a25f0a6f12cf1371a40f1860052231b9fe2687` unit now independently passes bounded implementation review166/166 plus affected migration/WAL17/17; Stage3 cannot waive or weaken those boundaries.

## Owner decisions and compatibility

Owner selected dsh-fishball (df) and project MIT. Root owns traceable rename/license/notice commits and preserves historical BUB aliases/evidence. Review must distinguish new product/display/package identifiers from existing ledger refs, encrypted AAD, record/command digests, protocol versions, ingress source identities and replay receipts. Cosmetic replacement must not make old ciphertext unreadable, change action consent or move source dedup into a fresh identity. Unsupported old formats must fail closed with original bytes preserved; any supported migration is explicit, locked, backed up and independently tested.

The closed prior-v1 pre-rename schema3 synthetic store is now independently rejected `CRYPTO_LEGACY_UNVERIFIED`, retaining its exact131072 bytes and original action/grant/held mapping. Current records use explicit unbranded `runtime-data/v2` AAD authenticating every immutable authorization/provenance field. Genuine old ciphertext is not resealed using its unverified labels. The original generation-metadata forgery now rejects live read/list/reopen, and real DELETE crash-journal rejected-key/legacy/tamper cases preserve every original file byte and presence through a bounded private-copy preflight.

A separate verified-v2 pre-brand fixture is now prepared: schema3/cryptoVersion2, exact context/content digest and held claim/reservation; original task version3/authEpoch1. It isolates branding parity from the required crypto correction. Post-rename review must recover its exact content/digests/mapping and hold uncertainty, without changing the persistent hash/AAD/protocol identity. This compatibility execution and the final renamed tree remain pending.

No first chat provider was selected. Live chat/account/recipient delivery is explicitly **out of this phase**; generic contracts and safe mock-backed source/routing/delivery validation remain required. Live access is not established by schema/mock labels, and no account setup or credentials are authorized here. Existing source AC/history is retained with this current-phase scope decision recorded; not-run live cases are not passed.

MIT is the owner's current-project license decision, not inferred from a successful test or upstream README alone. Pinned owner-authored subset provenance/notice and packaging are reviewed concretely. No whole fishball application/dependency is incorporated, and future newly incorporated third-party code requires its own notice/provenance evidence. Publication stays conditional on full agreed acceptance.

## Required final integration checks

One authoritative store and private opaque-role handles; reviewed supported migrations/authenticated metadata; atomic current source/subscription/task/consent/budget/event/clock admission; unknown effects held without replay; native worker/context/message/result/runtime-audit data-plane composition; current semantic task/artifact/material audit gates with charged independent reviewer/repair rounds; explicit models/capability policy; no authority exposed through memory/client/fixture JSON; exact lifecycle/disconnect/cancel ordering; secret/canary-safe diagnostics/export/evidence.

Final deliverables will record exact committed files/trees/hashes, independent commands and failures/retests, local process/native-library evidence versus actual Web/browser/model oracles, and every retained/deferred/out-of-phase gate. No integration PASS precedes the corrected final executable freeze.
