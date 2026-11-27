/**
 * The one place that binds the fishball-taskboard cases to the row (this package's index.js). The
 * surface, as the lead named it (2026-11-21):
 * - the row module exports name 'fishball-taskboard', inject ['storage', 'storageDomain',
 *   'connection'] and apply(ctx); it is imported bound to the current DSH (fishball-test-helpers/bind
 *   rowModule: its @deepseek-ai/* imports resolve to that DSH) and mounted as one loader row;
 * - a tool runs as DSH runs it: definition.execute(args, exec), exec.agent = {id, session}. DOC §3:
 *   "a refusal is always the returned value; the tools never throw", so a throw fails the case (it is
 *   not normalised to a refusal here, unlike the board suite).
 * No file of the row is read; only its exports are used.
 */
import assert from 'node:assert/strict'

/** One tool call; the tool's value. A throw fails the case (DOC §3: the tools never throw). */
export async function runTool(definition, args, exec) {
  try {
    return await definition.execute(args, exec)
  } catch (error) {
    assert.fail(definition.name + ' threw instead of returning a refusal (DOC §3): ' + (error?.stack ?? error))
  }
}

/** One tool call whose rejection is the oracle (DOC §3's exception: DSH refuses non-object arguments). */
export function runToolRaw(definition, args, exec) {
  return definition.execute(args, exec)
}
