/** Bind the real store, routes and tools to an injected weak model and a trusted host observer. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { importBound } from 'fishball-test-helpers/bind'
import { importDsh } from 'fishball-test-helpers/dsh'
import { DSH, REVISION, SUBJECT } from './constants.mjs'
import { worldFor } from './world.mjs'

export const AUTO_SDK = '0.2.2-rc.3'
export const MODELS = Object.freeze({
  first: Object.freeze({ provider: 'fixture-provider-a', model: 'fixture-small' }),
  second: Object.freeze({ provider: 'fixture-provider-b', model: 'fixture-small' }),
})
const SOURCE = Object.freeze({ targetId: 'fixture-target-a', endpointEpoch: 1, assignmentId: 'fixture-assignment', sessionId: 'fixture-worker' })
const INITIAL_TIME_MS = Date.UTC(2026, 0, 1)
const TASKBOARD_SRC = path.join(path.dirname(SUBJECT.entry), 'src')

export function observation(text, { sequence = REVISION.step, eventId = 'fixture-event-' + sequence, source = SOURCE, reason = 'completed', truncated = false, purpose = 'work', proven = true } = {}) {
  const { targetId, endpointEpoch, assignmentId, sessionId } = source
  return {
    eventId,
    source: { targetId, endpointEpoch },
    payload: {
      sessionId,
      assignment: { id: assignmentId, purpose },
      ...(proven ? { turnFinal: { version: 1, turnId: 'fixture-turn-' + sequence, sequence, reason, message: { text, truncated } } } : {}),
    },
  }
}

/** SDK-bound production exports are composed as in the row; only host observer/model are fake. */
export async function autoWorld(t) {
  const calls = []
  let observe
  let current = () => true
  let nowMs = INITIAL_TIME_MS
  let infer = () => ({ proposals: [] })
  let has = (model) => Object.values(MODELS).some((known) => known.provider === model.provider && known.model === model.model)
  const now = () => nowMs
  let instance
  const modelPort = {
    has: (model) => has(model),
    async prepare(model, tasks, text, signal) {
      return async () => {
        calls.push({ model, tasks: structuredClone(tasks), text, signal })
        return infer()
      }
    },
  }
  const world = await worldFor(t, {
    moduleFor: composeRow,
    configureHost(_ctx, host) {
      instance = host
      host.events = {
        observeTurnFinished(fn) {
          observe = fn
          return () => { if (observe === fn) observe = undefined }
        },
        isCurrentWorkTurn: (event) => current(event),
      }
    },
  })

  async function composeRow() {
    const load = (file) => importBound(path.join(TASKBOARD_SRC, file))
    const [{ defineDomain }, { openStore }, { createAutoUpdate }, { registerRoutes }, { createTools }] = await Promise.all([
      importDsh(DSH.storageDomain), load('store.js'), load('auto-update.js'), load('routes.js'), load('tools.js'),
    ])
    return {
      name: SUBJECT.name,
      inject: SUBJECT.inject,
      async apply(ctx) {
        const store = await openStore(ctx, { defineDomain })
        ctx.effect(() => () => store.close())
        const auto = createAutoUpdate({ store, now, modelPort })
        ctx.effect(() => registerRoutes(ctx, store, now, auto))
        ctx.effect(() => auto.bind(instance))
        const sessionId = () => instance.manager.sessionId()
        ctx.effect(() => instance.manager.registerSetup(SUBJECT.name, (scope) => {
          for (const tool of createTools({ store, sessionId, now })) scope.tools.register(tool)
        }))
      },
    }
  }
  return Object.assign(world, {
    calls,
    advance: (ms) => { nowMs += ms },
    setCurrent: (fn) => { current = fn },
    setModels: (fn) => { has = fn },
    setInference: (fn) => { infer = fn },
    turn(event) {
      assert.equal(typeof observe, 'function', 'registered a passive turn observer')
      return observe(event)
    },
  })
}

export function otherTarget(event) {
  const source = { ...event.source, targetId: 'fixture-target-b' }
  return { ...event, source }
}
