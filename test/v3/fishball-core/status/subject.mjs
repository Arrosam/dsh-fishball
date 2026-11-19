/**
 * The one place that binds the F-STATUS cases to the modules under test. The surface was relayed
 * by the dev session (2026-11-16); this is the whole contract:
 *
 * packages/core/src/status/index.js
 *   STATUS_MODEL                          frozen spellings (constants.mjs MODEL restates them)
 *   createStatus(ctx, ports) → {snapshot(), onChange(fn) → dispose, close()}
 *     ctx    a Cordis context: ctx.get('appReady' | 'pluginManager' | 'loader'), ctx.on(event, fn),
 *            ctx.logger(name)
 *     ports  {link, target, connect?, guards?, bridge?, notify?} (fakes.mjs)
 *   statusOf(service) → service.snapshot(), or the frozen {fishball: 'fishball-off'}
 * packages/fishball-ui/src/status/index.js (moved unchanged from core's ui/status by F-UI)
 *   STATUS_TEXT {en, zh}; stripView(snapshot, lang = 'en') → {lines: [{kind, text}], control}
 *
 * Both are imported with the per-SDK resolve hook, so any `@deepseek-ai/*` import they make binds
 * to the SDK the test file names. Only exports are read, never the source.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE, REPO } from '../../../support/constants.mjs'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'

async function bound(sdk, file) {
  assert.ok(fs.existsSync(file), `${path.relative(REPO, file)} does not exist (F-STATUS "Owns")`)
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}

/** The core status module bound to `sdk`. */
export const statusModule = (sdk) => bound(sdk, SUBJECT.core)
/** The strip view module bound to `sdk`. */
export const stripModule = (sdk) => bound(sdk, SUBJECT.ui)

/** createStatus(ctx, ports), checked for the relayed shape. */
export async function openStatus(sdk, ctx, ports) {
  return makeStatus(await statusModule(sdk), ctx, ports)
}
/**
 * createStatus(ctx, ports) on an already loaded module, synchronously: a Cordis plugin's `apply`
 * calls it with its own (child) context, so the status's `ctx.effect` belongs to that fiber.
 */
export function makeStatus(mod, ctx, ports) {
  assert.equal(typeof mod[SUBJECT.factory], 'function', `status/index.js exports no ${SUBJECT.factory}()`)
  const status = mod[SUBJECT.factory](ctx, ports)
  for (const member of ['snapshot', 'onChange', 'close']) assert.equal(typeof status?.[member], 'function', `${SUBJECT.factory}() returned no ${member}()`)
  return status
}

/** statusOf(service). */
export async function statusOf(sdk, service) {
  const mod = await statusModule(sdk)
  assert.equal(typeof mod[SUBJECT.reader], 'function', `status/index.js exports no ${SUBJECT.reader}()`)
  return mod[SUBJECT.reader](service)
}

/** stripView(snapshot, lang?); `lang` undefined calls it with one argument (the default applies). */
export async function stripView(sdk, snapshot, lang) {
  const mod = await stripModule(sdk)
  assert.equal(typeof mod[SUBJECT.view], 'function', `fishball-ui src/status/index.js exports no ${SUBJECT.view}()`)
  return lang === undefined ? mod[SUBJECT.view](snapshot) : mod[SUBJECT.view](snapshot, lang)
}
