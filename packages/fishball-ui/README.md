# fishball-ui

Every UI change inside a Fishball DSH, drawn over `fishball-core`'s backend.
Core keeps every state; this package only draws it. It reads core through core's published routes
and `fishball-shared/ui-seam`, never by importing `fishball-core`, and depends on no DSH-side
package.

Version `1.0.0-alpha.1`. Requires DSH `>=0.2.1-rc.5`. In hosted mode `dsh-instance` places it in Fishball's child, before
core; in a standalone DSH you install it yourself, before core (see the
[root README](<../../README.md>)).

## What it draws

- **The Fishball page** (`fishball-page/`): the page opens only Fishball's manager session. DSH's
  own sidebar stays, with its panels (Plugins and every plugin's entry, each with its own icon),
  Settings, and a "Fishball" button back to the manager's conversation; its workspace and session
  browser is replaced by Fishball's DSH targets. In a narrow window (480px and below) that sidebar
  is restyled as a 44px bar along the bottom edge that scrolls sideways when it is full; on DSH
  0.2.2 below 768px DSH's own drawer opens it instead. In a hosted child, the main DSH's
  `dsh-connector-ui` window shows this same page.
- **The two settings entries** in the page's header, as icons with tooltips: "Fishball settings"
  (fishball-core's own settings page) and "DSH settings".
- **The model dialog** (`client.model.js`): when the Fishball page opens and core's `model` is
  unset, a dialog lists DSH's model catalog and writes the choice into core's `model` setting.
  Dismissed, it comes back at the next page open. With no model configured in DSH it says so and
  opens DSH Settings. The model can be changed later in fishball-core's settings.
- **The DSH targets** in the sidebar (`client.strip.js`, `/api/fishball/strip`): every DSH Fishball
  connects to, by the name its server gives (shown as plain text, ` (2)` for a later duplicate),
  or "Not set" / "Name unavailable" before it has one, with its state (connected, connecting,
  failed, not set). Pressing a target opens its details in place: why, its address, the
  contributed tools it offers (zero too), its live-name support, Connect or Cancel, Retry, its
  pairing warning and choices (Continue only once its box is ticked), and Fishball settings, where
  targets are added, removed and edited. Opening a target only shows it; it never chooses where
  Fishball works. **The ask cards** (`client.asks.js`) for asks Fishball cannot decide, each naming
  the DSH it came from. When a stream is lost, the list or card says so, stops offering its
  controls, and offers Reconnect once the browser gave up.
- **The Recommended tab** (`fishball-recommend-plugins/`) on DSH's Plugins page.
- **UI guard rows**: `ui-subagent`, `ui-schedule`, `ui-permission`, `ui-agent-preset`,
  `entry-customization`, `ui-open-in-app`, `ui-sidebar-terminal` and `ui-model-selection` (the
  composer's model picker) are switched off while both `fishball-ui` and `fishball-core` are in the
  profile. The rows are in core's patch, so they cannot touch a DSH without core.

Everything is drawn with DSH's own components, icons and theme tokens, so it follows DSH's light
and dark themes and its language (en and zh).

## Without core

Every row of fishball-ui's patch is switched on or off by whether `fishball-core` is in the profile
(read live while HMR runs). That patch only inserts its own rows. Without core, only
`fishball-ui-core-missing` runs: it logs `fishball-core-missing` and changes nothing. The rows that
change DSH's own UI are in core's patch, which a DSH without core does not have.
