# fishball-heartbeat

Keeps Fishball's prompt cache warm while it is idle, and gives each warming turn useful work. Version
`1.0.0-alpha.1`, DSH `>=0.2.1-rc.5`; it has no browser code.

## What it does

- **Off until you set both timer settings** (Fishball cannot change any of its settings). Installed through the [`fishball-amenities`](<../fishball-amenities/README.md>) umbrella, set them on the heartbeat's component page there; a saved change applies at once. Installed alone it has no settings page: set them in its row's `config` in the profile's `cordis.patch.yml`.
  - `intervalSeconds`: seconds with no Fishball turn before a heartbeat turn is sent. Set it below your model's cache lifetime (for example 240 for a 5-minute cache).
  - `maxConsecutive`: heartbeat turns allowed in a row with no other turn between them. After that no heartbeat is sent and the cache cools until a real turn.
  - `compactThresholdTokens` (default 256000, DSH's "256K"): see **Compaction on cooling**. It has a default, so it never turns heartbeats on or off.
- **Timer.** Every Fishball turn resets it, heartbeat turns included: it starts when a turn ends and is cleared when a turn starts, so a heartbeat never arrives during a turn.
- **Count.** A turn is a heartbeat turn when it carried the heartbeat message and no work: nothing you typed, no batch of connector events, no reminder, no other plugin's notice. A heartbeat turn adds one; any other turn resets the count to zero. A turn that made no model request changes neither the count nor the timer.
- **Batched events.** fishball-core hands connector events to Fishball in batches (one turn per batch). Each batch turn resets the timer and the count like any real turn; events still waiting in core's quiet window are not a turn yet, so a heartbeat can fire meanwhile.
- **Focus.** Fishball's `heartbeat_focus` tool sets what the next heartbeat should focus on (`{focus: string}`, at most 2000 characters, empty clears). It is stored in `<profile home>/fishball-heartbeat/focus.json`. Every heartbeat message carries the focus and tells Fishball to call `heartbeat_focus` at the end of that turn, from the current state (for example its managed sessions' progress).
- **Restart.** When Fishball's session next opens, the count and the last turn's end are read back from its log. A heartbeat that came due while DSH was down, or whose timer fires late because the machine slept, is not sent (the cache is presumed cold); the next turn re-arms the timer.
- A failed send is logged and not retried; the next turn re-arms the timer.
- **Compaction on cooling.** Whenever the heartbeat gives up warming the cache (the limit reached, an overdue or late heartbeat dropped, a failed send), it measures Fishball's context with DSH's token meter (`tokenMeter.measure`, the size DSH's own compaction compares against). If it is longer than `compactThresholdTokens`, it compacts it once, with DSH's idle compaction (`compaction.compactNow`, what `/compact` runs), after Fishball's turn has finished. The next real turn pays a cold cache write anyway, so this is when a shorter context costs least. Once per cooling: after an attempt (compacted, nothing to compact, or failed) nothing more is compacted until a real turn; a heartbeat turn does not reset it, and an idle compaction already in the log counts after a restart. At or below the threshold nothing happens. A failure is logged and not retried. A message arriving while it runs waits for it, as during `/compact`. It needs a `compaction` service in Fishball's composition (fishball-core's own preset carries DSH's `compaction-basic` with automatic compaction off); without one, or without the token meter, it logs that once and only keeps the heartbeats.

Each heartbeat is a real model turn over Fishball's cached context: cache-read input plus whatever Fishball does in it. `maxConsecutive` bounds the heartbeats between two real turns. A connector event batch is a real turn, so a heartbeat that pokes a managed session whose reply wakes Fishball starts a fresh count.

Install it on its own, or with the other amenities through the [`fishball-amenities`](<../fishball-amenities/README.md>) umbrella. It needs `fishball-core` in the same DSH; without it the row loads, logs `fishball-core-missing` once and stays idle.

## Structure

| path | what |
|---|---|
| `package.json`, `cordis.patch.yml` | manifest (depends on and bundles `fishball-shared`) and the patch inserting row `fishball-heartbeat` |
| `index.js` | the row: binds `fishballInstance` (`fishball-shared/instance-follower`), re-applies itself on a live settings change |
| `src/config.js` | the `Config` (`intervalSeconds`, `maxConsecutive`, `compactThresholdTokens`) and the on/off rule |
| `src/heartbeat.js` | the per-manager timer, the count and the heartbeat send |
| `src/turns.js` | the pure fold of the session log into turn state (also used at restart) |
| `src/compactor.js` | the one compaction on cooling |
| `src/focus.js`, `src/tool.js` | the focus file and the `heartbeat_focus` tool |
| `src/live-settings.js` | `settingsSnapshot` / `runWithSettings`: a volatile settings change re-runs the row without a remount |
| `src/constants.js` | the row's values |
| `assets/` | the plugin icon |
| `tests/` | its own tests (not shipped) |

## Testing

```bash
node scripts/test.mjs fishball-heartbeat                                   # everything, current DSH
node scripts/test.mjs fishball-heartbeat --file=live-settings              # one entry file
node scripts/test.mjs fishball-heartbeat --against=23e334c8 -- --test-name-pattern=HB-CAU   # the regression rows on the code before 2a375e82 (9 fail)
```

| entry | what it covers |
|---|---|
| `heartbeat.test.mjs` | the heartbeat row: timer, count, `heartbeat_focus`, restart, the core seam, live settings, compaction on cooling, what its own compaction causes (199 cases) |
| `live-settings.test.mjs` | `src/live-settings.js` on a fixture row (25 cases) |

Details and the case-id index: [tests/README.md](<tests/README.md>). Integration:
[`integration-amenities`](<../../dsh-fishball/packages/integration-amenities/README.md>) (beside fishball-board's `Config`, the icon
family), [`integration-release`](<../../dsh-fishball/packages/integration-release/README.md>) (package boundaries, release folder). Rules and
runner: [docs/testing/README.md](<../../dsh-fishball/docs/testing/README.md>).