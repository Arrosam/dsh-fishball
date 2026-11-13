# `host-services`: the K3 freeze of a main DSH's host-only services

Types only (`*.d.ts`); nothing here runs. Sources:
[v3-design.md](<../../../docs/planning/v3-design.md>) §3.6, §4.1, §5.4; requirements R-CON-11,
R-HOST-05/06/09/10, R-UI-01/02/10; spikes V3-S3 `b4dca86` and V3-S4 `b9809b7`. Changing a name
or a code here is a K3 amendment.

| Service | Provider | Consumer (inject, optional) | Declared in |
| --- | --- | --- | --- |
| `fishballConnectorHandover` | fishball-connector | fishball-embed-ui | [handover.d.ts](<handover.d.ts>) |
| `fishballConnectorTokens` | fishball-connector | the instance's host row | [tokens.d.ts](<tokens.d.ts>) |
| `fishballChild` | the instance's host row | fishball-embed-ui | [child.d.ts](<child.d.ts>) |

- Each is a Cordis service of the same process, with `apiVersion: 1`. A consumer treats any other
  value as the service being absent (embed-UI then logs `instance-missing`).
- None is reachable over MCP, HTTP or from a browser. None carries a token value, a credential
  reference other than `createHosted`'s `ref`, or an entry label as a key.
- `fishballChild` is the instance's service. It is declared here so that its only consumer needs
  one type folder. The instance never imports this folder.

## Frozen choices

| Point | Frozen as | Source |
| --- | --- | --- |
| `handOver` refusals | `unknown-session`, `conflict`, `no-fishball`; checked in that order | design §3.6, HAND-DT-01 |
| Unknown or deleted principal key, unpaired entry | `no-fishball` (indistinguishable from a deleted entry) | HAND-DT-01 rows 7a, 8 |
| `takeBack` on an unmanaged session | `not-managed`, separate from `unknown-session` | decided by Fishball (V2's code) |
| `note` | optional; the event carries `''` when omitted | design §3.6 |
| `principals()` order | the order of the entries in the connector's native settings list | R-UI-10 "stable order" |
| online | an open `fishball-events` listen stream, as K1's `CONNECTED` | design §3.5, HAND-ST-02 |
| `retire` refusals | `unknown-entry`, `not-hosted`, `successor-unpaired`, `operation-failed`; all move nothing | R-HOST-09, HOST-DT-02 |
| `createHosted` failures | rejects with `credentials-unwritable` or `operation-failed`; creates nothing | design §5.2 |
| Child states and codes | V2's `STATUS` and `STATUS_CODES`, `INVALID_MAIN_HOME`, plus `PROFILE_INCOMPATIBLE`, `fishball-off`, `TARGET_UNREACHABLE`, `TOKEN_REFUSED`, `TARGET_INCOMPATIBLE`, `token-revoked` | design §6.1, §8.1, R-FB-10, R-HOST-10 |
| `targetStatus()` states | `connected`, `target-unreachable`, `token-refused`, `target-unset` (a reference with no value is `target-unset`) | design §4.1, HOST-UC-05 A1 |
| `admit` hostname | exactly `127.0.0.1`, `localhost`, `[::1]`; the caller passes the URL-parsed (lower-case) hostname; anything else rejects `hostname-refused` | S4-Q1 A, RFC 3986 §3.2.2 |
| `admit` views | `chat`, `settings` (V2's descriptor views) | instance `host.js` `PLUGIN.ui` |
| `retry()` | restarts only from `failed`; otherwise changes nothing (V2's rule) | HOST-ST-01 row 9 |
| `providerSync` | V2's `status` / `check` / `add`, unchanged | R-HOST-07 |

## Not frozen here

- What `fishball-hosted-settings` and the hosted sections show: instance-owned, through core's
  settings-section point (`packages/core/contracts/`).
- Behaviour: C-ROUTE (hand-over), C-SUCCEED (`retire`), I-HOST (`fishballChild`).
