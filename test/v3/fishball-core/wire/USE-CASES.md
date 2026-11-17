# F-WIRE core acceptance

Authority: fixed F-WIRE interface (2026-11-16), R-FB-01–14, R-REM-05, R-OA-14, Q-A3=B; frozen K3/K3a. Product source is opaque: bundles are installed, never imported for unit-level internal inspection. The architecture scan returns forbidden import specifiers only. Static patch checks use the SDK's public patch loader.

| Row | Technique | Observable oracle |
| --- | --- | --- |
| WIRE-EP-01..03 | EP | Public exports, forbidden dependency/import partitions, model seam, scoped tool tables |
| WIRE-DT-01 | DT | New main/preserved rows inserted once; all four retired rows absent |
| WIRE-SYS compositions | Integration/system, EP | Real standalone DSH: core; UI+core; board+UI+core, on both SDKs. Since SHELVE-BOARD "board" is the suite's stand-in bundle `fixtures/fishball-board` (one trivial row), never the shelved packages/board; WIRE-EP-02 no longer scans packages/board (SPLIT-DT-01 keeps the board's own rule) |
| WIRE-SYS SHELVE | EP (board absent / present / present and broken) | SHELVE-BOARD (the user, 2026-11-18: "fishball-board先从这次release中移除，我要改的地方太多了。先封存，留到下一批再说。所以不要预留在子实例的Fishball内。"): core's `set` is `{status: ok, missing: []}` in every composition, and with a copy of the stand-in DSH skips as incompatible; without the board the manager's prompt and tools never mention it |
| Service/manager | BVA/ST | Two ensure calls have one manager; the generated identity.id is never in the user's settings layer (DESIGN §20); restart keeps the manager id and the user layer. Generated id value/persistence: fishball-core/manager MGR-ID rows |
| Tools/persona | EP | Tools of the manager's own model request: ask/reminder/private-skill tools, read-only base set; none in DSH's global `tools.schemas()`; V3 persona names, retired names absent |
| Connect | DT | Loopback Host 127.0.0.1/localhost/[::1] on the listener's port × Origin http / https / absent → configuration refusal, never `web-callback-insecure`; GET/cancel shapes and no-store; callback no cookie returns 404 without pending attempt. Insecure partitions: todo E2E-CORE (DSH's fence refuses them with default trustedHosts) |
| Model | ST | Model of the manager's next request: unset → host default; routable → it, live; unroutable → default |
| Target | ST | line.kind target-unset → another kind after settings.mutate |

## Deferred
- E2E-CORE: cross-machine HTTPS callback completion and actual approval browser redirect. Includes matching Host web redirect_uri, callback state/issuer/PKCE success/error/replay and browser-cookie independence during an active attempt. No hosted child is launched.

## Harness boundaries / ambiguities
- The live selection is read as the model of the manager's next request (scripted model digest); Agent.options holds the create-time options only.
- Every Connect POST must pass DSH's own fence first (dsh-client-connection isTrustedApiRequest): Host loopback, bind address or trustedHosts, and Origin of the same authority. A foreign Origin (e.g. `http://127.0.0.1` without the port) is 403 before core.
- Connect configuration validation precedence among no target and no metadata is unspecified: loopback rows accept any declared configuration refusal, not an invented precedence.
- Core tool table representation is not frozen in prose, so the static row checks its serialized data for the required names. Runtime scope is checked separately.
- Fake connector is optional; no real connector is installed. Full OAuth round-trip belongs to existing link-save coverage and E2E-CORE.
- All test homes are under the repo's TEST_HOMES (os.tmpdir(); FBTEST_TEST_HOMES moves it), standalone profiles only. Both SDKs use the existing scripted host LLM. Browser binary points to a missing executable.
