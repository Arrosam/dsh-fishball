# fishball-source-example

A small DSH plugin that feeds Fishball through `ctx.fishball`. Use it as a template for your own source (mail, calendar, a feed, a build server).

- **Install:** from DSH's Plugins page, install this folder (an absolute path is a valid package spec). Leave the bundle off to run it for Fishball only, then turn it on under "Plugins for Fishball".
- **Use:** add notes to its config on its Plugins page and save; DSH reloads the plugin, and each note with a new `id` reaches Fishball as one event and wakes it (notes already sent answer `duplicate`).
- **What it shows:** registering a source, publishing with a dedupe key, handling the `disabled` status and the stable error codes.

See [docs/plugin-author-guide.md](../../docs/plugin-author-guide.md) in the dsh-fishball repository for the full contract.
