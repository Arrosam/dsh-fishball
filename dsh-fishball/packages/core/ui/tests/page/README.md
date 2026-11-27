# fishball-ui.page: fishball-page's LITE guards in a real browser

The LITE black-box rows (docs/test-design/v2-origin-lite-set-cases.md §2; docs/planning/v2-final-scope.md §4
LITE, §4.3; the public contract docs/planning/v2-lite.md), as MULTI-3 narrowed them (docs/planning/v3-multi-dsh.md
§6.1, §6.4). fishball-page (fishball-ui's `fishball-page/client.js`) runs unread in a real headless Chromium at a
loopback "child" origin over the current DSH's real dsh-client-shortcuts `ShortcutsService` and real
localStorage; a second loopback "main" origin holds main-DSH storage sentinels
(`../support/lite-env.mjs`, `../support/lite-harness.js`). Every other service is a recording fake with DSH's
public shape. Rows skip (never fail) where no Chromium can start. Entry file: `../page.test.mjs`.

| Rows | Technique | What is observed |
| --- | --- | --- |
| LITE-UC-01, LITE-EP-01…07, LITE-BVA-01/02, LITE-DT-01…09, LITE-ST-01…03 | UC, EP, BVA, DT, ST | the shortcut reconciliation gate: the session/workspace commands remapped through `ctx.shortcuts.edit` only (current revision, serialized, idempotent, honest on every failure), the protected marker, no timer, no direct storage write, main storage byte-identical; `sidebar.left.toggle` left native (MULTI-3) |
| LITE-UC-02, LITE-ST-04, B3-* | UC, ST, DT | native Settings stays reachable; the one explicit return to the manager; never corrective navigation; the page's status and Retry (its `sidebar.footer.action` entry) honest about a rejected open |
| LITE-EP-08…12, LITE-EP-14 | EP | the launchers that leave the session (label-matched New session, Branch, Choose workspace, the session-hierarchy nav, the hero picker) unreachable by pointer, Tab and keys; the workspace browser occupied; harmless contributions kept; the frame guard on transcript links |

MULTI-3 re-baselines (the old rows asserted the pre-MULTI-3 page): `sidebar.left.toggle` is no longer
remapped (LITE-EP-06 asserts it stays native; every other row's `RELEVANT` list drops it); the page draws no
Plugins button or navigation of its own (LITE-UC-02, LITE-ST-04; the B3 rows read the status in the page's
footer entry); the native sidebar, its toggle, mask and rail are restored and `sidebar.workspaces` is shadowed
instead (LITE-EP-02, LITE-EP-08).

Retired: LITE-UC-03, LITE-EP-13 and LITE-EP-12's main-composition half composed dsh-instance's launch overlay
(gone with dsh-instance, 6b7c53bf); their residual todos and the old PAGE / PG-ORIGIN / READY todo catalogues
named no planned task in this repository.
