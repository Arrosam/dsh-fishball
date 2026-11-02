# Hand checks: revision 12 (recommended plugins and the welcome card)

Build: `c63fa9d` merged into `claude/test-rec-plugins-98721c` (merge `9eb9192`). Sandbox DSH with the fake model, in the browser pane (800x600 viewport). Builder's server `rec-plugins-serve.mjs` for items 1-9, the rev11-pile-list server for the pile (item 10). Only local stand-ins were installed; for the real spec `smart-compaction` I stopped at the confirm screen (the dialog's check read npm metadata only).

| # | Check | Result |
|---|---|---|
| 1 | Settings section "Recommended plugins" after Status: four categories in order, "Recommended first" badge and sentence on Context management and Memory, Pet note with no rows, one-line descriptions with ellipsis, Source link and the action at the right | PASS (dark and light) |
| 2 | Entry states: Install; "In DSH, off in Fishball" + Turn on for Fishball (dsh-telegram-notify); "Installed" tag (smart-compaction after a stand-in install); "On in Fishball" after the switch | PASS |
| 3 | Turn on for Fishball, real click: row becomes "On in Fishball"; state says `dsh-on` | PASS |
| 4 | A refused Turn on (simulated: the browser's POST to `/api/fishball/plugins` answered 409 `unavailable` by a fetch stub): the row stays, with "That change was not accepted." under the description; the next real click worked | PASS (refusal simulated; the Host's real refusals are not reachable on this server) |
| 5 | Blocked entry's tag (meow-memory stand-in whose patch edits another row, installed through the dialog's route): installed, red tag "Changes other plugins, so it cannot run for Fishball only", no action | PASS (dark, light, Chinese) |
| 6 | Install on a real spec (smart-compaction): dialog opens over the settings page with the spec, check ran, confirm screen shows name, version 0.3.15, description, source; **stopped there**; Back returns to the field with the spec | PASS |
| 7 | Install of the local stand-in typed into the field: confirm screen, Install for Fishball, result "installed for Fishball and turned on", no "Open its page"; the row reads Installed | PASS |
| 8 | Welcome card: shows in Fishball's chat above the composer, with the four categories, badges, sentence, "See recommended plugins" and ×; `welcome.show` false at once; after leaving the chat for New Session the card is gone, back in Fishball in the same page load it is there again; after a reload it never returns | PASS. Link opens the settings page with the section at the top, PASS |
| 9 | Chinese wording (DSH language set to 中文 in the throwaway home): card (欢迎使用 Fishball, 优先推荐, 查看推荐插件), the whole section, the tags 已安装 / Fishball 中已开启 / the blocked tag, buttons 安装 / 来源 | PASS, no English left, no overflow |
| 10 | Card above a non-empty pile (3 cards, "Waiting for you (3)") with the messenger look: round avatars, bubbles with the time under them, a six-column table inside the reply bubble. Card, pile and composer do not overlap (bounding boxes checked: card bottom 395 < pile top 401); the pile's one-line rows keep their two lines | PASS in light. Dark checked for pile and messenger look without the card (the card had been seen once already); card in dark checked in a separate home with no pile |

## Not checked here
- **The card never in another session's chat:** the sandbox cannot start an ordinary session (it needs a workspace folder). Only the New Session page was checked (no card). The Host half (the card belongs to Fishball's own chat) is not testable black-box. **Not checked.**
- **The card back after a question panel replaces the composer bar:** the fake model cannot be scripted into a question here. By the builder's design the shown/closed state lives for the page load, and leaving the chat and coming back did show the card again (item 8). **Not checked with a real panel.**
- **The card while Fishball is not live:** the sandbox cannot hold Fishball down. The Host half is tested (WEL-09: `seen` before live is stored). **Not checked in the browser.**
- Fishball's restart in the browser (the Host restart is WEL-07/08 in the suite).
- Card and pile together in dark.

## Findings
- `POST /api/fishball/welcome/seen` accepts `{"a":1}` (200). DESIGN §10f says every body but `{}` answers 400 `bad-body`; the builder's note says "non-object body". Test WEL-02 (object with a key) fails on this. Low severity, no user-visible effect.
- The builder's branch has three newer commits than `c63fa9d` (`c10b6e8` drops `@zaofan/dsh-qqbot`, `6c31115` and `50eb9a0` docs); this run is on `c63fa9d` as instructed, and the list still shows qqbot.
