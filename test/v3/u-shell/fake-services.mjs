/**
 * A host row standing in for the host-only services embed-UI follows (K3 freeze):
 * `fishballChild` (child.d.ts), `fishballConnectorHandover` (handover.d.ts) and
 * `fishballConnectorTools` (tools/index.d.ts). One module, one row per service (`config.service`),
 * so a scenario can leave a service out or insert its row switched off.
 *
 * The fakes keep only the contract's own rules that the cases lean on (a non-loopback hostname
 * rejects `hostname-refused`, a child that is not ready rejects `not-ready`, Retry restarts a
 * `failed` child), and they record every call a case observes into the JSON-lines file
 * `$FBU_RECORD`, which lives outside the DSH home. The `recorder` row also copies every DSH log
 * message there (cordis's own logger buffer and an exporter), so a case can count diagnostics at
 * any level.
 */
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { format } from 'node:util'
import { CHILD, FAKE, LOOPBACK, SERVICE } from './constants.mjs'

const record = (entry) => fs.appendFileSync(process.env[FAKE.recordEnv], JSON.stringify(entry) + '\n')
const hostServiceError = (code) => Object.assign(new Error(code), { code })

export const name = FAKE.name

function provideChild(ctx, config) {
  let status = { ...config.status }
  const listeners = new Set()
  let admissions = 0
  const notify = () => { for (const fn of [...listeners]) { try { fn() } catch { /* a throwing listener does not stop the others */ } } }
  const service = {
    apiVersion: config.apiVersion,
    status: () => ({ ...status }),
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    origin: (hostname) => (status.state === CHILD.ready && LOOPBACK.includes(hostname) ? `http://${hostname}:${CHILD.port}` : null),
    async admit(request) {
      const n = ++admissions
      const refused = !LOOPBACK.includes(request?.hostname) ? CHILD.refused.hostname : status.state !== CHILD.ready ? CHILD.refused.notReady : null
      const ticket = refused ? null : FAKE.ticketPrefix + n + '-' + randomBytes(FAKE.ticketBytes).toString('hex')
      record({ kind: FAKE.kind.admit, n, view: request?.view ?? null, lang: request?.lang ?? null, hostname: request?.hostname ?? null, refused, ticket })
      if (refused) throw hostServiceError(refused)
      return { url: `http://${request.hostname}:${CHILD.port}${FAKE.admitPath}?${FAKE.ticketParam}=${ticket}` }
    },
    async retry() {
      record({ kind: FAKE.kind.retry, from: status.state })
      if (status.state === CHILD.failed) { status = { state: CHILD.ready, code: null }; notify() }
    },
    targetStatus: () => ({ ...config.targetStatus }),
    providerSync: {
      status: () => ({ state: 'inactive' }),
      async check() { record({ kind: FAKE.kind.sync, member: 'check' }); return { ok: false, error: { code: FAKE.syncRefused } } },
      async add() { record({ kind: FAKE.kind.sync, member: 'add' }); return { ok: false, error: { code: FAKE.syncRefused } } },
    },
  }
  ctx.provide(SERVICE.child, service)
}

function provideHandover(ctx) {
  const listeners = new Set()
  ctx.provide(SERVICE.handover, {
    apiVersion: 1,
    managed: () => [],
    principals: () => [],
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    async handOver(sessionId, principalKey) { record({ kind: FAKE.kind.handover, member: 'handOver', sessionId, principalKey }); return { ok: false, code: 'unknown-session' } },
    async takeBack(sessionId) { record({ kind: FAKE.kind.handover, member: 'takeBack', sessionId }); return { ok: false, code: 'unknown-session' } },
  })
}

function provideTools(ctx) {
  let events = 0
  ctx.provide(SERVICE.tools, {
    apiVersion: 1,
    register(definition) {
      record({ kind: FAKE.kind.register, tool: definition?.name ?? null })
      return () => {}
    },
    async emit() { return { ok: true, eventId: FAKE.eventPrefix + ++events } },
    mine: () => [],
  })
}

function startRecorder(ctx) {
  const seen = new Set()
  const write = (message) => {
    if (seen.has(message.sn)) return
    seen.add(message.sn)
    let text
    try { text = format(...(message.args ?? [])) } catch { text = String(message.args) }
    record({ kind: FAKE.kind.log, sn: message.sn, name: message.name ?? null, type: message.type ?? null, text })
  }
  // Messages logged before this row started are in cordis's own buffer; later ones reach the exporter.
  for (const message of ctx.logger.buffer ?? []) write(message)
  ctx.logger.exporter({ levels: { default: FAKE.allLevels }, export: write })
  record({ kind: FAKE.kind.started })
}

const START = Object.freeze({ child: provideChild, handover: provideHandover, tools: provideTools, [FAKE.recorder]: startRecorder })

export function apply(ctx, config) {
  START[config.service](ctx, config)
}
