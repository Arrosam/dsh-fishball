# Mock-only candidate wire contracts

These schemas and fixtures are preparation artifacts on `prep/W2-contracts`, not production implementation or ticket acceptance. See [scope and ownership](../../docs/prep/W2/README.md) and [shared semantics](../../docs/prep/W2/shared.md). W1 browser HOLD and every later runtime/dependency gate remain open.

Schemas use JSON Schema draft2020-12 and private URN IDs, so validation performs no schema/network fetch. Ajv8.20.0 is already installed inside the reviewed pinned DSH Web runtime; the prep verifier will validate its local provenance before importing it. No install, lifecycle script, native DSH service, Foundation mutation, inference or browser navigation is required.

Root owns `schemas/common.schema.json`, the verifier and verifier evidence. Lane authors own their schema/fixture filenames only. Independent reviewers may add mock vectors under `fixtures/independent/`; no production directories or W1 artifacts may change.

Run from the repository root:

```sh
node --check prep/w2/verify.mjs
node prep/w2/verify.mjs
```

The verifier checks local validator manifest/entry and installed/tracked lock hashes before import, compiles all six schemas and checks every positive/negative vector without mutating input. It rejects external schema refs/extensions, nonmock evidence, unknown source AC/schema IDs, invalid/duplicate case IDs, missing lane/polarity cases and open top-level positive envelopes. Common-library vectors must target an explicit $defs fragment rather than the unconstrained library root. Exact options are strict:true with strictRequired:false (legal enclosing-object conditional declarations; required still enforced), validateFormats/coercion/defaults/property-removal disabled. No schema fetch/async loader exists.

The report is **schema_and_fixture_structure_only**. Source-AC annotations do not imply that runtime/native/permission/model/UI/provider oracles ran. In particular BUB014-04 remains visual test-design only. The independently reviewed future scenarios are in [test-design](../../docs/prep/W2/test-design.md); final evidence will name an immutable artifact snapshot.
