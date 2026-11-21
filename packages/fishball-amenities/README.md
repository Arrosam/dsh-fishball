# fishball-amenities

Optional Fishball amenity components: `fishball-board` and `fishball-heartbeat`. Configure each amenity from its component settings under **Plugins → Fishball Amenities → Components**.

## fishball-heartbeat

Keeps Fishball's prompt cache warm while it is idle, and gives each warming turn useful work.

- **Off until you set both settings** (component settings of `fishball-heartbeat`; Fishball cannot change either):
  - `intervalSeconds`: seconds with no Fishball turn before a heartbeat turn is sent. Set it below your model's cache lifetime (for example 240 for a 5-minute cache).
  - `maxConsecutive`: heartbeat turns allowed in a row with no other turn between them. After that no heartbeat is sent and the cache cools until a real turn.
- **Timer.** Every Fishball turn resets it, heartbeat turns included: it starts when a turn ends and is cleared when a turn starts, so a heartbeat never arrives during a turn.
- **Count.** A turn is a heartbeat turn when it carried the heartbeat message and nothing you typed. A heartbeat turn adds one; any other turn (your message, a connector event, a reminder) resets the count to zero. A turn that made no model request changes neither the count nor the timer.
- **Focus.** Fishball's `heartbeat_focus` tool sets what the next heartbeat should focus on (`{focus: string}`, at most 2000 characters, empty clears). It is stored in `<profile home>/fishball-heartbeat/focus.json`. Every heartbeat message carries the focus and tells Fishball to call `heartbeat_focus` at the end of that turn, from the current state (for example its managed sessions' progress).
- **Restart.** The count and the last turn's end are read back from Fishball's session log. A heartbeat that came due while DSH was down is not sent late (the cache is presumed cold); the next turn re-arms the timer.
- A failed send is logged and not retried; the next turn re-arms the timer.

Each heartbeat is a real model turn over Fishball's cached context: cache-read input plus whatever Fishball does in it. `maxConsecutive` bounds that cost per idle period.
