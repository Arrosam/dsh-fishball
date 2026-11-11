# Test-planning questions (TQ)

Found while writing the cases from requirements and design at `e1e5577`. Each is a gap or
contradiction where the requirements do not fix an observable result. Cases that depend on one
carry its `TQ-n` flag and show the **recommended** answer as the expected result. Numbers are
stable. Ordered by how many cases depend on them and how much they block implementation.

The prefix `TQ` avoids clashing with the requirements' own `OQ-14` (first committed outcome wins).

| # | Topic | Blocks | Cases |
| --- | --- | --- | --- |
| TQ-1 | Direct-access split vs ids containing a dot | T-OA | AUTH-UC-07, AUTH-BVA-04, AUTH-DT-03 |
| TQ-2 | Revocation: fate of item kinds §5.3 does not name; designated role | T-REVOKE | AUTH-UC-06, AUTH-DT-04 |
| TQ-8 | Hand over edge cases: designated not connected / disabled; already managed | T-HAND | HAND-UC-01, HAND-DT-01, HAND-ST-01 |
| TQ-10 | Watchdog decision for "beyond scope, not dangerous, not high-risk" | T-WD-DEC | WD-DT-01 |
| TQ-11 | Watchdog supervision when Fishball stops managing the session | T-WD-SUP | WD-ST-02 |
| TQ-9 | First patrol after a new claim or resume | T-WD-PATROL | WD-UC-03, WD-BVA-02, WD-ST-02 |
| TQ-3 | Token request without `resource` | T-OA | AUTH-EP-01 |
| TQ-4 | Token creation edge cases: minimum length value, store not writable, shared `ref` | T-TOK | AUTH-UC-01, AUTH-EP-04, AUTH-BVA-03 |
| TQ-5 | Access tokens across a connector restart; in-flight request at revocation | T-OA | AUTH-UC-03, AUTH-UC-06 |
| TQ-6 | Newline in names; page text for `name-invalid` | T-NAME, T-CORE-PAIR | NAME-UC-02, NAME-EP-01, NAME-DT-03 |
| TQ-7 | Does a disabled entry still hold its name? | T-NAME | NAME-BVA-02 |
| TQ-12 | `notifyWhenFinished` passed by an old client: refuse or ignore | T-TOOLS | WATCH-UC-01 |
| TQ-13 | Two plugin names normalising to one namespace | T-EXT-REG | EXT-EP-02 |
| TQ-14 | Contributor `emit` with an unknown `sessionId` | T-EXT-EMIT | EXT-DT-02 |
| TQ-15 | Designated-Fishball default when the user already chose one | T-HOST-TOKEN | HOST-UC-01 |
| TQ-16 | "No principal connected" for a managed session's permission request | T-ROUTE | PLAT-UC-03 |
| TQ-17 | Standalone status when an optional feature is simply not installed | T-CORE-STATUS | PLAT-DT-02 |

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
case is narrow (no default id has a dot). Cases assert B.

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

**TQ-4. Token creation edge cases.** The minimum length for a user-set value is not stated
(R-TOK-08); nor is the status when the credential store cannot be written, or the behaviour of two
entries sharing one `ref`. Recommendation: freeze the minimum at V3-K as 32 characters; an
unwritable store gives the entry status `token-unconfigured`; a duplicate `ref` is refused at
settings validation (`ref-duplicate`).

**TQ-5. Access tokens across a connector restart, and requests in flight at revocation.**
Recommendation: access tokens do not survive a connector restart (clients get 401 and
re-authenticate, R-OA-07); a request already past the token check completes, and the next one is
refused ("next request", R-TOK-05).

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
