# fishball-ui

Every change Fishball makes to DSH's own UI inside a Fishball DSH: the Fishball page, the sidebar's DSH
targets with their pairing and running sessions, the ask cards, the sidebar brand row, the model dialog,
the two settings entries, the Fishball Recommended tab (standalone) and the instance-run child's
Plugins page notice. Version `1.0.0-alpha.1`, private.

fishball-ui is **its own package** (`packages/core/ui/package.json`, name `fishball-ui`) nested in
fishball-core's folder. It is not published on its own: it ships inside fishball-core's tarball (core's
`files` lists `ui/` and excludes `ui/tests/`), and it has no `cordis.patch.yml` of its own: its rows
are in [core's patch](<../cordis.patch.yml>) (see [fishball-core](<../README.md>)). It reads core only
through core's published routes and services by the names in `fishball-shared/ui-seam`, never through
an import, and depends on no DSH-side package.

## What it does

- **Node row** `fishball-ui` (`index.js`): provides `fishballUiGuards`, fishball-ui's presence (core's
  guard check reports the UI guard rows of core's patch only while it is there), serves the sidebar
  targets drawn from core's `fishballStatus` (`/api/fishball/strip`), and registers that view as the
  `strip` topic of core's one page stream (DESIGN §34).
- **Browser half** (`client.js` and its flat chunks, each run as its own part; a chunk that fails to
  load loses only its part):
  - `client.entries.js`: the Fishball page's "Fishball settings" and "DSH settings" entries and the
    `view=settings` continuation;
  - `client.asks.js`: the ask cards in Fishball's own conversation (`conversation.input.dock`), answered
    through core's `/api/fishball/asks/answer`;
  - `client.strip.js`: each DSH target in the sidebar, its inline details, Connect / Cancel / Retry, its
    pairing choices and its running managed sessions;
  - `client.brand.js`: Fishball's logo, wordmark and state in DSH's sidebar brand row; the wide brand
    button opens the one manager session (LOGO-BUTTON);
  - `client.model.js`: while core's `model` is unset, the dialog that lists DSH's model catalog and
    writes the choice to core's settings.
  - One EventSource for the page (core's `/api/fishball/page/events`), demultiplexed by topic; other
    browser code (fishball-taskboard's tab) subscribes through the client service `fishballPageStream`.
- **`fishball-page/`**: the Fishball page itself (the manager's conversation): the shortcut and launcher
  guards that keep the page on the manager session, the narrow 44px bottom bar, the
  `message_user` rows (DESIGN §32: assistant replies are folded, only `message_user` messages stay in
  view) and the reply avatar.
- **`fishball-recommend-plugins/`** (standalone only): the **Fishball Recommended** tab on DSH's Plugins
  page and its `GET /api/fishball/recommended` (data: `src/recommended.js`).
- **`fishball-child-plugins/`** (instance-run child only): hides DSH's own install entries on the child's
  Plugins page and says plugins are installed from the main DSH (DESIGN §28).

Which of the last two runs, and whether any of fishball-ui runs, is decided by core's patch.

## Structure

| path | what |
|---|---|
| `package.json` | manifest: exports `.`, `./client`, `./core-missing`; `dsh.client` web; no `dsh.bundle` |
| `index.js` | the Node row |
| `client.js` | the browser entry: loads the parts, the shared kit (styles, page stream, `fishballPageStream`) |
| `client.{entries,asks,strip,brand,model}.js` | the browser parts (flat chunks: DSH serves only `client.<name>.js` siblings) |
| `src/constants.js` | fishball-ui's own values |
| `src/status/` | the sidebar targets' view model, its copy and route |
| `src/pairing/` | a target's pairing view model and its copy |
| `src/stream.js` | the live view route helper |
| `src/recommended.js` | the curated recommended plugins |
| `src/core-missing.js` | a row that logs `fishball-core-missing` (exported as `./core-missing`; no patch row inserts it today) |
| `fishball-page/`, `fishball-recommend-plugins/`, `fishball-child-plugins/` | sub-packages, each with `index.js` and `client.js` |
| `assets/` | the plugin icon |
| `tests/` | fishball-ui's own tests (not shipped) |

## Testing

```bash
node scripts/test.mjs fishball-ui                        # every entry file, current DSH
node scripts/test.mjs fishball-ui --file=model-dialog    # one entry file
node scripts/test.mjs fishball-ui -- --test-name-pattern='HEALTH|TIME'
node scripts/test.mjs fishball-ui --against=<git-ref>    # today's tests on fishball-ui's code at <ref>
```

fishball-core's tests never run fishball-ui's and the reverse. Nothing of core runs in these tests: what
core would serve is scripted. Entry files (the [test index](<tests/README.md>) has the case-id prefixes
and counts):

| entry | what it covers |
|---|---|
| `brand.test.mjs` | the sidebar brand row, its states, the manager-session button, the reply avatar |
| `connections.test.mjs` | the page's one live connection, whatever readers are mounted |
| `contrast.test.mjs` | WCAG contrast of the ask card's reason box and open badge; DSH tokens only |
| `model-dialog.test.mjs` | the model dialog, the sidebar DSH targets, ask-card sources, running sessions |
| `package.test.mjs` | the manifests and shipped files, the part loader, fishball-page's navigation and narrow bar |
| `page.test.mjs` | fishball-page's LITE guards in a real browser |
| `pairing.test.mjs` | the pairing view model |
| `recommended.test.mjs` | the Fishball Recommended tab |
| `stream.test.mjs` | stream health of the ask cards, ask-card time locale |

Rows that need fishball-core (or fishball-taskboard) beside fishball-ui run in the integration packages
before a release: [`integration-page-stream`](<../../integration-page-stream/>) (the page stream with
core and fishball-taskboard), [`integration-release`](<../../integration-release/>) (package
boundaries, the release folder) and [`integration-amenities`](<../../integration-amenities/README.md>)
(fishball-ui's icon in the family). The guard rows observed with fishball-ui present are core's
([tests/guards/README.md](<tests/guards/README.md>)). Rules and runner:
[docs/testing/README.md](<../../../docs/testing/README.md>).
