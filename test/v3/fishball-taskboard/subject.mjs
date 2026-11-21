/**
 * The one place that binds the fishball-taskboard cases to the row (packages/fishball-taskboard/
 * index.js). The surface, as the lead named it (2026-11-21):
 * - the row module exports name 'fishball-taskboard', inject ['storage', 'storageDomain',
 *   'connection'] and apply(ctx); it is imported bound to the SDK under test (its @deepseek-ai/*
 *   imports resolve to that SDK) and mounted as one loader row;
 * - a tool runs as DSH runs it: definition.execute(args, exec), exec.agent = {id, session}. DOC §3:
 *   "a refusal is always the returned value; the tools never throw", so a throw fails the case (it is
 *   not normalised to a refusal here, unlike the board suite).
 * No file of the row is read; only its exports are used.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE as INSTANCE_PKG } from '../../support/constants.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'

/** The row module bound to sdk; a missing entry fails the case that needs it, naming it. */
export async function rowModule(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), SUBJECT.entry + ' does not exist (' + SUBJECT.name + ')')
  const mod = await importInstance(sdk, path.relative(INSTANCE_PKG.dir, SUBJECT.entry))
  assert.equal(typeof mod.apply, 'function', SUBJECT.name + ' exports no apply()')
  return mod
}

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
