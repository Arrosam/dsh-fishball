# fishball-ui

Every UI change inside a Fishball DSH, drawn over `fishball-core`'s backend.
Core keeps every state; this package only draws it. It reads core through core's published routes
and `fishball-shared/ui-seam`, never by importing `fishball-core`, and depends on no DSH-side
package.

Version `1.0.0-alpha.1`. Requires DSH `>=0.2.1-rc.5`. In hosted mode `dsh-instance` places it in Fishball's child, before
core; in a standalone DSH you install it yourself, before core (see the
[root README](<../../README.md>)).

## What it draws

- **The Fishball page** (`fishball-page/`): the page opens only Fishball's manager session, with
  DSH's navigation hidden and explicit returns from Settings and Plugins. In a hosted child, the
  main DSH's `dsh-connector-ui` window shows this same page.
- **The two settings entries** on the page: "Fishball settings" (fishball-core's own settings page)
  and "DSH settings".
- **The model dialog** (`client.model.js`): when the Fishball page opens and core's `model` is
  unset, a dialog lists DSH's model catalog and writes the choice into core's `model` setting.
  Dismissed, it comes back at the next page open. With no model configured in DSH it says so and
  opens DSH Settings. The model can be changed later in fishball-core's settings.
- **The status strip** (`client.strip.js`, `/api/fishball/strip`), **the pairing views**
  (`src/pairing/`) and **the ask cards** (`client.asks.js`) for asks Fishball cannot decide.
- **The Recommended tab** (`fishball-recommend-plugins/`) on DSH's Plugins page.
- **UI guard rows**: `ui-subagent`, `ui-schedule`, `ui-permission`, `ui-agent-preset`,
  `entry-customization`, `ui-open-in-app`, `ui-sidebar-terminal` and `ui-model-selection` (the
  composer's model picker) are switched off while `fishball-core` is in the profile.

## Without core

Every row is switched on or off by whether `fishball-core` is in the profile (read live while HMR
runs). Without core, only `fishball-ui-core-missing` runs: it logs `fishball-core-missing` and
changes nothing.
