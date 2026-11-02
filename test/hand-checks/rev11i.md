# rev11i hand check (test session)

Build: `10337db` (rev11i + rev11h code + integration bug fixes `cd19640`) merged with the rev11h tests `f3dd08b`; my branch `claude/test-rev11i-146390`. Real DSH worker (this checkout's plugin, fake model), kept up by `test/hand-checks/rev11i-serve.mjs`, driven in the built-in browser pane. Server stopped. Browser: 1280x800 (viewport reset), light and dark emulated, English and 简体中文. Screenshots are the browser tool's own files in `/Users/samuel/.claude/projects/-Volumes-SSD1-GitHub-dsh-fishball--claude-worktrees-test-rev11i-146390/86a174de-b1d4-41f6-81d8-768365c19b32/tool-results/` (names below).

## Suite
Full run: 1977 tests, 1976 pass, 1 skipped (an older, known skip), 0 fail, 262 suites. Includes rev11i's 13 cases (MKS-01..10, test/managed-marks.test.mjs), rev11h's tests and the read_session / half-made start_session tests. No test needed a fix, so no second run.

## Done-when items (plan rows BRW-01..17)
Screenshot names omit the common prefix `mcp-Claude_Browser-blob-`; the file ends in .jpg.

| id | verdict | what I did and saw |
|---|---|---|
| BRW-01 Hand over | PASS | A handed over from the header: the banner appeared in the open chat after about a second, no reload (strip above the composer with the fish, "Managed by Fishball", "Take back from Fishball"); row mark appeared too. `1793580038176-1n6gmr` |
| BRW-01 Send to Fishball | PASS | B: Send dialog, Send; banner and row mark appeared. `1793580064677-m7185g` |
| BRW-01 message_session | PASS | C open in the browser, Fishball messaged it: banner appeared live. `1793580093099-d8lwi1` |
| BRW-01 start_session | PASS | D (workspace pre-registered): banner and row mark, titled "D started by Fishball". `1793580111336-8p2ic4` |
| BRW-01 answer_prompt | NOT RUN | needs a frozen prompt of a session that is yours; the state-driven banner is the same for any managed entry, and rev11e-answer asserts the entry (`prompt-answer`) |
| BRW-02 yours / Fishball's chat | PASS | M (yours): no banner, no row mark. Fishball's own chat: no banner and no Hand over / Take back in the header. `1793580333154-gen2j6` |
| BRW-03 Take back (banner) | PASS | D: click, banner and row mark gone, header switched to Hand over, one management note, entry left the snapshot. `1793580179522-kw98du` |
| BRW-04 release_session | PASS | C open, Fishball released it: banner and mark gone live; header shows Hand over |
| BRW-05 refusal dialog | NOT RUN | I could not get the banner to send a refused request: the page's state followed the Host within the same tick for Session messages off and for a second Take back. The refusal codes themselves are covered by MKS-05 and the dialog is the existing one from the menu |
| BRW-06 Sidebar icon | PASS | POST /api/fishball/brand deepseek: banner and row switch from fish to orca with no reload (DOM: data-fishball-mark / data-fishball-orca); back to fishball likewise. `1793580129597-6k869e` (orca) |
| BRW-07 Session messages off | PASS | Banner and row marks vanish (header shows neither Hand over nor Take back); sessions stay managed (state); on again brings 3 row marks and the banner back. `1793580139769-flah7j` |
| BRW-08 Fishball not live | PASS | Archived Fishball's session: status archived, banner and marks hidden; unarchive and retry: live, banner and marks back. `1793580159811-ivkgfg` |
| BRW-09 idle row mark | PASS | managed A, B idle: mark in the status-light place; M shows none |
| BRW-10 status transitions | PASS | held turn (running): DSH spinner, no mark. Turn done unread (just finished): green dot, no mark. Opened (idle): mark back. A question waiting: orange dot, no mark. `1793580259392-km654n`, `1793580274312-1ofi4m`, `1793580281149-sy00qy`, `1793580298076-wisd7l` |
| BRW-11 no mark on yours / Fishball's | PASS | M's rows and Fishball's row carry no mark (DOM: only managed ids have data-fishball-managed-row) |
| BRW-12 light and dark | PASS | Both readable; orca and fish both show. `1793580359630-2mzeal` (light, orca), `1793580365497-rp6jzq` (light, fish), `1793580456831-xsjogc` (dark, Chinese) |
| BRW-13 Chinese | PASS | "由 Fishball 管理" and "从 Fishball 收回"; row aria-label "由 Fishball 管理". `1793580379633-mbgvhj` |
| BRW-14 dock order | PASS | With a queued message in A: Queue dock (top 583) above the banner (620), banner above the composer (680). Todo dock not tried (no todo tool in the bare preset). `1793580315597-b10u9j` |
| BRW-15 pile never with banner | PASS | A user-mode question made a pile card ("Waiting for you (1)"): the pile shows in Fishball's chat only, no banner there; A shows the question panel, no pile. `1793580345081-df5e4i`, `1793580352460-wij8yq` |
| BRW-16 three places agree | PASS | Banner Take back (D), header Take back then header Hand over (A), settings-list Take back (A): every place updated, the list dropped the row. |
| BRW-17 restart | PASS | Restarted the Host, reloaded: B's banner and row mark present again. `1793580454651-1kq7wu` |

## Observations (none changes the verdict)
- The banner spans the whole chat panel (left 280 to 1273 px at 1280) while the composer and the Queue dock are narrower (421 to 1129 and 429 to 1125); the banner's top edge is 3 px above the Queue dock's bottom edge (620 vs 623), so it slightly overlaps the dock. Cosmetic.
- While a question panel is open in the session, DSH covers the composer area and the banner has a zero-size box (not visible); it returns after the answer.
- Row marks only exist for expanded workspaces (DSH renders rows only then).
