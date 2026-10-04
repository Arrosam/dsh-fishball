# Owner amendment: dsh-fishball and current acceptance

Authority: newest owner decisions relayed from parent thread `01a0fa97-234d-744a-b992-afc652f53017`, source `Sentinel_ad4c52cef7548191bf3ee4f8f958c773`, 2026-10-04. They supersede contrary older planning statements. Historical source text, commits and exact-tree evidence remain intact.

## Name, license and publication

The current project is **dsh-fishball**, abbreviated **df**. The intended public repository becomes **Arrosam/dsh-fishball**. Development remains local; no remote repository, push or publication is authorized before the agreed full preview MVP is accepted. The owner chose MIT for this project. The project copyright attribution uses the verified configured local Git owner name, Arrosin; no personal email is published.

The bounded source-history audit of the pinned fishball memory subset found matching owner identities and AI trailers only, with no separate human contributor or conflicting notice. The pinned READMEs declare MIT; the absence of a full upstream root LICENSE is recorded rather than filled with a guessed upstream notice. The project MIT grant covers the owner-authored implementation here. See [source provenance](fishball-provenance.md) and the project third-party notice for the exact subset and dependency boundary. A future newly incorporated third-party source requires its own provenance review.

## Chat scope amendment

No first chat platform will be selected in this phase. The provider-neutral adapter contract remains required: trusted identity pairing and revocation, original source/conversation/thread routing, immutable event identity and edits, bounded attachments, rate/backpressure/disconnect, and uncertain-send/receipt semantics. Validate it with synthetic adapters and the authoritative native ledger. It must not claim production provider connectivity.

Actual chat-software implementation, live accounts, provider delivery and platform-specific authentication/attachment tests are **OUT OF THIS PHASE** by the owner's explicit decision. They are neither failed acceptance prerequisites nor mock-passed provider criteria. BUB010A remains a historical deferred subtask; no provider is guessed. BUB010-01 and provider-specific parts of BUB010-02..05, BUB013 and BUB016 apply in a future selected-provider phase. Their original source text is preserved for traceability; this amendment controls current applicability.

Current chat acceptance is DF010-C01..C05:

| Current criterion | Required contract validation | Historical source |
| --- | --- | --- |
| DF010-C01 | Only privately admitted paired owner identity may read/control a task; revoke, wrong window, group or stale binding fails closed. | BUB010-01/03, BUB006 |
| DF010-C02 | Complete source identity deduplicates; edits/deletes/order/thread changes cannot silently replace an admitted action or original route. | BUB010-02 |
| DF010-C03 | Replies and task access remain scoped to the admitted source/conversation/thread; forwarded payload claims confer no authority. | BUB010-03 |
| DF010-C04 | Bounded attachment descriptors retain trusted source/digest/access evidence; no local path alone establishes recipient delivery. | BUB010-04, BUB013 |
| DF010-C05 | Rate/disconnect and unknown send are visible; sent, delivered and currently accessible stay distinct, with reconciliation before retry. | BUB010-05, BUB013 |

DF016 current aggregate acceptance covers every otherwise applicable planned criterion plus these adapter criteria. It excludes the explicit future live-chat slice. Native DSH workers, actual task UI, memory, events, authorization, results, audit, fault and packaging criteria remain required. The three-stage implementation and later consolidated regression schedule remains unchanged.

## Ticket aliases and future ambition

Existing ticket files and BUB acceptance IDs are immutable historical aliases. DF001..DF016 map one-to-one to BUB001..BUB016; DF007A/DF007B and DF010A map to their same-suffix BUB subtask. Source BUB007-01..09 keeps its original parent AC numbering. Keeping the existing filenames avoids broken links and preserves all requirements; active reports may use both names.

Mobile fishball controlling the user's DSH through Hydrogen server-side tools is a much later ambition. No mobile remote-control, Hydrogen integration, server bridge, additional harness or daemon is implemented in this phase. Native DSH execution remains independent.

## Exact core boundary

This implementation privately translates the pinned fishball memory-domain data and TTL/confirmation rules, character-bigram Jaccard/cosine search, monotonic ID/session/turn semantics, snapshot and release JSONL migration into a standalone ESM module. No Kotlin compiler or Kotlin/JS artifact is used. The ESM module is the minimal reusable boundary; the DSH adapter supplies trusted isolation, encryption, CAS, source/confidence/revision/tombstones and context assembly. The task/action/approval ledger stays independent of memory.

Native lifecycle tests execute installed public DSH classes. Local deterministic provider streams are explicit mocks; no paid or external inference is performed. No claim is made that the whole fishball core, Android application, provider retrieval or personal memory is reused.
