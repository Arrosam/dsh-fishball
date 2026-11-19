/**
 * The one import point of the module under test, `packages/dsh-connector/src/ui/index.js`
 * (C-UI-BACKEND). The surface is the one the dev session relayed (2026-11-16; constants.mjs
 * SURFACE), not read from the implementation:
 *
 *   import { createUiBackend, UI_ROUTE, UI_SERVICE, NOTIFY, UI_TOOL, UI_CODE } from '…/src/ui/index.js'
 *   createUiBackend({handover, logger}) → {service, provide(ctx), snapshot(), close()}
 *
 * The module is imported bound to one SDK (its `@deepseek-ai/*` imports resolve to that SDK's
 * installed packages), as every V3 connector suite does. If the surface changes, only this file
 * is adapted.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../../support/constants.mjs'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'
import { FakeHandover, recordingLogger } from './fakes.mjs'

/** The UI backend module bound to `sdk`, with every relayed export present. */
export async function uiModule(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (C-UI-BACKEND "Owns" packages/dsh-connector/src/ui/)`)
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  for (const name of SUBJECT.exports) assert.ok(mod[name] !== undefined, `src/ui/index.js exports no ${name}`)
  assert.equal(typeof mod[SUBJECT.factory], 'function', `${SUBJECT.factory} is not a function`)
  return mod
}

/** `createUiBackend(ports)` with its members checked. */
export function createBackend(mod, ports) {
  const backend = mod[SUBJECT.factory](ports)
  for (const m of SUBJECT.backendMembers) assert.ok(backend?.[m] !== undefined, `createUiBackend's result has no ${m}`)
  return backend
}

/** A backend over a fresh FakeHandover and logger; closed by `t`. */
export async function unitBackend(t, sdk) {
  const mod = await uiModule(sdk)
  const handover = new FakeHandover()
  const logger = recordingLogger()
  const backend = createBackend(mod, { handover, logger })
  t.after(() => backend.close())
  return { mod, handover, logger, backend }
}
