# fishball-source-example

> **Known bug (fix pending in code).** This example targets the `ctx.fishball` source service,
> which `fishball-connector` and `fishball-instance` no longer provide, so `index.js` below does
> not run as written. A separate code task will fix the example.

A small DSH plugin that feeds Fishball through `ctx.fishball`. Use it as a template for your own source (mail, calendar, a feed, a build server).

- **Install:** from DSH's Plugins page, install this folder (an absolute path is a valid package spec), or install it for Fishball alone with "Install a plugin for Fishball only" on Fishball's settings page. Either way, turn it on under "Plugins for Fishball": DSH plugins start off there. Leave the DSH bundle off to run it for Fishball only.
- **Use:** put notes in the plugin's row config (the `notes` list in the profile's `cordis.patch.yml`) and restart DSH. Each note with a new `id` reaches Fishball as one event and wakes it; notes already sent answer `duplicate`. The list is not a live setting, so DSH's Plugins-page form cannot change it while DSH runs.
- **What it shows:** registering a source, publishing with a dedupe key, handling the `disabled` status and the stable error codes.

See [docs/plugin-author-guide.md](../../docs/plugin-author-guide.md) in the dsh-fishball repository for the full contract.
