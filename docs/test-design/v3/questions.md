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
| TQ-8 | Hand over edge cases: designated not connected / disabled; already managed | open | C-ROUTE, U-MARKS | HAND-UC-01, HAND-DT-01, HAND-ST-01 |
| TQ-10 | Watchdog decision for "beyond scope, not dangerous, not high-risk" | open | WD-DECIDE | WD-DT-01 |
| TQ-11 | Watchdog supervision when Fishball stops managing the session | open | WD-PATROL | WD-ST-02 |
| TQ-9 | First patrol after a new claim or resume | open | WD-PATROL | WD-UC-03, WD-BVA-02, WD-ST-02 |
| TQ-3 | Token request without `resource` | **decided A**, confirmed by S7 (2026-11-11) | C-OAUTH | AUTH-EP-01 |
| TQ-4 | Token creation edge cases: minimum length value, store not writable, shared `ref` | **decided A** (2026-11-11) | C-TOKENS | AUTH-UC-01, AUTH-EP-04, AUTH-BVA-03 |
| TQ-5 | Access tokens across a connector restart; in-flight request at revocation | **decided A** (2026-11-11) | C-OAUTH | AUTH-UC-03, AUTH-UC-06 |
| TQ-6 | Newline in names; page text for `name-invalid` | open | C-PAIR, F-PAIR | NAME-UC-02, NAME-EP-01, NAME-DT-03 |
| TQ-7 | Does a disabled entry still hold its name? | open | C-PAIR | NAME-BVA-02 |
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
