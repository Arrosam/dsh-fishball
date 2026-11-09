# Evidence-backed supplemental test fixes

## FIX-1: resolve the SDK's ESM entry, not require conditions

Initial supplemental test commit: `db25239`.

First native runs on **both** SDKs exited 1 with 83 `hookFailed` records each, before any product assertions. [rc.5 evidence](<evidence/native-initial-0.2.1-rc.5.tap#L1-L25>), [rc.1 evidence](<evidence/native-initial-0.2.2-rc.1.tap#L1-L25>): `ERR_REQUIRE_ESM_RACE_CONDITION`, requiring cosmokit before concurrent Cordis ESM evaluation completed.

Cause: the supplemental hook passed `runtimeRequire.resolve('@deepseek-ai/schemastery')` into dynamic import in a `Promise.all`. The installed package exports `require` to `lib/index.cjs` and `import` to `lib/index.mjs` ([rc.5 manifest](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/schemastery/package.json#L17-L22>), [rc.1 manifest](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/schemastery/package.json#L17-L22>)). Resolving under require conditions selected CJS, unlike the product's ESM import. Concurrent Cordis ESM import then exposed the Node ESM/require race.

Correction: after the already-approved resolver hook is installed, import Cordis and Schemastery **sequentially by bare ESM specifier**. The explicit selected runtime still owns package resolution, and its ESM import condition now matches the product. Remove the unused file-URL helper. No assertions, expected values, cases, TODOs, product files or requirements change. Independent reviewer confirmed the fix from both installed export maps and the failure trace.

Classification: **supplemental test-driver defect**, not a product failure. All initial hook failures remain preserved and excluded from acceptance/pass totals. The corrected suite was rerun on both SDKs: **83 Pass / 0 Fail / 0 TODO / 0 skipped / 0 cancelled**, exit 0 on each. Final evidence: [rc.5](<evidence/native-final-0.2.1-rc.5.tap#L512-L520>), [rc.1](<evidence/native-final-0.2.2-rc.1.tap#L512-L520>).
