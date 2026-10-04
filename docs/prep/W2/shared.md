# Shared W2 candidate vocabulary

Status: mock-only preparatory contract, revision `bubbles.w2-prep/v1`. W1 browser acceptance remains HOLD. The [schema](../../../prep/w2/schemas/common.schema.json) defines bounded structural primitives; trust and runtime behavior below cannot be established by JSON validation.

## Identity, versions and time

- `scope` is exactly `{ ownerRef, workspaceRef, taskRef }`, each a lowercase SHA256 identifier reference. Refs are opaque equality keys, never bearer credentials. The trusted host adapter derives and checks scope from an immutable caller context before consulting the current ledger; a payload that repeats matching refs is not authenticated.
- `taskVersion` describes a factual snapshot. Mutations carry `binding.expectedTaskVersion` and `binding.expectedAuthEpoch`, never an instruction to overwrite a newer value. `binding.commandRef` is scoped idempotency identity. The command's entire normalized immutable action spec, target/data digests and budget units must be bound at a future atomic claim; equality of commandRef alone is insufficient if content differs.
- `authEpoch` is a factual authorization snapshot; epoch0 is valid before consent. A mutation binding requires the currently presented epoch. Only trusted in-process operator capabilities and the authority ledger can grant/revoke; no serialized role, approval flag, summary or schema-valid message can mint authority.
- `sessionRef` is a session identifier reference. `generationRef` is a separate incarnation/ownership reference, so a reused session ID cannot inherit an old mapping or grant. Worker lifecycle phases are separate proposed mapping facts, not new schema2 task statuses.
- `reservationRef` and `claimRef` name accountable admission/dispatch ownership. `actionDigest` is the common name for the complete immutable normalized action spec, including the scope/task/auth binding, target/data digests, resource/model policy and units/charges, and executor/environment/tools/permission bindings. It is not a worker-only subset or message body digest. Canonical byte serialization and digest computation remain future implementation work with cross-lane equality tests.
- A create intent can bind a preallocated generation and environment without knowing its future sessionRef. A newly discovered sessionRef attaches through a trusted receipt/mapping bound to the original actionDigest, claimRef and generationRef; it cannot mutate or rehash the approved intent. A resume intent can bind an already-known sessionRef.
- Time is bounded integer UTC epoch milliseconds. Wall-clock snapshots are not causal ordering proof. Version/CAS and the ledger's serialized claim define control ordering. Expiry is checked after acquiring the mutation lock; runtime/time/cost accounting needs its own trusted clock/source policy.
- Every schema has `contractVersion` fixed to `bubbles.w2-prep/v1`. Unknown versions/fields fail closed before a future side effect. Optional capability availability cannot be inferred from a version string.

## Evidence and outcomes

Evidence has an immutable ref, content digest, observedAt and sourceKind. Fixture evidence is always `mock`; `ledger_snapshot` and `native_observation` are candidate future provenance labels requiring independently checked trusted sources, never authority by payload declaration. Mutable artifact names/paths are insufficient evidence; version/content digests bind later review, verification and delivery. No raw task prose, credentials, host exceptions, personal memory or executable paths are placed in these wire fixtures.

Reserve `sourceKind` for evidence provenance. Context material classification uses `materialKind` (current instruction, ledger material, host snapshot, task material or summary), keeping classification separate from proof of origin. Every mock evidence object remains sourceKind=mock, including a fixture modelling a future native observation.

Keep axes separate:

| Axis | Example facts | Non-equivalence |
| --- | --- | --- |
| Task | queued, running, waiting, recovery_required, cancel_requested, terminal status | Action settlement does not complete the task. |
| Worker | create_requested, created, ready, running, terminal, unknown | Creation/ready alone does not prove execution. A create timeout does not prove no session exists. |
| Cancellation | requested, observed_stopped, unknown, completed_effect | Request/timeout does not prove termination or undo an effect. |
| Message | accepted, outbox_committed, sent, consumption_confirmed, unknown | Outbox/sent is not consumption; no arbitrary recipient exactly-once promise. |
| Artifact/verification | produced digest, verification evidence, stale review | Produced or worker self-report is not independent verification. |
| Delivery | pending, accepted, sent, delivered, failed, unknown | Task completion and recipient-observed delivery are independent. |

Unknown creates/effects/messages/deliveries keep accountable reservations and require query/reconciliation evidence before retry. Only confirmed release conditions may free capacity. Cancel/revoke first blocks a new atomic claim; a committed claim first remains in flight/uncertain. No instantaneous cancellation, unobserved effect rollback, automatic orphan deletion, blind resume/recreate/resend or hard billing cap is promised.

## Candidate integration boundary

W1's Foundation uses raw bounded identity inputs from trusted code and stores hashed refs, expectedVersion/expectedAuthEpoch CAS, actions, grants and active units in one transaction domain. Candidate prep names must be explicitly mapped; neither docs nor JSON examples add methods, tables, statuses, capabilities or native host APIs. Structured goals/context/message bodies and artifacts require a separate bounded scoped data plane with retention, digests and secret handling before implementation. They cannot be stuffed into the W1 reference-only metadata/history fields.

W1 intake uniqueness is exactly owner + workspace + provider + source + event; taskRef is the resulting association, not another uniqueness-key field. A duplicate with a changed taskRef cannot create a new entrance or rebind the original task. Stored SHA256 refs must never be passed as raw identity inputs to Foundation and hashed again; a future trusted adapter must preserve the explicit raw-input/ref mapping boundary.

The first actual vertical slice still requires coordinator → ledger task → one native DSH worker → local artifact → independent check → report/control. Model/provider mappings, first chat provider, UI extension entry, handoff, retention and measured resource policy remain pending. Model preference is Sol6.1 at least high for coding, max root-cause/audits and xhigh visual; do not treat Codex preference strings as a verified DSH catalog mapping or silently downgrade.

## Mock vector format

Each lane fixture file contains `fixtureKind: "mock"`, a `schemaId`, and `vectors`. Every vector has a unique `id`, nonempty `sourceAC` list, `technique`, `expectedValid`, `reason`, and `instance`. These vectors test candidate structural/schema invariants only. Semantic/runtime scenarios belong to independent test designs with explicit expected oracles, fault cuts and remaining native evidence. Schema-valid input still needs all trusted identity, current-state, permission, reservation and version checks.
