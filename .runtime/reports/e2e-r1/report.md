# E2E-R1 — stopped at DSH authentication

**0 pass · 0 fail · 9 not run.** Counts use the nine ordered use cases in the round-1 brief, not the 73 cases across the full release plan. No product defect was observed; none of B1–B8 was verified fixed. This run provides no release sign-off.

On 2026-11-19 (NZDT), BrowserSkill opened a new incognito Agent Window at `http://127.0.0.1:7713`. At a 1440 × 723 viewport, before the app shell appeared, the only visible text was **“dsh web authentication required; reopen the URL printed by dsh web.”** No controls were present. The test stopped there and Fishball was notified. No login URL or token was sought. The test installation was not changed. Reported environment (not independently verified in the UI): DSH 0.2.2-rc.1, Fishball 1.0.0-alpha.1, build `e1324391`.

## Results in execution order

| Case | Result | Reason | Screenshot |
|---|---|---|---|
| 1. Open Fishball; sidebar fish and plugin badges | Not run | DSH displayed its authentication message instead of the app shell. | `screenshot-hlox.png` (session attachment only) |
| 2. Pair local DSH; target status and inline details | Not run | Neither the connector nor the Fishball target list was reached. | — |
| 3. Start, message, observe reply, redirect and stop | Not run | No session was started. | — |
| 4. Allow once, reject, grant; bare DSH name on approval page | Not run | No managed session or approval page was reached. | — |
| 5. Native ask card, DSH source name and answer | Not run | No managed question was issued. | — |
| 6. Reminder creation, firing and Stop-drop | Not run | Fishball chat was inaccessible. | — |
| 7. Take back and hand over | Not run | No session ownership transition could be exercised. | — |
| 8. Live rename, duplicate suffix, confirmed target deletion | Not run | No target settings were reached; availability of a second URL for the same DSH is unknown. | — |
| 9. English/Chinese, light/dark, desktop sidebar/mobile bottom bar | Not run | Only the host authentication message was visible; it is not evidence of Fishball layout at either width. | — |

**Evidence:** BrowserSkill captured the authentication screen and returned it as an image attachment. Its requested output path produced no file in the report directory, so the screenshot is not part of this commit. No other screen was reached.

## Coverage and exclusions

The entry use case was attempted first. Authentication prevented the planned equivalence partitions (languages/themes), boundary checks (one vs. two same-name targets), decision table (allow once/reject/grant), and state transitions (sessions, ownership and reminders). No assertion from a prior run or install report was counted as a pass.

| Previous finding | Retest disposition |
|---|---|
| B1 — hosted target not paired | Not run: local target and session tools not reached. |
| B2 — offline install with another store | Not run: requires an install. |
| B3 — root README wording | Not run: root README release audit is outside the installed-UI path. |
| B4 — stale package descriptions and READMEs | Not run: plugin detail pages not reached. |
| B5 — settings model list unreadable | Not run: core settings not reached. |
| B6 — missing offline installation guidance | Not run: release install-document walkthrough outside this browser run. |
| B7 — preview notice on first child open | Not run: child never opened. |
| B8 — uninstall process-check diagnostic | Not run: requires an uninstall. |

Public-HTTPS CIMD/adapter flows, a second real DSH, install/uninstall, and host/child restart or reinstall: **not run** under the round rules. These exclusions and regression cross-references do not add to the nine-case denominator.

**Next run:** have an operator privately authenticate an isolated test window on :7713, then resume at case 1. Do not put a login URL or credential in the report or chat.
