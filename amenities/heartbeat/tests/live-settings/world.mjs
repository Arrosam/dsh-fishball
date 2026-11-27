/**
 * The live-settings cases' world: one fixture row per mount, on the current DSH's real cordis and
 * cordis-plugin-loader (fishball-test-helpers/dsh importDsh). The row's apply returns `runWithSettings(ctx, config, body)`; every run of
 * the body is recorded (its settings and scope), and registers one effect whose disposer is logged,
 * so "the old child was disposed before the new run" is the order of the log. `applies` counts the
 * row's own apply calls: a remount or a restart runs it again, a live re-run does not.
 */
import assert from 'node:assert/strict'
import { importBound } from 'fishball-test-helpers/bind'
import { caseTest as namedCase } from 'fishball-test-helpers/cases'
import { importDsh } from 'fishball-test-helpers/dsh'
import { settle as settleRounds, sleep } from 'fishball-test-helpers/wait'
import { DSH, ROW, SUBJECT, WAIT } from './constants.mjs'

export const caseTest = (id, row, title, fn) => namedCase(id, row, title, { timeout: WAIT.testMs }, fn)

/** The module under test (bound to the current DSH), with its exports required. */
export async function subject() {
  const mod = await importBound(SUBJECT.file)
  for (const name of SUBJECT.exports) assert.equal(typeof mod[name], 'function', SUBJECT.file + ' exports no ' + name + '()')
  return mod
}

/** The fixture row's Config, built with the current DSH's schemastery. */
export async function schemaOf() {
  const Schema = (await importDsh(DSH.schemastery)).default
  return Schema.object({
    count: Schema.natural().min(ROW.min).max(ROW.max).volatile(),
    label: Schema.string().volatile(),
    mode: Schema.string().default(ROW.ordinaryDefault),
  })
}
export const plainConfig = (count) => ({ count })

/** Spins, then waits a little real time (no mocked timers here) so an async body's work finishes. */
async function settle() {
  await settleRounds(WAIT.settleRounds)
  await sleep(WAIT.asyncBodyMs)
  await settleRounds(WAIT.settleRounds)
}

export async function liveWorld(t) {
  const [{ Context }, { Loader }, Config, live] = await Promise.all([importDsh(DSH.cordis), importDsh(DSH.loader), schemaOf(), subject()])
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
      const created = loader.create({ name: DSH.builtinPrefix + module.name, config })
      created.then((id) => { row.id = id }, () => {})
      if (wait) {
        row.id = await created
        await loader.await().catch(() => {})
      }
      await settle()
      assert.ok(row.applies >= 1, 'the row never applied')
      Object.defineProperty(row, 'result', { get: () => row.results[0] })
      row.fiber = () => loader.resolve(row.id)?.fiber
      row.active = () => row.fiber()?.state === DSH.fiberActive
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
