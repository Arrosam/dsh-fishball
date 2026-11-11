# 9. Standalone Fishball and remote DSH (REM)

Requirements: R-FB-03, R-FB-04, R-FB-05, R-FB-07, R-FB-08, R-REM-01…04, R-OA-08, R-BND-05, §4
rows 9, 9b. Conventions: [README](<README.md>).

## Use Cases

### REM-UC-01 — The user sets up a standalone Fishball against a remote DSH
**Req:** R-FB-03, R-FB-04, R-FB-05, R-ID-07, R-UI-07, R-BND-05 · **Level:** integration (two DSHs), e2e (page) · **Flags:** P:S6, P:S7

- **Actor:** owner of DSH F (standalone) and of main DSH B.
- **Preconditions:** B runs C_B exposed over HTTPS (or a tunnel to loopback); F is an ordinary DSH.
- **Main flow:**
  1. The user installs the four tarballs in F with DSH's native "add plugin" and restarts F.
  2. F reports `target-unset`.
  3. The user creates entry Eb in C_B's native settings, stores its value in F's credential store under the reference named in `fishball-core`'s settings, and enters the target URL.
  4. Core authenticates (client id = `identity.id`, secret = the value, issuer pinned) and pairs.
  5. F's own web UI is the Fishball page; Fishball manages B's sessions with the same tool semantics as a local target (start, read, approve).
- **Alternative flows:**
  - A1. Only core installed (no features) → a full Fishball DSH without board, fold-notify, Watchdog.
  - A2. Watchdog installed but incompatible → DSH skips it at boot; core reports the member missing/skipped; Fishball gets "watchdog is down" once per start.
- **Exception flows:**
  - E1. Target unreachable → Fishball still runs; status `target-unreachable`; bounded backoff retries.
  - E2. C_B refuses the token → `token-refused`.
  - E3. Target URL `http://` to a non-loopback host → refused by `fishball-core` itself, before any request (the MCP SDK does not refuse it, S7 §4.4); no token, id or request reaches the host.
  - E4. The target redirects to another origin → the token is not forwarded.
- **Postconditions:** the token value is only in F's credential store; F never reads or writes any DSH's sessions except through C_B's MCP.

### REM-UC-02 — The remote connection is lost and restored
**Req:** R-REM-04, R-CON-05, R-CON-04 · **Level:** integration · **Flags:** —

- **Actor:** Fishball in F; C_B.
- **Preconditions:** Fishball manages S1 on B; S1 has a pending permission offer.
- **Main flow:**
  1. The network between F and B drops.
  2. S1 keeps running; the offer **waits** (no timer settles it).
  3. An answer attempted from F while down fails `disconnected` (D§6.3).
  4. The link returns → core re-listens, polls once, gets the offer and answers it.
- **Alternative flows:** A1. The user answers in S1 while F is offline → settled; F later gets the `settlement`.
- **Exception flows:** —
- **Postconditions:** no event lost; no session stopped.

### REM-UC-03 — The owner exposes the connector beyond loopback
**Req:** R-REM-01, R-REM-02, R-OA-08, R-REM-03 · **Level:** integration · **Flags:** P:S1

- **Actor:** owner of B.
- **Main flow:** with DSH's listener on loopback, `/api/fishball/mcp`, the OAuth metadata and the token endpoint answer on DSH's own port; there is no separate port or TLS setting.
- **Alternative flows:** A1. The owner exposes DSH's listener over HTTPS → the routes are reachable remotely.
- **Exception flows:**
  - E1. Non-loopback over plain HTTP → the routes are refused at load with one diagnostic (D§3.1: 503 `insecure-listener`); the token endpoint is not served either.
  - E2. A request with a present `Origin` outside the allowlist → 403, on the MCP endpoint and the token endpoint.
- **Postconditions:** nothing listens on any other port.

## Equivalence Partitioning

### REM-EP-01 — Target URL classes in `fishball-core`
**Req:** R-FB-03, R-FB-04 · **Level:** unit · **Flags:** P:S7 (row 6)

| # | Target | Expected |
| --- | --- | --- |
| 1 | blank | `target-unset` |
| 2 | `http://127.0.0.1:port/api/fishball/mcp` | allowed (loopback) |
| 3 | `http://localhost:port/…` | allowed (loopback) |
| 4 | `http://[::1]:port/…` | allowed (loopback) |
| 5 | `https://b.example/…` | allowed |
| 6 | `http://b.example/…` | refused by core before any request (not by the SDK); token never sent; no TCP connection opened |
| 7 | `http://192.168.1.5/…` | refused |
| 8 | malformed / `ftp:` | refused (K code) |

### REM-EP-02 — Listener exposure classes
**Req:** R-REM-01, R-REM-02 · **Level:** integration · **Flags:** —

| # | DSH listener | Expected for MCP, metadata and token endpoint |
| --- | --- | --- |
| 1 | loopback http | served |
| 2 | non-loopback https | served |
| 3 | non-loopback http | refused at load, one diagnostic |
| 4 | tunnel to loopback | served (counts as loopback) |

### REM-EP-03 — Origin header classes
**Req:** R-REM-03, R-OA-08, R-TOK-06 · **Level:** integration · **Flags:** K (allowlist setting)

| # | `Origin` | Expected (MCP and token endpoint) |
| --- | --- | --- |
| 1 | absent | continues to the token check |
| 2 | in the allowlist | continues |
| 3 | not in the allowlist | 403 before any token check |
| 4 | `null` | 403 (K) |
| 5 | DSH's own web origin, allowlist empty | 403 (K: default allowlist is empty per D§3.1) |

## Decision Tables

### REM-DT-01 — Core's target status
**Req:** R-FB-03, R-FB-04, R-HOST-05 · **Level:** unit · **Flags:** —

| Rule | Target set | Reachable | Token configured | Token accepted | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | no | — | — | — | `target-unset` |
| 2 | yes | no | — | — | `target-unreachable` |
| 3 | yes | yes | no | — | `token-refused` (K: or `target-unset`) |
| 4 | yes | yes | yes | no | `token-refused` |
| 5 | yes | yes | yes | yes | connected |
| 6 | yes, V2 connector | yes (404 on the route) | yes | — | `TARGET_INCOMPATIBLE` |
