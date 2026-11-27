/**
 * The one place that binds the F-STATUS cases to the module under test. The surface was relayed by
 * the dev session (2026-11-16); this is the whole contract:
 *
 * packages/core/src/status/index.js
 *   STATUS_MODEL                          frozen spellings (constants.mjs MODEL restates them)
 *   createStatus(ctx, ports) → {snapshot(), onChange(fn) → dispose, close()}
 *     ctx    a Cordis context: ctx.get('appReady' | 'pluginManager' | 'loader'),
 *            ctx.on(event, fn), ctx.logger(name)
 *     ports  {targets, brand?} (fakes.mjs)
 *   statusOf(service) → service.snapshot(), or the frozen {fishball: 'fishball-off'}
 *   stripLine(link, url, connect) → {line, control}: the per-target rule (targets.d.ts TargetView.line)
 *
 * fishball-ui's stripView (packages/core/ui/src/status) is fishball-ui's own and is not reached
 * from here. The module is imported with fishball-test-helpers/bind, so its `@deepseek-ai/*`
 * imports bind to the current DSH. Only exports are read, never the source.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { importBound } from 'fishball-test-helpers/bind'
import { SUBJECT } from './constants.mjs'

async function bound(file) {
  assert.ok(fs.existsSync(file), `${file} does not exist (F-STATUS "Owns")`)
  return importBound(file)
}

/** The core status module bound to the current DSH. */
export const statusModule = () => bound(SUBJECT.core)

/** createStatus(ctx, ports), checked for the relayed shape. */
export async function openStatus(ctx, ports) {
  return makeStatus(await statusModule(), ctx, ports)
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
export async function statusOf(service) {
  const mod = await statusModule()
  assert.equal(typeof mod[SUBJECT.reader], 'function', `status/index.js exports no ${SUBJECT.reader}()`)
  return mod[SUBJECT.reader](service)
}
