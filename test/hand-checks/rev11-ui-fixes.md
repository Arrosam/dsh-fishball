# rev11-ui-fixes hand checks (test session)

Branch `claude/test-rev11-ui-fixes-78fdb7` = tests (`ddce5db`) + builder's `8de348b` on `4107b72`. Not pushed.

## Result: PASS

## Suite
First full run (`/opt/homebrew/bin/node test/run.mjs`): **tests 1982, suites 263, pass 1980, fail 1, skipped 1** (the known OFM-06 skip). The one failure, `APR-21`, asserted the exact key list of a recent-audit snapshot entry; R4 requires the giver to be stored and shown, so the entry gains `passBy`. Test updated (`RECENT_KEYS` in support/constants.mjs gains `passBy`), no assertion weakened. After that, `approvals-broker` + `rev11-ui-fixes`: 46 of 46 pass (UIF-01..05 all pass).

## By hand
Real DSH worker (this checkout, fake model, `test/hand-checks/rev11d-serve.mjs`), built-in browser pane, light/dark via colour-scheme emulation, language via Settings > General > Language.

- **R1 PASS.** Three escalated cards plus grants in Fishball's chat. Dark: `.fb-pile-head` "Waiting for you (3)" background rgb(35,35,36) = `.fb-pile` rgb(35,35,36), opaque, `position: sticky`; scrolled the pile 60px: header stays pinned and no card text shows through (screenshot). Light: both heads and the pile rgb(255,255,255). "Standing grants (1)" head also rgb(255,255,255). Zh heads "等你处理（3）", "长期许可（1）".
- **R2 PASS.** English: a grant read "used 0 times", after one covered call "used once", after two "used 2 times". Chinese: "已使用 0 次", "已使用 1 次", "已使用 2 次".
- **R3 PASS.** Fishball rejects with a reason: the session's row shows "Reason: agent why rej" then "Fishball: Fishball says no because of hcrej". Chinese: "理由: agent why rej", "Fishball: …" (same label as the pile card, "Fishball:"). Your Reject note on a card keeps "Reason:" / "理由:" (reading by the builder: your note is not Fishball's text).
- **R4 PASS.** Settings > Fishball audit: Allow once on a pile card reads "Ran on your one-time approval" (zh "按你的一次性批准运行"); Fishball's allow reads "Ran on Fishball's one-time approval" (zh "按 Fishball 的一次性批准运行"). After restarting the worker the snapshot still has `passBy` `user` / `fishball` for the two. Not driven by hand: Allow once on the session's row (same route as the card; suite-covered by the shared route) and an entry written before the fix (UIF-04 covers the stored form; no `passBy` reads as Fishball's).
- **R5 PASS.** Button aria-label "Open Fishball, 8 unread" in English at first load; after switching to 中文 live: "打开 Fishball"; after a fresh page load in Chinese (and again 3 s later, past DSH's own re-render): "打开 Fishball", never 新建会话; same after a worker restart.

Servers stopped (hand-check worker killed; the browser pane only held pages).
