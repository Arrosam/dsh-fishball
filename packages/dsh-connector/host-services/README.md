# `host-services`: the K3 freeze of a main DSH's host-only services

Types only (`*.d.ts`); nothing here runs. Sources:
[v3-design.md](<../../../docs/planning/v3-design.md>) §3.6, §4.1, §5.4; requirements R-CON-11,
R-HOST-05/06/09/10, R-UI-01/02/10; spikes V3-S3 `b4dca86` and V3-S4 `b9809b7`. Changing a name
or a code here is a K3 amendment.

| Service | Provider | Consumer (inject, optional) | Declared in |
| --- | --- | --- | --- |
| `dshConnectorHandover` | dsh-connector | dsh-connector-ui | [handover.d.ts](<handover.d.ts>) |
| `dshConnectorTokens` | dsh-connector | the instance's host row | [tokens.d.ts](<tokens.d.ts>) |
| `dshInstanceChild` | the instance's host row | dsh-connector-ui | [child.d.ts](<child.d.ts>) |
| `dshConnectorUi` | dsh-connector | dsh-connector-ui | [ui.d.ts](<ui.d.ts>) |

- Each is a Cordis service of the same process, with `apiVersion: 1`. A consumer looks it up at
  runtime (`ctx.get`); a trailing `?` in `inject` is not optional injection in Cordis. A consumer treats any other
  value as the service being absent (embed-UI then logs `instance-missing`).
- None is reachable over MCP, HTTP or from a browser. None carries a credential reference or an
  entry label as a key, and none carries a token value except `createHosted`'s answer, which
  returns the new hosted value once, in process, to the instance (K1d; design §5.4, R1).
- `dshInstanceChild` is the instance's service. It is declared here so that its only consumer needs
  one type folder. The instance never imports this folder.

## Frozen choices

Rows marked PROPOSED are **product choices**, not taken from the spec or a user decision. They are
frozen as they stand (decided 3 = A), and the user may still change any of them. Rows marked
DECIDED (#n) are ones the user kept at the value review (relayed by Fishball; #n is its row in
[the decisions table](<../mcp-schema/README.md#user-decisions>)).

| Point | Frozen as | Source |
| --- | --- | --- |
| `handOver` refusals | `unknown-session`, `conflict`, `no-agent` (design §3.6); checked in that order (PROPOSED) | design §3.6, HAND-DT-01 |
| Unknown or deleted principal key, unpaired entry | `no-agent`, indistinguishable from a deleted entry (DECIDED #11) | HAND-DT-01 rows 7a, 8 |
| `takeBack` on an unmanaged session | `not-managed`, separate from `unknown-session`; no other refusal (DECIDED #12) | the user (K3) |
| `note` | optional; the event carries `''` when omitted | design §3.6 |
| `principals()` order | the order of the entries in the connector's native settings list (PROPOSED) | R-UI-10 "stable order" |
| online | an open `agent-events` listen stream, as K1's `CONNECTED` | design §3.5, HAND-ST-02 |
| Principal `key` stability | "stable for the life of the token entry" holds from pairing onward; an unpaired entry's key changes once, when it pairs (DECIDED #W3-3) | K3 note at the W3 merge |
| `onChange` | K3 amendment (I-SUCCEED, the user's Q1 = C, 2026-11-17): `fn()` after each pair-store change (K1 `PairStore.onChange`); the instance retries a `successor-unpaired` `retire` on it | R-HOST-09, HOST-DT-02 #2 |
| `retire` refusals | `unknown-entry`, `not-hosted`, `successor-unpaired`, `operation-failed`; all move nothing (codes DECIDED #13) | R-HOST-09, HOST-DT-02 |
| `createHosted` answer | `{entryKey, label, value}`, the value once and to the instance only; the connector keeps its digest only (K1d) | design §5.4, §5.9; R1 |
| `createHosted` failures | rejects with `operation-failed`; creates nothing (DECIDED #14). `credentials-unwritable` is the instance's now: the child could not store the value (K1d, PROPOSED) | design §5.2, §5.4 |
| Child states and codes | states `disabled`, `waiting`, `starting`, `ready`, `stopping`, `stopped`, `failed`; lifecycle codes `NATIVE_START_FAILED`, `NATIVE_STOP_FAILED`, `NATIVE_CHILD_EXITED`, `NATIVE_UNAVAILABLE`, `NATIVE_TIMEOUT`, `NATIVE_DISABLED`, `INVALID_MAIN_HOME`, `PROFILE_INCOMPATIBLE`; target codes `TARGET_UNREACHABLE`, `TOKEN_REFUSED`, `TARGET_INCOMPATIBLE`, `token-revoked` (in `targetStatus()` only); no `fishball-off` (I-HOST, Q4 = A: R-FB-10 amended by 1.39) | [child.d.ts](<child.d.ts>); design §6.1, §8.1, R-FB-10, R-HOST-10 |
| `TargetCode` URL refusals | `target-insecure` (plain `http:` to a host that is not a loopback name), `target-invalid` (not an `http:` / `https:` URL); core refuses the URL before any request, with state `target-unset` (DECIDED D5) | R-FB-04, REM-EP-01 rows 6–8 |
| Runtime values of `TargetState`, `TargetCode` | K1's `TARGET_STATE`, `TARGET_CODE` (`dsh-connector/mcp-schema`): this folder stays types only (DECIDED D7) | K3 amendment 2026-11-14 |
| `targetStatus()` states | `connected`, `target-unreachable`, `token-refused`, `target-unset` (design §4.1), answered from the host's own state: the last hosted entry's `entryState` and the instance's `targetUrl` (I-HOST, Q3 = A; the instance cannot read core's link since 1.39) | requirements 1.39, the user's answer Q3 |
| Status naming the blocking bundle | `status().plugin` beside `PROFILE_INCOMPATIBLE` (PROPOSED) | R-HOST-11 (4), HOST-ST-01 #3 |
| `admit` hostname | exactly `127.0.0.1`, `localhost`, `[::1]`; the caller passes the URL-parsed (lower-case) hostname; anything else rejects `hostname-refused` (code DECIDED #15). The child listens on `127.0.0.1` only, so `[::1]` rejects `not-ready` (I-HOST, Q5 = A) | S4-Q1 A, RFC 3986 §3.2.2 |
| `admit` while the child is not ready | rejects `not-ready` (code DECIDED #16) | design §4.1 |
| `admit` views | `chat`, `settings` | instance `host.js` `PLUGIN.ui` |
| `retry()` | restarts a `failed` child; on `token-revoked` with a `deleted` hosted entry it creates **no** token (K1d: R6 = B, R11) and records the notice `hosted-entry-deleted`, which lists Reconnect, core's token field and Connect; otherwise changes nothing (I-HOST updated `child.d.ts`) | R-HOST-10 (1.29 R6, 1.31, 1.33 Q-B1), HOST-ST-01 row 9 |
| `reconnect()` | one `createHosted`, imported once; refusals `not-ready`, `connector-missing`, `target-remote`, `operation-failed`, `credentials-unwritable` (PROPOSED spellings) | R11, 1.33 Q-D1 B, Q-B1 B |
| `entryState(entryKey)` | read-only `enabled`, `disabled` (switched off only; a value never changes, K1d), `deleted` (also an unknown key) | decided 1 = A; design §5.3 |
| `providerSync` (model-list sync) | `status` / `check` / `add`: Check lists the host's providers the child lacks, Add copies the ticked ones. It copies providers and their model lists only, never a default or session model: the model Fishball uses is chosen inside the child (the user, 2026-11-16). It runs once on its own at first install, when a newly created child first becomes ready (a Check, then an Add of every missing provider; the instance's `initial-model-sync.json` marker in the runtime folder records it, and a refused attempt is tried again at the next start); every later sync is the owner's, on the instance's settings page (the user, 2026-11-16: "instance初次安装时同步一次") | R-HOST-07, 1.41 Q-G7 |
| `dshConnectorUi` | C-UI-BACKEND's choices frozen unchanged by I-HOST: service `dshConnectorUi`, routes `/api/dsh-connector/ui/{state,events,handover,takeback,notice/dismiss,opened}`, snapshot `{marks, targets, attention, notice, light}` | requirements 1.34, plan §4 K3b |

## Not frozen here

- Behaviour: C-ROUTE (hand-over), C-SUCCEED (`retire`), I-HOST (`dshInstanceChild`), C-UI-BACKEND (`dshConnectorUi`).
