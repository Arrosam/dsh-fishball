# Hand check: phase rev11-limits

Tester: Sonnet 5.5 session, 2026-11-01. Branch `claude/test-rev11-limits-effe82` at `f7573bb` (contains `fd19bbf`). Nothing in `src/`, `index.js`, `client.js`, tests or `DESIGN.md` was edited.

## Suite

`/opt/homebrew/bin/node test/run.mjs`: **1336 tests, 1335 pass, 0 fail, 0 cancelled, 1 skipped** (about 477 s).

## Method

A scratch script (outside the repo) booted a real DSH 0.2.1-rc.2 `web` profile on port 3151 with this checkout linked as `dsh-fishball`, using `spikes/harness.mjs` and the fake model. It seeded three ordinary sessions (one with 8 turns), three watches and three outbox messages, all through Fishball's own tools. Every setting was then changed in the built-in browser pane, on Fishball's settings page, and the effects were read back with no restart. The real model was never called. The main checkout, `~/.dsh` and the user's profiles were not touched.

## Results

| Item | Result | What I did and saw |
|---|---|---|
| Base check | PASS | `git merge-base --is-ancestor fd19bbf HEAD` succeeded. |
| Settings page: 16 new fields, defaults | PASS | "Safety limits" lists the 16 new fields in §16 order after "Entries kept in each audit list". Defaults read from the inputs: 2048, 500, 20, 20, 20, 50, 12, 12288, 3072, 10, 200, 8, 8, 4096, 30000, 32000. All match §16. |
| DSH's own Plugins page form | PASS | "Fishball settings" opens the same page as Plugins → Installed → dsh-fishball. It shows the same fields and defaults. |
| `intakeRowsShown`, `outboxShown`, `watchesShown` = 1 | PASS | Each list went from 3 entries to 1 right after Save. No restart. |
| `approvalsShown` = 1 | NOT RUN | No approval entries could be seeded without a second approver plugin. The field is present with its default. Only the suite covers the live effect (L58). |
| `readSessionMessages` = 3 | PASS | The fake model had Fishball call `read_session` on the 8-turn session. It returned exactly 3 messages. |
| `pluginHistoryShown` = 1 | PASS, with a note | I toggled Time awareness 3 times. The detail route `/api/fishball/plugins/detail` returned 3 history entries at the default, then 1 after the change, with no restart. The plugin page itself only ever shows the newest change (`client.js:2360` reads `history[0]`). So "the page shows one change" cannot tell the limit apart from the default. |
| `minWindowTokens` = 8192 refuses a 6000 window | PASS, with a caveat | With 8192, a 6000 window was refused ("That window is too small…"). But the same 6000 was refused at the default 4096, and so was 8000. Fishball's prompt alone is about 7,158 tokens, so the prompt-size check hides the minimum at that size. I used a larger window. At the default, 20,000 was accepted and gave a 2,500 reply cap. After setting `minWindowTokens` to 32000, 21000 was refused. After setting it back to 4096, 21000 was in use. So the field changes the outcome live. |
| `defaultReplyCapTokens` = 16000 | PASS | With the model window at 200,000 and Fishball's window at 180,000, the reply cap was 22,500, then 16,000 right after the change. With the 128,000-token model and `replyCapShare` 2, a 60,000 window gave 30,000, then 16,000. I did not use a window of exactly 200,000: it is not smaller than the model's, so no automatic cap applies. |
| `replyCapShare` live | PASS | A 21,000 window gave a reply cap of 2,500 at share 8 and 5,250 at share 4. |
| Invalid values | PASS | In "Permission requests shown on this page": 0 and 1.5 each showed "The values were not accepted. Use whole numbers: at least 1…". Text ("abc") showed no message. All three left the stored value at 20, read from the settings state; the page kept the typed text in the box. |
| No tool changes a limit | PASS | Fishball's tool list is add_plugin, answer_approval, get_plugin_settings, list_plugins, list_watches, message_session, read_session, remove_plugin, schedule_*, set_plugin_enabled, set_plugin_settings, start_session, unwatch_session, watch_session, web_fetch, web_search, working_directory. `set_plugin_settings` on `dsh-fishball` answers `unknown-plugin`, so it cannot reach Fishball's own limits. |
| Constants and docs | PASS | `src/constants.js` still holds `dedupeKeyBytes` 256, `descriptionBytes` 1024, `sourceTitleBytes` 200, `AUTHOR.nameBytes` and `maxSubagentDepth` 8. `docs/plugin-author-guide.md` (line 40) lists all three sizes. Grep finds no `managerStartMs`, `userMessageBytes`, `CONTEXT.outputShare`, `OUTBOX_SHOWN` or `historyEntries` in `src`, `index.js` or `client.js`. |
| Package bounds follow DSH | NOT RUN (code read only) | `packageBounds()` in `src/fishball-plugin-manager.js` reads DSH's live manager on every operation, and `fishball-packages.js:333-337` passes the four bounds to the runner (`inspectTimeoutMs` becomes `lookupTimeoutMs`). A real check needs a pnpm run and registry lookups, which means network access and a slow run. The suite covers it. |

## Edge case: `replyCapShare` = 1

**Confirmed.** With `replyCapShare` 1 and the window set to 21,000 and no reply length cap, the page said "The reply cap does not fit in the window." The window in use fell back to the full 128,000, "Summarises at" showed "unknown" and "Reply cap" showed "none". The automatic cap is window ÷ 1, which leaves no room for the prompt. Nothing was set by the user, so the message is misleading. Share 2 with a 60,000 window worked (cap 30,000).

## Other observations (not failures)

- A refused window is still stored. In the `minWindowTokens` 32000 case the refused 21,000 replaced the earlier 20,000. While it is refused, the window in use falls back to the model's full window (128,000 here), and "Summarises at" shows "unknown". When `minWindowTokens` went back to 4096, 21,000 applied. The brief says "the old value stays", which holds for the limit fields but not for the window field.
- Leftover `p11` and `p12` smoke servers are running from the main checkout (started Oct 31 and Nov 1). They are not mine and I did not stop them.

## Gaps

- `approvalsShown` has no hand check. I could not seed approval entries.
- The package-bounds item is not run against a real install.
- A literal 200,000-token window is not possible as a "smaller window". I used 180,000 on a 200,000 model.
- The in-app browser pane's tab was left open on the stopped server's page. All servers I started are stopped.
