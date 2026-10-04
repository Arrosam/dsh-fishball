# W2 preparatory contracts

Status: preparatory artifacts only. W1 / M1 remains **HOLD** for the recorded Web browser gate; no W2 ticket is implemented or accepted here. This isolated `prep/W2-contracts` branch starts at W1 evidence commit `a4310d6f672cccd68d26d4c1025ce0b0b87647f4`. The retained `feat/M1-foundation` branch and local main are unchanged.

The owner authorized reversible local contract and ISTQB test-design preparation while acceptance is held. This permission does not waive W1's acceptance criteria or the [production integration prerequisite](../../waves.md). No production source, W1 tests/scripts/package, ticket AC, browser route, installed host, credentials, remote or paid inference is changed. Nothing in this directory grants runtime authority.

## Shared contract and ownership

Read [shared vocabulary](shared.md) before lane authoring. All candidate JSON wire schemas and mock vectors live under [prep/w2](../../../prep/w2/README.md), outside production directories. They are proposals for an implementation contract; they are not native DSH API definitions or a substitute for current host capability probes.

Root owns the shared vocabulary/schema, verifier, integration/conflict log and Git. Nonconflicting lane owners may author concurrently:

| Lane | Source tickets | Owned artifacts |
| --- | --- | --- |
| Coordinator/context | BUB002, basic BUB008 | coordinator-context.md; coordinator-context.schema.json and fixtures |
| Worker/environment | BUB004, basic BUB011 | worker-lifecycle.md; worker-lifecycle.schema.json and fixtures |
| Scoped broker and local result/control | BUB005, local BUB013, BUB014 control contract | scoped-messages.md, result-control.md; matching schemas and fixtures |
| Reservations and budgets | BUB012 | resources.md; resources.schema.json and fixtures |
| Independent ISTQB | All above | test-design.md, test-review.md; independent-review fixture directory |
| Independent contract/code audit | All above and root verifier | contract-review.md |

English delegated prompts; Sol6.1 high authors, max independent audits/test design. Root alone performs Git mutations. Freeze a final artifact snapshot, resolve findings and verify changed artifacts before final review.

## Gates and interpretation

Mock vectors can verify schema structure, finite bounds and candidate state-specific invariants. Future runtime test designs must separately cover trusted identity, atomic storage/permission claims, real worker lifecycle and receipt reconciliation, concurrency/process faults, actual model input isolation and UI/recipient evidence. A syntactically valid envelope proves no authorization, effect, delivery or cancellation.

No schemas or fixtures are loaded by bubbles. W1's schema2 ledger, private capability identity, current default-deny native dispatch/operator bridges and exact DSH Web0.2.1-alpha.1 pin stay unchanged. Any later bridge/migration is a separately reviewed W2 implementation after the dependency gate. No new harness, daemon, fishball copy, chat account or browser workaround is introduced.

Pending decisions are references to [the existing decision register](../../decisions.md), not defaults silently selected here. Source ticket IDs and all original acceptance criteria remain authoritative. Preparatory evidence will describe verified vectors versus unexecuted runtime test designs explicitly.

The initial [manual handoff](manual-browser-handoff.md) was withdrawn after the owner reported accessibility and effort constraints. Its readiness readback is historical and separate from W2 mock validation. [Official accessible browser-opening research and outcome](accessible-browser-research.md) records the subsequently authorized native automatic opening with URL printing disabled, verified loopback listener and local connections. Rendering/controls remain unreviewed; no W1 acceptance criterion or blocked automation route is changed.
