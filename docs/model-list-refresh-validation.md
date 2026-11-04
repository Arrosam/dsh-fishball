# Model-list refresh: investigation and validation

## Investigation before changes

The dedicated picker already loaded `GET /api/fishball/models` on mount and had a bottom-row Refresh action. Its mounted component retained the last response; no subscription invalidated that component state when the main DSH configuration changed. The server did not cache the catalog: [HTTP route](<../src/http.js#L198>) delegates to [sessionController.modelCatalog](<../index.js#L147>), which rebuilds a projection of the current host LLM registry each call. JSON responses already carry `Cache-Control: no-store`. DSH's own picker calls the same remote host API, but its GUI-generation cache is not used by Fishball.

An incomplete catalog is not necessarily stale HTTP data: the host isolates provider failures, filters empty provider groups, and adapters may advertise no routable models when credentials/configuration are unavailable. The existing picker then displayed an empty value whenever its saved model was absent, even though the saved consent was still present. It also hid the unavailable warning when the entire catalog was empty.

Freshness here means **the current host-registry model metadata**, not forced remote-provider network discovery. In today's shared profile the host registry is main DSH's. An independent future Fishball runtime would require a separately approved metadata connection to query a different runtime; this change does not silently share model services or credentials.

## Implementation

- Existing Refresh action now sits beside the labelled native picker with explicit models wording, pending feedback and disabled concurrent activation while loading/saving.
- Each load uses the same endpoint with browser `cache: no-store`. A monotonic refresh signal also avoids cancellation if activations are batched before render.
- HTTP/network/JSON/application/display-contract failures retain the previous valid list. Provider-isolated failures remain visible beside successful groups.
- Saved and draft composite provider/model identities missing from the catalog remain disabled labelled unavailable options, including a completely empty refreshed catalog. Refresh never sends Save, clears consent/effort, changes defaults, or alters the composer gate.
- Effect cleanup prevents abandoned/unmounted requests from publishing stale results. The authoritative Save-response repair from `dfdb5a64` is retained unchanged.
- No new backend model source, configuration writer or credential operation was introduced.

## Validation scope

Tests are authored by a separate agent from observable requirements, using equivalence partitions, boundaries, decision tables and state transitions. The implementation author did not read test code while coding. Independent read-only review checks production source, host API evidence and test safety.

The new client tests use the existing registered-component VM harness with a backward-compatible optional GET/lifecycle seam rather than copying the harness. A separate throwaway real-host fixture changes its fake provider catalog between HTTP calls and checks the endpoint against the official catalog, partial provider failures, and unchanged saved selection/default/settings. No real credentials or active profiles are used. Real-browser viewport/keyboard verification is not claimed.

Final focused run: **118 tests passed, 0 failed, 0 skipped** on each of DSH **0.2.1-rc.2** and **0.2.1-rc.3** (new refresh suite **50**, existing dedicated-model suites **68**). Command: `FBTEST_DSH_RUNTIME=<installed-version>/node_modules node --test --test-reporter=tap test/model-list-refresh.test.mjs test/dedicated-model-*.test.mjs`; authoritative TAP summaries report about 42.2 s / 28.6 s respectively. Both owned jobs finished exit 0. A separate first client/Save run passed 47/47. Syntax and whitespace checks use `node --check client.js` and `git diff --check`. The complete repository suite is not rerun for this focused client change; prior full-suite environment limitations are disclosed in [start-session validation](<start-session-model-validation.md>).

## Separate design-only work

The [provider/API-key synchronization proposal](<model-provider-sync-design.md>) is pending user approval. No source-secret export, config import or credential-write code was built or run. The new native isolated-runtime proposal supersedes the older model-bridge assumptions for that design.
