# Mock-only candidate wire contracts

These schemas and fixtures are preparation artifacts on `prep/W2-contracts`, not production implementation or ticket acceptance. See [scope and ownership](../../docs/prep/W2/README.md) and [shared semantics](../../docs/prep/W2/shared.md). W1 browser HOLD and every later runtime/dependency gate remain open.

Schemas use JSON Schema draft2020-12 and private URN IDs, so validation performs no schema/network fetch. Ajv8.20.0 is already installed inside the reviewed pinned DSH Web runtime; the prep verifier will validate its local provenance before importing it. No install, lifecycle script, native DSH service, Foundation mutation, inference or browser navigation is required.

Root owns `schemas/common.schema.json`, the verifier and verifier evidence. Lane authors own their schema/fixture filenames only. Independent reviewers may add mock vectors under `fixtures/independent/`; no production directories or W1 artifacts may change.
