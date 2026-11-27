/**
 * The live-settings cases' world: one fixture row per mount, on the SDK's real cordis and
 * cordis-plugin-loader. The row's apply returns `runWithSettings(ctx, config, body)`; every run of
 * the body is recorded (its settings and scope), and registers one effect whose disposer is logged,
 * so "the old child was disposed before the new run" is the order of the log. `applies` counts the
 * row's own apply calls: a remount or a restart runs it again, a live re-run does not.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { ROW, SDK, SUBJECT, WAIT } from './constants.mjs'

export const caseTest = (sdk, id, row, title, fn) => test(caseName(sdk, id, row, title), { timeout: WAIT.testMs }, fn)

const sdkUrl = (sdk, ...parts) => pathToFileURL(path.join(SDK.versionsDir, sdk, ...parts)).href
const sdkPackage = (sdk, name) => import(sdkUrl(sdk, 'node_modules', name, 'lib', 'index.js'))

/** The module under test, with its exports required. */
export async function subject() {
  const mod = await import(SUBJECT.file === undefined ? SUBJECT.specifier : pathToFileURL(SUBJECT.file).href)
  for (const name of SUBJECT.exports) assert.equal(typeof mod[name], 'function', (SUBJECT.file ?? SUBJECT.specifier) + ' exports no ' + name + '()')
  return mod
}

/** The fixture row's Config, built with the SDK's schemastery. */
export async function schemaOf(sdk) {
  const Schema = (await import(sdkUrl(sdk, SDK.schemastery))).default
  return Schema.object({
    count: Schema.natural().min(ROW.min).max(ROW.max).volatile(),
    label: Schema.string().volatile(),
    mode: Schema.string().default(ROW.ordinaryDefault),
  })
}
export const plainConfig = (count) => ({ count })

const spin = () => new Promise((resolve) => setImmediate(resolve))
async function settle() {
  for (let i = 0; i < WAIT.settleRounds; i++) await spin()
  await new Promise((resolve) => setTimeout(resolve, WAIT.asyncBodyMs))
  for (let i = 0; i < WAIT.settleRounds; i++) await spin()
}

export async function liveWorld(t, sdk) {
  const [{ Context }, { Loader }, Config, live] = await Promise.all([sdkPackage(sdk, SDK.cordis), sdkPackage(sdk, SDK.loader), schemaOf(sdk), subject()])
  const ctx = new Context()
  // The Loader logs refused values and failed runs; the cases read outcomes, not lines.
  ctx.logger.exporter({ levels: { default: 0 }, export() {} })
  await ctx.plugin(Loader)
  const loader = ctx.loader
  t.after(() => ctx.fiber.dispose())
  let seq = 0
  const w = {
    settle,
    /**
     * Mounts one row with `config`. `body(scope, settings)` runs after the recording; `wait: false`
     * does not wait for the row to settle (a first run that hangs or fails).
     */
    async mount(config, { body, wait = true, name = ROW.name } = {}) {
      const row = { id: undefined, applies: 0, applyCtx: undefined, runs: [], log: [], results: [] }
      const module = {
        name: name + '-' + ++seq,
        Config,
        apply(rowCtx, resolved) {
          row.applies += 1
          row.applyCtx = rowCtx
          const result = live.runWithSettings(rowCtx, resolved, (scope, settings) => {
            row.runs.push({ scope, settings })
            row.log.push('run ' + settings.count)
            scope.effect(() => () => { row.log.push('dispose ' + settings.count) })
            return body?.(scope, settings)
          })
          row.results.push(result)
          Promise.resolve(result).catch(() => {})
          return result
        },
      }
      loader.builtins[module.name] = module
      const created = loader.create({ name: SDK.builtinPrefix + module.name, config })
      created.then((id) => { row.id = id }, () => {})
      if (wait) {
        row.id = await created
        await loader.await().catch(() => {})
      }
      await settle()
      assert.ok(row.applies >= 1, 'the row never applied')
      Object.defineProperty(row, 'result', { get: () => row.results[0] })
      row.fiber = () => loader.resolve(row.id)?.fiber
      row.active = () => row.fiber()?.state === SDK.fiberActive
      return row
    },
    /** loader.update(id, {config}): a volatile-only change, or an ordinary one. */
    async update(row, config) {
      await loader.update(row.id, { config }).catch(() => {})
      await loader.await().catch(() => {})
      await settle()
    },
    async disable(row) {
      await loader.update(row.id, { disabled: true }).catch(() => {})
      await loader.await().catch(() => {})
      await settle()
    },
  }
  return w
}
