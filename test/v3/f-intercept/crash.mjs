/**
 * The S2 crash windows (EVT-DT-03, EVT-DT-04 rules 7–8, EVT-ST-02 rows 5e, 5f, 8, 11a, EVT-UC-02 E1b,
 * E2, E2a). A crash is a real SIGKILL of a fresh Node process that holds one Fishball DSH, then a
 * second process reopens the same root, as spike V3-S2 did: one process cannot reopen a DSH session
 * it still owns (the JSONL write lock), and a crash must leave only what was made durable.
 *
 * Run as a script: `node crash.mjs <sdk> <root> <scenario> <phase>`; phase `cut` publishes the event
 * and dies at the scenario's cut point; phase `recover` reopens, settles and prints one JSON report.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { EVENT_TYPE, FIXTURE, TOOL, WAIT } from './constants.mjs'
import { contributedType, makeEvent, openWorld, readLines } from './world.mjs'

const PHASE = Object.freeze({ cut: 'cut', recover: 'recover' })

/** One event per scenario; its marker is fixed so both phases see the same identity. */
const EVENT_NUMBER = 1
const interceptedType = contributedType()

/**
 * Scenarios by the case rows they serve. `type` picks the route (a contributed type has a
 * registration; a message has none). `cut` names where phase 1 dies. `pluginAtRestart` says whether
 * the interceptor's plugin is up when the Fishball DSH comes back.
 */
export const SCENARIO = Object.freeze({
  fishballBeforeAcceptance: { type: EVENT_TYPE.message, cut: 'poll' },
  fishballBeforeAck: { type: EVENT_TYPE.message, cut: 'ack' },
  fishballMidTurn: { type: EVENT_TYPE.message, cut: 'model' },
  interceptorBeforeAck: { type: interceptedType, cut: 'ack', pluginAtRestart: true },
  interceptorOpenUp: { type: interceptedType, cut: 'afterAccept', pluginAtRestart: true },
  interceptorOpenOff: { type: interceptedType, cut: 'afterAccept', pluginAtRestart: false },
})

async function die(world) {
  await world.ctx.sessions.flush(world.agent.session)
  process.kill(process.pid, 'SIGKILL')
  await new Promise(() => {})
}

/**
 * The scripted interceptor: accepts first, then makes its effect once per `eventId` (its own durable
 * witness file is its dedupe store), as R-INT-04 requires of an interceptor.
 */
function interceptor(world, scenario, phase) {
  return {
    pluginId: FIXTURE.pluginX,
    registrations: [{ types: [interceptedType] }],
    handler: async (event, ctl) => {
      if (!(await ctl.accept())) return
      if (phase === PHASE.cut && scenario.cut === 'afterAccept') await die(world())
      const witness = world().file('interceptor')
      if (readLines(witness).some((w) => w.eventId === event.eventId)) return
      fs.appendFileSync(witness, JSON.stringify({ pid: process.pid, eventId: event.eventId }) + '\n')
    },
  }
}

async function child(sdk, root, name, phase) {
  const scenario = SCENARIO[name]
  const event = makeEvent(scenario.type, EVENT_NUMBER)
  let world
  const cutAt = (point) => phase === PHASE.cut && scenario.cut === point
  const linkHooks = {
    // Dies inside the first poll that would return the event: core has not seen it yet.
    [TOOL.inboxPoll]: async (_args, link) => { if (cutAt('poll') && link.state().events.length > 0) await die(world) },
    [TOOL.inboxAck]: async () => { if (cutAt('ack')) await die(world) },
  }
  const onRequest = async (texts) => { if (cutAt('model') && texts.includes(event.marker)) await die(world) }
  const plugUp = phase === PHASE.cut || scenario.pluginAtRestart === true
  const intercepted = scenario.type === interceptedType
  const plugins = intercepted && plugUp ? [interceptor(() => world, scenario, phase)] : []
  world = await openWorld(sdk, root, { linkHooks, onRequest, plugins, onOpen: (w) => { world = w } })
  if (phase === PHASE.cut) {
    world.link.publish(event)
    await world.settle()
    // Reaching here means the cut point never came: report it so the case fails with a reason.
    process.stdout.write(JSON.stringify({ error: 'cut point not reached: ' + scenario.cut }) + '\n')
    process.exit(0)
  }
  await world.settle()
  const log = await world.sessionLog()
  const report = {
    admissions: (await world.admissions(event.marker)).length,
    acked: world.link.acked(event.eventId),
    interceptorEffects: readLines(world.file('interceptor')).filter((w) => w.eventId === event.eventId).length,
    offeredAgain: world.loaded[0]?.seen.filter((s) => s.event.eventId === event.eventId).length ?? 0,
    modelRequestsAfterRestart: world.modelRequestsWith(event.marker).length,
    // Any turn after the restart (a re-wake or a notice turn) would reach the model.
    requestsAfterRestart: world.requests.length,
    modelRequestsTotal: readLines(world.file('model')).filter((r) => r.texts.includes(event.marker)).length,
    interruptedTurns: log.filter((e) => e.type === 'turn/end' && e.data?.reason?.kind === 'interrupted').length,
  }
  await world.close()
  process.stdout.write(JSON.stringify(report) + '\n')
  process.exit(0)
}

/** Runs one scenario's two phases; returns the recover phase's report. */
export function runCrash(sdk, root, name) {
  const run = (phase) => spawnSync(process.execPath, [import.meta.filename, sdk, root, name, phase], { encoding: 'utf8', timeout: WAIT.childMs })
  const cut = run(PHASE.cut)
  const lastLine = (r) => (r.stdout ?? '').trim().split('\n').filter(Boolean).at(-1)
  if (cut.signal !== 'SIGKILL') return { error: `cut phase did not crash (${cut.status ?? cut.signal}): ${lastLine(cut) ?? ''} ${cut.stderr ?? ''}`.trim() }
  const recover = run(PHASE.recover)
  if (recover.status !== 0) return { error: `recover phase failed (${recover.status ?? recover.signal}): ${recover.stderr ?? ''}`.trim() }
  return JSON.parse(lastLine(recover))
}

if (process.argv[1] === import.meta.filename) {
  const [sdk, root, name, phase] = process.argv.slice(2)
  await child(sdk, root, name, phase)
}
