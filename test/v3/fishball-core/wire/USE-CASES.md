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

## MULTI-1: multiple DSH targets (system rows, multi.mjs)

Authority: PLAN-MULTI §3–§7, D01–D11, Q01–Q12; core contracts README "MULTI-0 amendment" (and its
security amendment), targets.d.ts, ui.d.ts, ask-card.d.ts, events.d.ts, link.d.ts; SEAM_TARGETS;
K1 MULTI-0 identity resource and push. Product code is opaque: core runs as an installed bundle in a
real standalone DSH (world.mjs), or a hosted child stand-in (fixtures/child-row: a row with the
published id `dsh-instance-child` and a volatile `targetUrl`, as the instance's own row). Targets are
fake DSH MCP servers (fake-dsh.mjs). Expected values: targets-oracle.mjs (the freeze, restated).

| Row | Technique | Oracle |
| --- | --- | --- |
| MULTI-TGT-EP-01 | EP (standalone first run) | `{version: 1, targets: []}`; GET `/api/fishball/targets` same; apiVersion 2; `ui.targets` members; scalar ui.link/connect/pairing and `/api/fishball/connect{,/cancel}` gone |
| MULTI-TGT-EP-02 | EP (URL classes) | insecure → `target-insecure`; malformed / blank → `target-invalid`; https → `t-`+16 id, `e-`+16 epoch, canonical URL; equal canonical URL (variant too) → `target-duplicate` |
| MULTI-TGT-DT-01 | DT (confirmed × known × endpoint change) | unconfirmed → `confirmation-required`, nothing changes; unknown id → `unknown-target`; same-endpoint edit keeps epoch, new endpoint replaces it; confirmed remove |
| MULTI-TGT-BVA-01 | BVA (12 targets, Q12 no cap) + ST (restart) | all accepted, ascending order; graceful restart keeps id/url/epoch/order |
| MULTI-TGT-EP-03 | EP (never discovered) | every TargetView field; name/serverName null; not-set; identity pending; removable/urlEditable true |
| MULTI-HOST-EP-01 set / blank | EP (hosted URL set / blank) | first target `parent`/`parent`, URL from the setting or not-set; not removable / editable (`target-reserved`); parent URL duplicate; an added target never configures DSH_AGENT_TOKEN, hosted-agent, pending-token-origin |
| MULTI-CRED-EP-01 | EP (same origin, two endpoints) | A's token saved only as `fishball-core/token-<id>-<epoch>`; refs differ; parent names untouched; no token in the snapshot |
| MULTI-CRED-ST-01 | ST (connected → URL edit → removed) | retired epoch's token record and reference gone; removal deletes the rest; no remote call |
| MULTI-CRED-EP-02 | EP (one CIMD) | one `connect.clientMetadataUrl` serves every target |
| MULTI-NAME-EP-01 | EP (discovery field) | name = `_meta[serverInfo].name` (title and top-level serverInfo are decoys); identity live; listen subscribes to both URIs |
| MULTI-NAME-EP-02 | EP (no identity resource) | identity unsupported; name still read |
| MULTI-NAME-DT-01 | DT (D07/Q03 examples) | A null, B (2); A renames → B stays; C lowest free; literal `Office-DSH (2)` counts; restart keeps allocations |
| MULTI-NAME-ST-01 | ST (rename into held name) | renamer gets (2); holder keeps its name |
| MULTI-NAME-ST-02 | ST (burst of 5 pushes; quiet window) | rediscovery follows the push; ≤ 2 discoveries for the burst; no discovery without push (no polling) |
| MULTI-NAME-ST-03 | ST (stream drop → reopen) | rediscovers after the new acknowledgement; picks up the changed name |
| MULTI-NAME-ST-04 | ST (transient discover failure → push) | name kept, identity stale; recovers live |
| MULTI-NAME-ST-05 | ST (auth refusal) | state failed; namespaced tools withdrawn |
| MULTI-TOOL-EP-01 | EP (exposed / withheld / local) | per target the frozen name for every exposed K1 tool and ask_user; no withheld or bare name; reminders once; ≤ 64 `[A-Za-z0-9_-]`; description = random-marker untrusted block with `toolSource(JSON name)`, then the trusted text |
| MULTI-TOOL-BVA-01 | BVA (README examples) | `办公室-DSH` → `dsh`; `<b>x</b>` → `b-x-b`; 200 chars → readable 16; raw name kept as display |
| MULTI-TOOL-ST-01 | ST (rename) | old names withdrawn, new offered; a call reaches only its own target; a withdrawn name never reaches another target |
| MULTI-TOOL-ST-02 | ST (URL edit during an in-flight call) | the call completes on the original endpoint only |
| MULTI-EVT-SYS-01 | EP (same eventId on A and B) | two manager messages `fbe_<handle>`; acks per target |
| MULTI-ASK-SYS-01 | EP (routes × unknown ids) | unknown handle 404; every target POST route with an unknown id 404 `unknown-target`; missing id 400/404; duplicate add 409; insecure add 400; unconfirmed remove 409 |
| MULTI-SVC-DT-01 | DT (bridge/attention × live / epoch mismatch / removed) | only the named target; mismatch and removed fail closed with `unknown-target`, nothing sent |
| MULTI-SVC-EP-01 | EP (status shape) | `{fishball, guards, set, targets}`; no scalar members; targets = list(); contributedTools 0 counted |
| MULTI-SVC-ST-01 | ST (two targets) | one manager session; reminder tools once |

Re-baselined WIRE-SYS rows (withdrawn oracles replaced): apiVersion 2 and `ui.targets` shape; the
no-target status is an empty target list (no scalar `line`); Connect runs on the per-target route with
an added target (the K3a routes answer non-200); "target settings" became "an added target appears in
the status snapshot" (the `target.url` setting is withdrawn).

### Ambiguities (not invented)
- Same origin, two endpoints: K3a's connector check pins the protected resource to `/api/agent/mcp`,
  so a second endpoint path on one origin cannot pass it; MULTI-CRED-EP-01 proves isolation with one
  connected and one unconnected target instead.
- The withdrawn K3a routes: "withdrawn" is checked as "not 200" (404 / 405 / 503 are all accepted).
- A target POST route body without `targetId`: 400 (malformed) or 404 (missing id) are both read from SEAM_TARGETS.
| MULTI-TOOL-EP-02 | EP (adversarial server name) | the name stays inside the random-marker block of every description; the persona names the scheme `mcp__<dsh>__<tool>_<id>` and no server name |

- Not asserted (not in the freeze): the implementer's trusted `DSH target id <id>.` line and the
  before-discovery wording of descriptions; only the frozen framing (`TARGETS.text.toolSource` inside
  the `TEXT.untrustedOpen/Close` block, then the trusted description) is checked.
