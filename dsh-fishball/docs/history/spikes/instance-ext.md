# Spikes SP-X1, SP-FN1, S1 for the instance extension points

Date 2026-11-08. Branch `design/instance-ext` (base `feat/body-soul` 1425384). Questions from
`docs/plugins/instance-extension-points.md` §4 and §5 row **SP**. Investigation only: no product
module was changed.

## How they were run

`spikes/instance-ext/probe.mjs <version> <home> a|b` with `fake-llm.mjs`. Each run boots the
installed DSH version **in-process** through `@deepseek-ai/dsh/lib/profile-boot.js` `runProfile`,
in a fresh `mktemp -d /private/tmp/spx-*` home. That home holds everything: `HOME`, `DSH_HOME`,
`npm_config_cache`, `npm_config_store_dir`, an empty `npm_config_userconfig` and the `XDG_*`
directories. The profile is `spx`, made of `dsh-base` plus one overlay that inserts the no-network
fake model and sets it as the default model. Stdin is held open by a bounded `sleep` pipe, because
DSH shuts down on stdin EOF. The process exits itself.
- Phase `a` is a fresh home.
- Phase `b` boots the same home again as a new process (the restart).

Runs, all with exit code 0:

| Run | DSH | Placement |
| --- | --- | --- |
| 1 | 0.2.1-rc.5, a + b | vendored `file:` dependency + `pnpm install --offline` |
| 2 | 0.2.2-rc.1, a + b | same |
| 3 | 0.2.1-rc.5, a | same, plus a dump of where the context text appears |
| 4 | 0.2.1-rc.5, a + b | vendored copy, **no pnpm at start** (`SPX_PLACE=copy`) |
| 5 | 0.2.2-rc.1, a + b | same |

Node was Homebrew 22.22.2; `pnpm` was `/opt/homebrew/bin/pnpm` 10.33.0, offline.

Not touched: `~/.dsh`, `/Volumes/SSD2/.dsh`, the :7713 home, `~/.npmrc`, any credentials file.
No process was left running, and the homes under `/private/tmp/spx-*` were removed afterwards.

## SP-X1: a late X2 registration on a live agent

**Question.** If a plugin registers X2 while Fishball's agent is live, through
`agentCtx.plugin({apply})` on the agent's scope, do its tool and its section take effect at the next
step? And does `dispose` remove them?

**Method.** The `setup` of `agents.create` registers a tool `spx_probe`. When the model calls it,
the tool runs `agentCtx.plugin(...)`, which registers the tool `spx_late` and the section
`SPX-LATE-SECTION`. The probe records each model request's tool list and messages.

**Result: yes on both versions.**

| Moment | `spx_late` offered | Section in the request |
| --- | --- | --- |
| Before | no | no |
| Same turn, the step before the call | no | no |
| Same turn, the step after the tool result | **yes** | **yes** |
| Next turn | yes | yes |
| After `fiber.dispose()` | **no** | **no** |

The numbers are the same on 0.2.1-rc.5 and 0.2.2-rc.1. The step after the tool result is the next
step, so a registration takes effect **within the running turn**. The API used is
`ctx.plugin(plugin)` in `cordis/lib/types/registry.d.ts:120,198` (both versions), on the agent
scope that `AgentSetup` receives (`dsh-agent/lib/types/index.d.ts:40` rc.5, `:41` rc.1).

**Impact.** X2 stands as designed (§2.1). A tool registered by X2 is in effect from the model
request after its registration, even mid-turn. This adds one test case: "registration during a
turn → offered at the next step".

## SP-FN1: a vendored `file:` bundle in the child profile

**Question.** Does a bundle placed as `vendor/<name>`, listed as `dependencies[name] =
"file:./vendor/<name>"` and in `dsh.profile.bundles`, load as a row? Does it survive an
`installBundle` of another package? Does a disable persist across a restart?

**Results, the same on both versions.**

1. **The `file:` dependency alone does not load.** With `vendor/` and the manifest entry but
   nothing in `node_modules`, the bundle is listed in `skippedBundles`.
   - DSH resolves a bundle only through Node's `node_modules` lookup: `resolveBundleDir` and
     `packageDirFromAnchor`, `dsh-app-boot/lib/index.js:995` and `:977` (rc.5), `:1774` (rc.1).
   - An unresolvable bundle is skipped without failing the boot: `loadProfileDirectory`
     `:1015-1040` (rc.5), `:1795-1817` (rc.1).
   - The instance treats any skipped bundle as fatal: `initializeProfile` stops with
     `PROFILE_INCOMPATIBLE` when `profile.skippedBundles.length` is non-zero
     (`packages/instance/src/native-runtime/installation.js:154`).
2. **The bundle loads once its package is in `node_modules`.** Both ways were tested:
   - `pnpm install --offline` in the profile;
   - a plain copy to `node_modules/<name>`.

   Both work, because the profile's `pnpm-workspace.yaml` is `nodeLinker: hoisted` (rc.5
   `dsh-app-boot/lib/index.js:598-603`, rc.1 `:1373-1376`), so the package is a real directory and
   not a symlink. The row is applied once at boot. `listBundles` reports it as
   `enabled: true, installed: true, removable: true`, with source `file:…/vendor/<name>`.
3. **It survives another install.** `installBundle(<path>)` runs `pnpm add` in the profile (rc.5
   `dsh-plugin-manager/lib/index.js:2034`, rc.1 `:2802`). Afterwards our dependency, our
   `node_modules` copy, our `dsh.profile.bundles` entry and its lock entry
   `spx-bundle@file:vendor/spx-bundle` are all still there.
   - In the copy variant (no lock before), pnpm reinstalled the package from `vendor/` and wrote
     the lock entry. The plugin manager's reload then disposed the row and applied it again, once.
4. **A disable persists across a restart.** `setBundleEnabled(name, false)` removes the name from
   `dsh.profile.bundles` (`selectBundle`: rc.5 `:2280-2302`, rc.1 `:3048-3070`) and disposes the
   row. It keeps the dependency and the installed package.
   - After a restart the row is not applied, and `listBundles` shows `enabled: false, installed:
     true`.
   - `setBundleEnabled(name, true)` applies the row again, live.
5. **`removable: true`.** DSH itself would remove a bundled plugin, so the instance must refuse it
   (X18). This is as designed.

**Impact on the design (X17 / §2.2).**
- Step 2 must place the package in **both** `vendor/<name>` (the `file:` source pnpm keeps) **and**
  `node_modules/<name>` (what DSH resolves).
- The instance keeps doing this **without pnpm**: a copy with `copyChildCode`'s rules, temp
  directory, then rename. The instance runs no package manager today, and the copy was proven on
  both versions.
- "The disable is DSH's own bundle enable state" holds. Because a disable removes the name from
  `dsh.profile.bundles`, the "add the name only the first time" record (`bundled: [...]`) is
  **required**. Without it every start would turn the plugin on again.
- New constraint: a placement that fails after the name is in `dsh.profile.bundles` makes the
  instance's own check fail the start (`installation.js:154`). DSH itself only skips the bundle.
  Step 6 ("the child still starts without it") therefore needs the instance's check to **ignore a
  skipped bundle whose name is a bundled plugin it failed to place this start**, logging
  `BUNDLED_PLUGIN_UNAVAILABLE`. Every other skipped bundle stays fatal.
  - *Why not drop the name from the manifest.* The manifest's `dsh.profile.bundles` **is** the
    user's enable state, so editing it on a failure would lose an "on" across the next good start.
  - This is written into §2.2.

## S1: an agent-scoped context after compaction and resume

**Question.** Is a `systemPrompt.context` registered in the agent's `setup` (with a provider
function) re-evaluated on every request, after a compaction, and after a resume?

**Method.**
1. `setup` registers context `spx-board` with `text: () => 'SPX-BOARD-' + n`.
2. Six large turns run.
3. `compaction.compactNow(agent, signal)` is called.
4. `n` is changed, and one more turn runs.
5. The handle is disposed, and `agents.resume({resumeSessionId, setup})` is called with the same
   `setup`.
6. `n` is changed again, and one more turn runs.

**Result: yes on both versions.**

| Moment | Current value in the request | Older values in the request |
| --- | --- | --- |
| A normal turn | present | 0 |
| After a change of `n` without compaction | present | **yes**: the previous value is still in the earlier `request/context` entries of the history |
| `compactNow` | one `compaction/summary` written | — |
| After compaction | present | **0** (the old entries were compacted away) |
| After resume | present | the pre-resume value remains in history |

The context reaches the model as a `request/context` entry: the dump showed it after the runtime
context, `{"name":"spx-board","text":…}`. A provider is evaluated "at assembly and admission
refresh" (`dsh-system-prompt/lib/types/index.d.ts:77`, both versions). Registration is
`context(context)` at `:269` (rc.5) and `:275` (rc.1). `compactNow` is in
`dsh-compaction/lib/types/index.d.ts:137` (both versions).

**Impact.**
- The board's injection (board §5) works as designed.
- The model may also see **earlier** board snapshots in its history until a compaction removes
  them. The board's guide text should therefore say that the newest board block is the current one.
- This is a wording note for B5, not a change to X2.
- `request/context` entries are part of the history, so they count toward context size. The board's
  2000-character cap (board §9) bounds the growth per changed turn.

## Cleanup

Each probe run exited by itself, and `pgrep -fl probe.mjs` found nothing afterwards. The
`/private/tmp/spx-*` homes were deleted. Nothing outside them was written, apart from the probe
sources and this file in the worktree.
