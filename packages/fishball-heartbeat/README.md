# fishball-heartbeat

Keeps Fishball's prompt cache warm while it is idle, and gives each warming turn useful work.

- **Off until you set both settings** (Fishball cannot change either). Installed through the [`fishball-amenities`](../fishball-amenities/README.md) umbrella, set them on the heartbeat's component page there; a saved change applies at once. Installed alone it has no settings page: set them in its row's `config` in the profile's `cordis.patch.yml`.
  - `intervalSeconds`: seconds with no Fishball turn before a heartbeat turn is sent. Set it below your model's cache lifetime (for example 240 for a 5-minute cache).
  - `maxConsecutive`: heartbeat turns allowed in a row with no other turn between them. After that no heartbeat is sent and the cache cools until a real turn.
- **Timer.** Every Fishball turn resets it, heartbeat turns included: it starts when a turn ends and is cleared when a turn starts, so a heartbeat never arrives during a turn.
- **Count.** A turn is a heartbeat turn when it carried the heartbeat message and no work: nothing you typed, no batch of connector events, no reminder, no other plugin's notice. A heartbeat turn adds one; any other turn resets the count to zero. A turn that made no model request changes neither the count nor the timer.
- **Batched events.** fishball-core hands connector events to Fishball in batches (one turn per batch). Each batch turn resets the timer and the count like any real turn; events still waiting in core's quiet window are not a turn yet, so a heartbeat can fire meanwhile.
- **Focus.** Fishball's `heartbeat_focus` tool sets what the next heartbeat should focus on (`{focus: string}`, at most 2000 characters, empty clears). It is stored in `<profile home>/fishball-heartbeat/focus.json`. Every heartbeat message carries the focus and tells Fishball to call `heartbeat_focus` at the end of that turn, from the current state (for example its managed sessions' progress).
- **Restart.** When Fishball's session next opens, the count and the last turn's end are read back from its log. A heartbeat that came due while DSH was down, or whose timer fires late because the machine slept, is not sent (the cache is presumed cold); the next turn re-arms the timer.
- A failed send is logged and not retried; the next turn re-arms the timer.

Each heartbeat is a real model turn over Fishball's cached context: cache-read input plus whatever Fishball does in it. `maxConsecutive` bounds the heartbeats between two real turns. A connector event batch is a real turn, so a heartbeat that pokes a managed session whose reply wakes Fishball starts a fresh count.

Install it on its own, or with the other amenities through the [`fishball-amenities`](../fishball-amenities/README.md) umbrella. It needs `fishball-core` in the same DSH; without it the row loads, logs `fishball-core-missing` once and stays idle. It has no browser code.
