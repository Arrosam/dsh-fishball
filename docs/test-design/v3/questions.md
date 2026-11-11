# Test-planning questions (TQ)

Found while writing the cases from requirements and design at `e1e5577`. **Decided** questions
keep their entry as a record; their answer is folded into the requirements, the design and the
cases (status column). Each is a gap or
contradiction where the requirements do not fix an observable result. Cases that depend on one
carry its `TQ-n` flag and show the **recommended** answer as the expected result. Numbers are
stable. Ordered by how many cases depend on them and how much they block implementation.

The prefix `TQ` avoids clashing with the requirements' own `OQ-14` (first committed outcome wins).

| # | Topic | Status | Tasks (v3-tasks.md) | Cases |
| --- | --- | --- | --- | --- |
| TQ-1 | Direct-access split vs ids containing a dot | **decided C** (2026-11-11) | C-OAUTH, F-PAIR | AUTH-UC-07, AUTH-BVA-04, AUTH-DT-03 |
| TQ-2 | Revocation: fate of item kinds §5.3 does not name; designated role | **decided A** (2026-11-11) | C-REVOKE | AUTH-UC-06, AUTH-DT-04 |
| TQ-8 | Hand over edge cases: designated not connected / disabled; already managed | **superseded** by 1.20 (chosen target); edges now Q-HO-1 | C-ROUTE, U-MARKS | HAND-UC-01, HAND-DT-01, HAND-ST-01 |
| TQ-10 | Watchdog decision for "beyond scope, not dangerous, not high-risk" | open | WD-DECIDE | WD-DT-01 |
| TQ-11 | Watchdog supervision when Fishball stops managing the session | open | WD-PATROL | WD-ST-02 |
| TQ-9 | First patrol after a new claim or resume | open | WD-PATROL | WD-UC-03, WD-BVA-02, WD-ST-02 |
| TQ-3 | Token request without `resource` | **decided A**, confirmed by S7 (2026-11-11) | C-OAUTH | AUTH-EP-01 |
| TQ-4 | Token creation edge cases: minimum length value, store not writable, shared `ref` | **decided A** (2026-11-11) | C-TOKENS | AUTH-UC-01, AUTH-EP-04, AUTH-BVA-03 |
| TQ-5 | Access tokens across a connector restart; in-flight request at revocation | **decided A** (2026-11-11) | C-OAUTH | AUTH-UC-03, AUTH-UC-06 |
| TQ-6 | Newline in names; page text for `name-invalid` | open | C-PAIR, F-PAIR | NAME-UC-02, NAME-EP-01, NAME-DT-03 |
| TQ-7 | Does a disabled entry still hold its name? | open (default series gone with Q-NAME-1; still decides `name-taken` for a disabled entry's name) | C-PAIR | NAME-BVA-02 |
| TQ-12 | `notifyWhenFinished` passed by an old client: refuse or ignore | open | C-TOOLS | WATCH-UC-01 |
| TQ-13 | Two plugin names normalising to one namespace | open | C-EXT | EXT-EP-02 |
| TQ-14 | Contributor `emit` with an unknown `sessionId` | open | C-EXT | EXT-DT-02 |
| TQ-15 | Designated-Fishball default when the user already chose one | open | I-HOST | HOST-UC-01 |
| TQ-16 | "No principal connected" for a managed session's permission request | open | C-ROUTE | PLAT-UC-03 |
| TQ-17 | Standalone status when an optional feature is simply not installed | open | F-STATUS | PLAT-DT-02 |

---

**TQ-1. Direct access `<id>.<token>` when the id contains a dot.**
*Background:* R-ID-02 allows `.` in a fishball id. R-OA-10 splits the bearer value at the
**first** dot. An id such as `fb.1` can therefore never use direct access: `fb.1.<token>` splits
into id `fb` and token `1.<token>`. The generated core ids (`fb-` + base32) contain no dot, so this
only hits user-chosen ids and external agents.
- A. Split at the **last** dot instead. Generated tokens are base64url (`fbt_…`), which has no dot;
  a user-set token with a dot would then break instead.
- B. Keep the first-dot split and refuse direct access for ids containing a dot (documented); the
  token endpoint still works for them.
- C. Keep the first-dot split and forbid dots in ids altogether.
*Recommendation:* **B.** It changes no decided rule, keeps the OAuth path for every id, and the
case is narrow (no default id has a dot).

**Decided 2026-11-11: C.** Ids may not contain a dot. Now R-ID-02 (`A–Z a–z 0–9 _ -`), R-OA-10
(the first dot always ends the id), R-ID-10; design §5.5. A dotted id gets `invalid_client` at the
token endpoint, so it can never reach `pair`; `fishball-core` refuses it as `identity.id` with
`id-invalid` (the code family of `name-invalid`, `tool-invalid`, `event-invalid`). Names may still
contain dots. Cases: AUTH-EP-03 rows 2a–2d, AUTH-BVA-02 row 7, AUTH-BVA-04 rows 7–10, AUTH-UC-07 E4,
AUTH-DT-03 rule 3.

**TQ-2. Revocation of item kinds the design does not name, and of the designated role.**
*Background:* R-TOK-05 defers to design §5.3, which names live offers (to the user), queued
`message` / `turn-finished` / `state` (kept 30 days) and managed sessions. It says nothing about
queued `ask`, `handover`, `takeback`, `notice`, `contributed:*` and `settlement` / `retirement`,
about **delete** (as opposed to disable) for the kept kinds, or about the designated-Fishball role
held by a revoked entry.
- A. Disable keeps **every** non-offer event for 30 days and keeps the designated role (so
  `ask_fishball` answers `unavailable`, R-ROUTE-04, until re-enable); delete drops every event and
  clears the role (falling back to "none designated").
- B. Disable drops `ask` (the asker already got `unavailable`-like semantics) and keeps the rest;
  delete as A.
- C. Freeze per kind at V3-K.
*Recommendation:* **A.** One rule per action, nothing silently lost on a disable that the user can
undo, and the designated setting simply points at an entry that is off.

**Decided 2026-11-11: A** (an earlier relay of B was withdrawn before it was applied). Now R-TOK-05
and design §5.3. Disable: live offers withdrawn to the user; every other queued event, `ask`
included, kept 30 days; designated role kept. Delete: all events dropped; designated role cleared.
A dropped `ask` (delete, or after 30 days disabled) answers `unavailable` to the waiting
`ask_fishball`, the code it already uses when no principal is available. Cases: AUTH-UC-06,
AUTH-DT-04, EVT-ST-01 rows 6–6c.

**TQ-8. Hand over edge cases.**
*Background:* R-ROUTE-05 refuses a Hand over with `no-fishball` only when **none is designated**.
It does not say what happens when the designated principal is disabled, or designated but not
connected, or when the session is already managed (by D or by another principal).
- A. Designated but not connected → accepted, the event waits in D's mailbox; designated entry
  disabled → `no-fishball`; already managed → refused with a stable code (`conflict`), manager
  unchanged.
- B. As A, but "not connected" is also `no-fishball`.
- C. Already managed → Hand over re-assigns the session to D (with a `takeback` to the old manager).
*Recommendation:* **A.** The mailbox is durable, so a disconnected Fishball loses nothing; a
disabled entry cannot answer at all; and re-assignment would need its own design for live offers.

**TQ-10. Watchdog's decision for a request that is beyond the task but neither dangerous nor
high-risk.** R-WD-09's four outcomes: allow = in scope **and** low risk; reject = beyond the task
**and** dangerous. Recommendation: rule (4), re-route to Fishball, because it is not high-risk and
neither allow nor reject applies; the requirement should say so explicitly.

**TQ-11. Watchdog supervision of a session Fishball no longer manages.** R-WD-00 says Watchdog acts
only on sessions its Fishball manages, but nothing says what happens to its claim and patrol timer
after `session_release`, Take back or a revocation. Recommendation: the claim ends at once (same as
a pause without the stop), the timer is cancelled, and Fishball gets no notice beyond the event it
already receives (`takeback`, or its own release).

**TQ-9. When is the first patrol after a new claim (or after `watchdog_resume`)?** R-WD-04 fixes the
spacing but not the phase. Recommendation: claim time + interval (no patrol at once), which
matches "no Fishball operation starts a Watchdog run" (R-WD-03, R-WD-15).

**TQ-3. Token request without `resource`.** R-OA-05 says the client **must** send RFC 8707
`resource`; design §5.5 step 5 only checks it "when present". Recommendation: follow the
requirement and answer `invalid_target` when absent, after confirming that the stock
`ClientCredentialsProvider` sends it (spike V3-S7).
**Decided 2026-11-11: A.** Spike V3-S7 (`8e92b84`, `docs/spikes/v3-s7.md`) confirmed that the stock
`ClientCredentialsProvider` (`@modelcontextprotocol/client` 2.2.0, both SDKs) sends `resource`, so
the B fallback is dropped. Now R-OA-05 and design §5.5 step 5. Cases: AUTH-EP-01 rows 8, 8a.

**TQ-4. Token creation edge cases.** The minimum length for a user-set value is not stated
(R-TOK-08); nor is the status when the credential store cannot be written, or the behaviour of two
entries sharing one `ref`. Recommendation: freeze the minimum at V3-K as 32 characters; an
unwritable store gives the entry status `token-unconfigured`; a duplicate `ref` is refused at
settings validation (`ref-duplicate`).
**Decided 2026-11-11: A**, exactly as recommended. Now R-TOK-08 and design §5.2/§5.6. Cases:
AUTH-UC-01 E1–E3, AUTH-EP-04 rows 2–7, AUTH-BVA-03 (31/32/33).

**TQ-5. Access tokens across a connector restart, and requests in flight at revocation.**
Recommendation: access tokens do not survive a connector restart (clients get 401 and
re-authenticate, R-OA-07); a request already past the token check completes, and the next one is
refused ("next request", R-TOK-05).
**Decided 2026-11-11: A.** Access tokens live in memory only. Now R-OA-05, R-TOK-05 and design
§5.3/§5.5. Cases: AUTH-UC-03 A2, AUTH-UC-06 E1, AUTH-DT-04 rule 2a.

**TQ-6. Names: newline and page text for `name-invalid`.** Is `\n` whitespace (collapsed) or a
control character (refused)? R-NAME-03 defines the page for `name-taken` only. Recommendation: all
Unicode whitespace including `\n` and `\t` is collapsed before the control-character check; the
page shows `name-invalid` the same way as `name-taken`, with the reason.

**TQ-7. Does a disabled entry's principal still hold its name?** Recommendation: yes (the pair is
kept and re-enabling restores the same principal, R-ID-09), so defaults skip it.

**TQ-12. `notifyWhenFinished` from an old client.** Recommendation: refuse with
`invalid-arguments` (schemas are strict), so an old client learns the argument is gone.

**TQ-13. Two plugin names that normalise to the same namespace** (`@a/b` and `a-b`).
Recommendation: the second registration is refused `namespace-reserved` (first wins), logged once.

**TQ-14. `emit` with an unknown `sessionId`.** Recommendation: refuse `event-invalid`; routing an
unknown session to the designated Fishball would hide contributor bugs.

**TQ-15. Designated-Fishball default when the user already chose one.** Recommendation: the
hosted entry becomes the default only when `routing.fishballToken` is unset.

**TQ-16. "No principal connected" and managed sessions.** R-CON-09 sends a managed session's
permission request to the user when no principal is connected. With several principals, is it the
**managing** principal's connection that counts? Recommendation: no; the offer always goes to the
managing pair's mailbox and waits (R-CON-05, R-REM-04); R-CON-09 applies only when the session has
no managing principal.

**TQ-17. Standalone status when a feature plugin is not installed.** R-BND-05 says core reports a
"missing or skipped member". Recommendation: report only members that are **enabled but skipped
or failed**; a feature that is simply not installed is not "missing" (row 13b says core alone is a
full Fishball DSH).

## Repackaging questions (from the R-CORE session 884eb6c5, 2026-11-11)

These are about where code lives, not about behaviour. Status: TQ-R1 **decided A**, revised by
TQ-R3; TQ-R2 **decided** (the user's own design); TQ-R3 **decided B**, resolved by `fishball-shared`;
TQ-R4 **decided B**; TQ-R5 **decided B**.

**TQ-R1. Who owns modules used by both the child (moving to core) and the instance host?** The
`admin.js` constants, the provider-sync codec, `native-runtime/files.js` (used by
`skills-store.js`), and the helpers `child-web/fishball-settings` imports.
- A. `fishball-core` owns them; the instance imports them from `fishball-core`.
- B. A small new shared package that both import.
- C. The instance owns them; core imports from `fishball-instance`. That breaks R-FB-01 (the same
  core package works standalone, without an instance).
*Recommendation:* **A.**

**Decided 2026-11-11: A, core owns them.** The user, verbatim: "Instance是在DSH侧安装的插件，Core是在
Fishball侧安装的插件，归Core" (the instance is a plugin installed on the DSH side, core is a plugin
installed on the Fishball side, so they belong to core). Applied as the **side rule** in
v3-tasks.md W1. *Partly revised by TQ-R3:* modules used by **both** sides now go to
`fishball-shared`; Fishball-only logic stays in core; DSH-only logic stays in the instance. The
user's framing classified the four modules `child-web/fishball-settings` imports
(`src/native-web.js`, `settings-relay.js`, `src/slim/host/*`, the instance `client.js`) as DSH-side
host logic: they stay in the instance (TQ-R2).

**TQ-R2. Does the hosted-only settings panel belong in core?** `child-web/fishball-settings`
includes hosted-only controls (instance settings relay, the hosted status line) and imports
DSH-side host modules.
- A. All of it goes to core; the hosted-only controls show only when the child runs hosted.
- B. Core keeps the generic slim settings; the hosted-only controls move to embed-UI's Plugins card.
*Recommendation:* **B.**

**Decided 2026-11-11: neither A nor B.** The user, verbatim: "Core放通用设置，寄宿专用的由instance注入"
(core holds the generic settings; the hosted-only ones are injected by the instance). Now R-HOST-11,
with R-ARCH-05, R-HOST-01, R-HOST-04 clarified, and design §1.1/§1.2/§6.1/§6.2. Core's panel holds
only the generic settings plus a generic settings-section extension point (frozen in K3). The
instance owns and injects the hosted-only sections, so the DSH-side modules and the status-line
module stay in the instance and core never imports them. The model-sync trigger stays on
embed-UI's host Plugins card: R-HOST-07 still holds, because all host UI is embed-UI's (R-ARCH-04)
and the instance contributes no host UI (R-ARCH-05); only the engine is the instance's. Cases:
HOST-UC-08, HOST-EP-03.

**TQ-R3. May the instance's host code import Fishball-side modules from core?** TQ-R1 made the
instance host import core's admin constants, provider-sync codec and file helpers; R-BND-01 says
"the host DSH never resolves, lists or loads these plugins".
- A. Clarify R-BND-01 to "never as plugins"; the instance may import side-effect-free modules from
  its packaged copy of core.
- B. Keep R-BND-01 strict.
*Recommendation:* **A.**

**Decided 2026-11-11: B, resolved by a shared package.** First answer: B (R-BND-01 stays strict;
the host loads no module of the set). That collided with TQ-R1's placement of shared modules in
core. The user then resolved it, verbatim: "建立公共包" (create a shared package). Modules used by
**both** sides go to the new library; Fishball-only logic stays in core; DSH-only logic stays in
the instance; neither imports the other.
Choices made (no product choice involved): npm name **`fishball-shared`**, folder `packages/shared`;
a library with no `dsh` field (never a plugin, never in a Plugins page, not a set member); imports
no other V3 package; versioned with the other V3 packages; shipped inside the core and instance
tarballs through `bundleDependencies`, because V3 publishes nothing to a registry (requirements §5).
Contents: the child `admin` constants, the provider-sync wire codec, the file helpers both sides
use. Now R-ARCH-01, R-ARCH-08 (new), R-FB-01, R-BND-01, glossary; design §9.1; tasks R-SHARED,
R-CORE, I-PLACE, DOCS. Cases: PLAT-EP-07 (new), HOST-EP-03.

**TQ-R4. How does the instance load its hosted-only settings sections into the child?**
- A. One **launch-overlay row**: not a plugin, not in the child's Plugins page, not switchable.
- B. A fifth **placed bundle**, listed in the child's Plugins page and switchable like the set
  members.
*Recommendation:* **A.**

**Decided 2026-11-11: B** (an earlier relay of A was withdrawn; its edits were replaced before any
commit). The bundle is **`fishball-hosted-settings`** (row id the same), source
`packages/instance/bundled/hosted-settings/`. Only the instance places it, only in a hosted child;
a standalone Fishball never has it. It is listed on the child's Plugins page and switched like a
set member, but it is **not** a set member: R-FB-01's set stays four plugins. Applied rules, all
carried over from the set's (no new product choice): one placement record with the set; on at
first placement; a disable survives; deleted while off re-placed off; switched off → the hosted
sections are absent with no error; enabled and incompatible → blocks the child's start (R-BND-03);
core's guards never target it and `guards-overridden` ignores it; core's set-completeness status
ignores it. Now R-FB-01, R-HOST-01, R-HOST-04, R-HOST-11, R-BND-01..04, R-MIG-02, glossary; design
§1.1, §6.2, §8.1, §9.1. Cases: HOST-UC-08, HOST-EP-03 rows 6–7, HOST-DT-03; tasks I-PLACE,
F-GUARDS, F-STATUS.

**TQ-R5. May the connector or embed-UI also use `fishball-shared`?** Today nothing they need is in
it: the connector's contract is `./mcp-schema` (K1), and embed-UI only reads host-side services.
- A. No: core and the instance only. Anything the connector or embed-UI share with Fishball goes
  through the connector's `./mcp-schema` / `./tools` contracts, as now.
- B. Yes, any V3 package may depend on it.
*Recommendation:* **A.** The library stays the small core↔instance overlap the user asked for, and
the connector keeps no dependency on Fishball-side code (R-SEC-01's separation).

**Decided 2026-11-11: B.** Any V3 package may depend on `fishball-shared` (the connector, embed-UI,
core, the instance and the bundles). Unchanged: it imports no other V3 package; it holds only
modules more than one package actually uses; importing it loads only the library, so the host DSH
still loads no Fishball-set module (R-BND-01). Now R-ARCH-08 rules 1–6, glossary, design §9.1;
task DOCS. Cases: PLAT-EP-07 rows 5–8.

## Browser authorization and the MCP-spec rule (2026-11-11)

Decisions recorded in requirements §1.16 (browser flow, no direct access, page on its own port) and
§1.17 (follow the MCP specification on the external surface: "尽量遵循MCP的规范，对外的沟通不要用MCP规范不推荐的形式").
Settled by the specification (no user question; cited in the requirements as [spec]):
- **Registration (Q-OA-4):** Client ID Metadata Documents only; dynamic registration is deprecated
  (Client Registration § Dynamic Client Registration). Machine clients are pre-registered.
- **Which endpoints move (Q-OA-6):** only the approval page and its form; metadata and the token
  endpoint stay on DSH's listener; one issuer (Authorization Server Discovery).
- **Issuer and resource (Q-S7-2, S1 Q2):** follow the checked host; the metadata `issuer` equals the
  issuer used to build its well-known URL (Authorization Server Discovery); canonical URI per
  Authorization § Canonical Server URI.
- **`fishball_pairing` (Q-S7-3):** removed; standard `scope` only (`fishball` / `fishball:pair`).
- **`iss` in authorization responses**, `authorization_response_iss_parameter_supported: true`
  (Authorization § Authorization Response Validation, SHOULD).
- **`scope="fishball"` in 401 challenges** and `scopes_supported` (Authorization § Scope Selection
  Strategy, SHOULD).
- **Structured results also as serialized JSON text** (Tools § Structured Content, SHOULD).
- **Redirect URIs** localhost or https, exact match; redirect host shown, localhost warning
  (Security Considerations § Communication Security, § Open Redirection, § CIMD Security).
- **`state`** optional for the server; echoed when present (Security Considerations § Open
  Redirection: a client SHOULD use it).
- Refresh tokens, if issued to public clients, MUST rotate (Security Considerations § Token Theft).

**Q-OA-5 decided 2026-11-11 (a new option).** The user, verbatim: "那就做成这个网页永久只能输入一个Token用于认证，
不管输入Token的人是谁。这样就解决了你问的“怎么确定是我点的”的问题了。其他Agent会打开一个网页，然后我在网页里把Token输进去认证。
至于公网暴露的问题，交给用户自己去搭Tunnel". The page only ever asks for a token the owner created by
hand; whoever enters a valid token authorizes; entering an unpaired token **pairs** that entry to
the browser client (one token, one agent; a paired token gets `already-paired`); the page never
creates an entry; the value travels only in the POST body. Public exposure is the user's own
tunnel; the connector only works correctly behind one (R-REM-05). Now §1.16 items 5–7, R-OA-11,
R-OA-12, R-OA-15, R-OA-16, R-OA-17, R-OA-20, R-REM-05 (new), §5; design §5.5a; tasks C-OAUTH-WEB,
S7b, DOCS. Cases: AUTH-UC-10, AUTH-DT-08 (new), AUTH-ST-04, AUTH-EP-10 (new).

**Q-OA-2 decided 2026-11-11: A.** Browser clients get a refresh token, rotated on every use and
revoked with its entry; a replayed old one revokes the whole chain. Machine exchange keeps no
refresh tokens (Q27 narrowed). Now R-OA-16, R-OA-02, R-OA-07, R-OA-12, R-OA-17; design §5.5,
§5.5a. Cases: AUTH-ST-05 (new), AUTH-UC-10 step 7, AUTH-EP-01 rows 3, 11, AUTH-ST-02 row 6,
AUTH-DT-01 rule 10, AUTH-DT-08 rule 7.

**Standing rule 2026-11-11 (requirements 1.18):** "但凡按照规范的你可以自己去做决策，你做完决策告诉你决定了什么就行".
Questions the specification settles are decided by it and reported; the rest go to the user.

**Decided per spec this round:**
- **Q-SPEC-2:** a pair-only token is refused with HTTP 403 `insufficient_scope`,
  `scope="fishball"` (Authorization § Runtime Insufficient Scope Errors). A token request asking
  `scope=fishball` while unpaired is narrowed, not refused (OAuth 2.1 §1.4.1).
- **Q-SPEC-3:** tool refusals set `isError: true`, with the code in `structuredContent` and in the
  JSON text block (Tools § Error Handling, § Structured Content).
- **Loopback redirect ports:** any port for a loopback redirect; exact match otherwise (OAuth 2.1
  §2.3.1, §8.4.2).
- **Refresh-token binding:** the refresh grant must come from the same `client_id` (OAuth 2.1 §4.3).

**Not decided per spec:** Q-SPEC-1 (the specification says HTTPS for every authorization-server
URL, OAuth 2.1 §1.5, with loopback redirects the only exception; following it would reverse Q9's
"routes on DSH's own listener", so it goes to the user). S2-Q1 to S2-Q3 concern Fishball's internal
interceptor and wake contract, which no MCP text covers.

**Q-OA-3 decided 2026-11-11** (before it was sent). The user, verbatim: "这个用户自己填一个编号，必须编号没有重复，且Token正确才能配对成功".
The page has a required id field; pairing needs a valid, enabled, unpaired token **and** a valid id
used by no other entry (`id-invalid`, `id-taken`). The OAuth `client_id` is recorded separately. Now
1.19, R-ID-08, R-ID-13 (new), R-OA-11/12. Cases: AUTH-UC-10, AUTH-DT-08 rules 5–5f.

**Optional name and the Hand over control decided 2026-11-11.** The user, verbatim:
"然后还可以选填一个名字，方便记忆，名字因为随时可以改，不填也行。UI中handover to fishball的按钮，如果有多个agent连接了这个DSH，就会变成一个下拉菜单：Handover to... ，下拉菜单中选择连接了的Agent名称，没有名称就显示ID，显示ID时前面会加上一个ID:",
corrected: "只连了一个也不是原来那个按钮，而是 Hand over to {agent_name}\{"ID: "+agent_id}". Now 1.20,
R-NAME-01/05/08, R-ROUTE-01/05, R-UI-05/08/10; design §3.6, §4.2, §5.5a. Cases: HAND-* rewritten,
HAND-EP-02 (new), AUTH-UC-10 A4. TQ-8 is replaced by Q-HO-1.

**Q-HO-1 decided 2026-11-11: C, plus status lights.** The user, verbatim: "C，再给Dropdown每一行一个图标，如果掉线了就显示红灯，在线就显示绿灯".
Every enabled, paired agent is listed; an offline target's `handover` waits in its mailbox; green
= online (an open `fishball-events` listen stream now), red = offline; refusals `no-fishball`
(disabled or deleted at call time) and `conflict` (already managed). Not asked, because they follow
directly: the single button carries the same light (the user's single-agent form is the same list
with one row), and lights refresh live through `onChange`. Added a text alternative so colour is
not the only signal. Now 1.20 item 3, R-ROUTE-05, R-UI-10; design §3.6. Cases: HAND-UC-01, HAND-UC-03,
HAND-EP-02, HAND-DT-01, HAND-ST-01, HAND-ST-02 (new).

**Q-NAME-1 decided 2026-11-11: B.** No default names for anyone: a nameless principal shows as
`ID: <id>`; a name refused at `pair` leaves it empty; `fishball-core`'s local `identity.name` still
defaults to "Fishball". Supersedes Q22 A and R-NAME-04's numbering (and TQ-7's default-series
question). Now §1.20, R-NAME-03/04/06/07, matrix row 12; design §5.8. Cases: NAME-UC-01,
NAME-BVA-02 (withdrawn), NAME-BVA-03, NAME-DT-01, NAME-DT-03, NAME-ST-01, NAME-EP-04 (new),
AUTH-UC-02 step 5, AUTH-UC-09, HOST-UC-01, HOST-UC-03, UIM-DT-01 row 12.

**Q-ID-1 decided 2026-11-11: A.** One id rule everywhere: `pair` also refuses an id another entry
holds, with `id-taken`; ids are unique per connector; R-ID-11's same-id-on-two-tokens case is
removed. Matches the user's 1.9 quote ("如果fishball发起握手申请，并传入了一个相同的ID，这次握手就要失败，提示用户要用一个新的token来握手").
Now §1.20, R-ID-03/04/07/11/13, the 1.9 note; design §5.8. Cases: AUTH-EP-03 row 8, AUTH-UC-04 A2–A3,
AUTH-UC-05 A2/A5, AUTH-DT-02 rule 10, AUTH-DT-06 rule 10, AUTH-ST-01 rows 15–16, AUTH-ST-03 rows 12–13,
AUTH-DT-08 rules 5c/5g, EVT-EP-04 row 3.

**Q-SPEC-1 decided 2026-11-11: A.** Plain HTTP on loopback stays, as the one documented departure from
the specification; everything non-loopback is HTTPS or the user's tunnel; S7b checks the stock
clients keep accepting it. Now R-OA-08, §1.17 note; design §5.5a; tasks S7b, DOCS. Cases: REM-UC-03 E5.

**Q-OA-7 decided 2026-11-11: A, amended.** A configurable port in the connector's native settings, a
fixed default frozen at V3-K, always open. On a clash: one diagnostic and `approval-port-in-use`;
MCP, machine exchange and DSH's UI keep working; the metadata **keeps** `authorization_endpoint`
(stock clients reject metadata without it, S1/S7), so only the page is unreachable; S7b verifies.
Now R-OA-20; design §5.5a; tasks C-OAUTH-WEB, C-WIRE, S7b. Cases: AUTH-DT-09 (new), REM-UC-03 E4.

Open for the user: S2-Q1, S2-Q2, S2-Q3.

## Spike S4 questions (from `b9809b7`, PASS; relayed later by Fishball)

- **S4-Q1:** should the child's hostname follow the main page's host (`localhost` vs `127.0.0.1`), given the `SameSite=Strict` 401? Cases: UIM-UC-01 E3.
- **S4-Q2:** surfaces dropped in the move: the brand mark, the `ask_fishball` Allow once / Reject row, card records.
- **S4-Q3 (decided B, see below):** the package name.

Settled by S4: UIM-UC-01..03, UIM-EP-01, UIM-DT-01 UI columns (rows 3, 6, 7, 8; still P:S6), HAND-UC-01 UI half, HAND-UC-03.

## Spike S2 questions (from `a499141`, PARTIAL; asked after the OAuth ones)

- **S2-Q1:** interceptor `ctl.accept()`: how an interceptor confirms durable acceptance. Cases: EVT-DT-03 rule 8.
- **S2-Q2:** no re-wake after an event was admitted by `Agent.followup` and the child crashed before the turn ran. Cases: EVT-DT-03 rule 9.
- **S2-Q3:** an event accepted for Fishball and dropped after the user's Stop. Cases: EVT-ST-02 row 12.

Settled by S2: delivery list held by core until the agent is fully idle, then `Agent.followup` in
`runMaintenance`; a busy Fishball gets the event as its next turn (R-EVT-03, design §6.4).

## Spike S3 questions (from `b4dca86`, PASS)

- **Q-S3-1 (decided as an implementation detail, see below):** during a Q24 succession, does the user's answer go through, and does the
  offer id carry a revision (`<request>.r<n>`)? Cases: HOST-UC-03 E1/E1a, PLAT-ST-01 row 7.
- **Q-S3-2 (decided B with S2-Q1, see below):** what may an interceptor still do after core falls
  back; `ctl.accept()` and `ctl.commit(send)` in the K3 freeze. Cases: WD-UC-04 step 5, EVT-ST-02.
- **Q-S3-3 decided by Fishball** under the user's standing rule "盯着DSH最新的0.2.2版本": 0.2.2-rc.1
  is the 0.2.2 baseline (npm's `latest`); probes are re-run when 0.2.2 final ships (R-COMPAT-01).

Settled by S3: AUTH-UC-02 E2, NAME-BVA-03 (still applies after Q-NAME-1 = B), EVT-UC-02 (S3 part),
WD-UC-01, WD-ST-01, HOST-ST-02, PLAT-UC-02; with one change each: WD-UC-04 (committed or fenced,
never both), HOST-UC-03 (the user's answer is never `expired` by succession), PLAT-ST-01 row 7
(same request, revision + 1).

## Pending questions (status at commit)

| Question | Source | Waiting for |
| --- | --- | --- |
| TQ-6, TQ-7, TQ-9 … TQ-17 | test-planning gaps (see the table at the top) | the user, when relevant |

**S2-Q1 + Q-S3-2 decided 2026-11-11: B.** Core owns acceptance: the handler must `await ctl.accept()`
before acting, core keeps the record open until the handler settles; after a restart an open
record goes back to the same plugin (dedupe by `eventId`), or to Fishball once if that plugin is
off. An explicit `ctl.commit(send)` fence, frozen in K3: on a throw or failure, accepted-undecided
items go to Fishball; an answer already being sent stays with the interceptor. With the user's
rule, verbatim: "如果插件接手了一件事，且没有传导给Agent，那就没有记录，记录只留在后台的log里，不会进上下文"
(interceptor-only events leave no record in any agent's context; background log only; core's
acceptance record never surfaces). Now §1.21, R-INT-01/04/08/09 (new), R-WD-07; design §6.4,
§7.1, §7.3; tasks K3, F-INTERCEPT, WD-ROUTE. Cases: EVT-UC-02, EVT-UC-03, EVT-DT-03 rule 8,
EVT-ST-02 rows 4–9, EVT-DT-04 (new), EVT-EP-05 (new), WD-UC-04.

**S2-Q2 decided 2026-11-11: A.** No re-wake after a mid-turn crash: the interrupted turn counts as the one
wake, and DSH's own crash notice is what the user sees. Now R-EVT-03, design §6.4. Cases: EVT-DT-03
rule 9, EVT-UC-02 E2a, EVT-ST-02 row 11a.

**S2-Q3 decided 2026-11-11: A.** A user's Stop of a Fishball turn, or removal of a queued Fishball event,
before admission discards the event: acked, never retried; approvals or questions inside it stay
live at the connector (R-CON-05). Now R-EVT-03, design §6.4. Cases: EVT-ST-02 row 12, EVT-UC-02 E4.

**S4-Q1 decided 2026-11-11: A.** The frame URL uses the main page's loopback hostname (`127.0.0.1`,
`localhost` or `[::1]`) with the child's own port; the ticket follows that hostname; the child is
reachable under all three; otherwise the route refuses with "Open DSH at 127.0.0.1 to use
Fishball"; the page through a tunnel is out of scope. Now R-UI-02, R-HOST-06, §5; design §4.1; tasks
I-HOST, U-SHELL. Cases: UIM-UC-01 E3–E5, UIM-EP-02 (new).

**S4-Q2 decided 2026-11-11 (a mix).** The user, verbatim: "侧边栏的Fishball按钮入口 或者 override 右上角标志；待批按钮去掉，如果Fishball无法决断才在Fishball里面显示。交给Fishball了可以接受一些行为的改变；决策/卡片记录留在对话内inline显示，就和一个工具使用记录一样。"
- Entry: **the sidebar Fishball entry** (chosen over a brand override: S4 proved the sidebar slots on
  both SDKs; the brand slots were not exercised; a brand override changes the host UI for every
  user). R-UI-11.
- The `ask_fishball` Allow once / Reject row is dropped (R-UI-12); an ask Fishball cannot decide is
  a card in Fishball's own page (R-FB-11). Task F-ASKCARD (new).
- Decision / card records inline like a tool-use record: **which conversation is open (Q-S4-2b).**
Cases: UIM-UC-04 (new), PLAT-UC-07 (new).

**Q-S4-2b (open). Where are decision and card records shown inline?** V2 drew them in the managed
session (`conversation.chat.node` from the connector client). Options: A. in Fishball's own
conversation only (core's `fishball-ui`); B. a read-only record row in the managed session (embed-UI,
through a new read-only member of the hand-over service); C. both.

**Q-S4-2b decided 2026-11-11: B, without a read interface.** The user, verbatim: "B，不需要开一个只读的读取接口，只要这个session向Fishball发出请求和收到请求的时候自己在会话内绘制一个就行了。我不知道为什么要加读取接口。这完全是在DSH内发生的事，完全可以在DSH内自己判断，自己绘制。"
Records are drawn inline in the **managed session** by embed-UI when the session sends a request
to Fishball and when it receives the answer, from the session's own DSH events only (a read-only
`tool.call.toolview` for `ask_fishball`, a `conversation.chat.node` for permission requests); no
new hand-over-service member, no connector read API. Now §1.22, R-UI-12, R-UI-13 (new); design
§4.2; task U-RECORDS (new). Cases: UIM-UC-04, UIM-UC-05 (new), UIM-DT-02 (new). If an SDK does not
expose a received decision in the session's events, U-RECORDS raises one question.

**S4-Q3 decided 2026-11-11: B.** The package is **`fishball-embed-ui`**, all lowercase, matching
`fishball-connector` and `fishball-instance` (npm and DSH's plugin manager refuse capitals). The
user's verbatim quotes keep their original spelling. Now the glossary, R-ARCH-01/04, design §1,
§1.1, §4.2, §9.1; task R-EMBED; cases EXT-EP-02, PLAT-EP-07.

**Q-S3-1 decided as an implementation detail (not asked).** Already settled by the user's Q24 A
(the successor takes over; live offers are re-issued with new ids, so an agent's answer to an old
id fails `expired`) and OQ-14 A (the first committed outcome wins). The user answers a request's
card, never an offer id, so the only behavioural rule is that a succession never refuses the
user, which follows from Q24 A. How it is stored (one settlement record per request, offer ids
`<request>.r<n>` with succession issuing `r<n+1>`) is S3's implementation and is frozen by K1.
Now R-HOST-09; cases HOST-UC-03 E1/E1a, PLAT-ST-01 row 7.

All spike questions (S2, S3, S4) are now decided. Open test-planning questions: TQ-6, TQ-7 and
TQ-9 to TQ-17 (table at the top).
