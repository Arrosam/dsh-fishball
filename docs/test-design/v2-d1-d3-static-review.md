# D1–D3 independent static review

Base: `5d93891aa41bd9b716faa91306b22095d3b076c2`.
Branch: `dev/v2-compat-d1-d3`.
Reviewer: independent subagent `e784050b-c88c-488f-8dc6-6fc3033bae84`.

## Conclusion

No introduced blocking, high-confidence runtime defects found in the reviewed D1–D3 changes. This is static review, not a browser or end-to-end certification.

Reviewed negotiation and immediate-event ordering; upgrade refusal and owner-fenced detach; legacy interaction gates and pending approval notices; explicit descriptor validation contexts; retained settings; connector attention latch, sticky importance, page-open clear, and best-effort producer.

Two review clarifications were incorporated:

- The contract now accurately describes the approved marker-only semantic gate, without promising new per-interaction answer-capability routing.
- Existing connector config preserves inert legacy fields. Pre-split migration copies active declared settings only; old patch/store records remain untouched rather than being copied to the new namespace.

## Retained gaps (not introduced by this change)

1. **Synchronous handshake close:** the host emits its ready edge after sending welcome even if a synchronous transport closes during that send. Baseline has the same sequence. A future change should guard the current connection and its closed flag before emitting ready.
2. **Selective operation capability routing:** a custom peer advertising `interaction.timerfree` and ordinary inbox support can be considered interaction-ready without checking each interaction's answer capability. Fine-grained routing would require a separate decision and non-wire subtype tracking for pending approval notices; it is not part of the approved marker-only compatibility amendment.

No existing tests were edited by the reviewer. No test execution, browser, external network, model, live profile, installation or commit operations were performed during review. Immutable SDK package source was inspected read-only.

See the [independent test inventory](<v2-d1-d3-independent-inventory.md>) for execution evidence and superseded assertions.
