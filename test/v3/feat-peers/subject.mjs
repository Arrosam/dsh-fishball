/**
 * The one place that binds the FEAT-PEERS cases to the two packages (`packages/board/`,
 * `packages/fold-notify/`). The frozen surfaces are the plugins' own rows (`name`, `inject`,
 * `apply`, `Config`), K3 `fishballInstance` (`apiVersion: 1`) with the X1/X2/X8/X9 members of
 * docs/plugins/instance-extension-points.md §1.1, and the board's and fold-notify's manager tools.
 * The dev session has relayed no other surface yet (2026-11-15), so this file assumes ONE shape; if
 * the packages differ, only this file is adapted, no case changes:
 *
 * - each row is its package's `index.js`, imported bound to the SDK under test (its
 *   `@deepseek-ai/*` imports resolve to that SDK) and mounted as one loader row;
 * - the board reads the clock through `Date` (the board design stores epoch ms); the fake clock is
 *   node:test's MockTimers on `Date` only, so no timer of DSH or of the harness is touched;
 * - X8 `attention.signal(pluginId, {important})` resolves to the answer the fake core attention
 *   member gives (`ATTENTION.accepted` or `ATTENTION.refused`, a K1 refusal envelope), never rejects;
 * - a manager tool runs as DSH runs it: `definition.execute(args, exec)` with `exec.agent` the
 *   manager's agent (`{id, session}`); a refusal may be a returned `{ok: false, code}` or a thrown
 *   error with a string `code` (the designs name the code, not the transport), and is normalised to
 *   the former here; any other throw fails the case.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'

/** A package's row module bound to `sdk`. */
export async function rowModule(sdk, plugin) {
  assert.ok(fs.existsSync(plugin.entry), `${plugin.entry} does not exist (${plugin.name})`)
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, plugin.entry))
  assert.equal(typeof mod.apply, 'function', `${plugin.name} exports no apply()`)
  return mod
}

/** Starts the fake clock at `now` (epoch ms) on `t`; `advance(ms)` moves it. */
export function fakeClock(t, now) {
  t.mock.timers.enable({ apis: ['Date'], now })
  return { advance: (ms) => t.mock.timers.tick(ms), now: () => Date.now() }
}

/** One manager tool call; `{ok: false, code}` for a refusal, the tool's value otherwise. */
export async function runTool(definition, args, exec) {
  try {
    return await definition.execute(args, exec)
  } catch (error) {
    if (typeof error?.code !== 'string') throw error
    return { ok: false, code: error.code }
  }
}
