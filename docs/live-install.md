# Live install: `fishball` profile in the owner's DSH home

Recorded 2026-10-23 under [the live-install amendment](owner-amendment-2026-10-23-live-install.md).

## Layout

| Item | Value |
| --- | --- |
| DSH home / host | `~/.dsh`, DSH Web 0.2.1-rc.2 from DSH-X's versions folder |
| Node | DSH-X bundled runtime, now official v22.22.2 |
| Profile | `~/.dsh/profiles/fishball` (0755), bundles `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app` |
| Package | `node_modules/dsh-fishball` → symlink to this checkout (`link:` dependency, like the owner's other local plugins) |
| Entries | `dsh-fishball/testing-provider`, `dsh-fishball/installed`, [live-read-only-preset.mjs](../scripts/live-read-only-preset.mjs) (absolute path) |
| Private data | `df-data/` (0700): `runtime.sqlite`, `df-sessions-fishball/` (this profile's only JSONL session root); `df-workspace/` (0700) worker environment |
| Launch | DSH-X launch item **fishball**, port 3092 |

The patch disables the real-model, account, telemetry, web-tool and stock presets like the initial-preview launcher, and adds `inject: [webStartup, webServer]` to the original Connection row. The owner's `web` profile, credentials and settings were not edited; DSH-X `settings.json` gained only the launch item (backup `settings.json.pre-fishball-20261023`).

## Use

1. Quit and restart DSH-X so it runs on Node 22.22.2 (needed for the worker/provider/memory checks).
2. Start launch item **fishball** and open the **dsh-fishball** panel.
3. Preview local setup, tick the checkbox and confirm. This creates the encrypted local store.

## Updating / removing

The profile follows this checkout directly. After any change, regenerate `native-source-manifest.json` (see AGENTS.md) or the worker refuses with `WORKER_SOURCE_UNAVAILABLE`. Check out only reviewed commits while the profile runs. To remove: delete the launch item, then `~/.dsh/profiles/fishball` (this deletes its local data). To restore the old runtime, copy the backup `node`/`npm` back and re-sign ad hoc.

## Verification (2026-10-23)

- Full suite 2200/2200 after the lock and peer changes; `npm run check` and client check OK.
- Trial on Homebrew Node 22.22.2, port 3093, against the real profile: all df entries active (the only inactive entry is the host's own `ui-deliverables`, which waits on the deliberately disabled `workspace-changes`). In the real browser the dsh-fishball panel rendered "needs your explicit setup decision" with the exact database path. "DF Read Only" and "Synthetic local worker" were selected and there were no console messages. Setup was not confirmed; that is the owner's step. The trial was stopped.
- Not verified: a run on the swapped DSH-X runtime (it requires the owner's restart), setup confirmation, worker execution.
