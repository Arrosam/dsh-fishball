import { defineTool } from '@deepseek-ai/dsh-tools'
import { CONTROL, ControlError, controlLimits, fail } from './constants.js'
import { createControlClient } from './client.js'
import { exact, text } from './protocol.js'

export const name = 'fishball-native-control'
export const inject = ['nativeRuntime', 'tools']

const CHILD = Object.freeze({
  service: 'nativeFishballControl', disposed: 'dispose',
  metadataKeys: ['hostId', 'instanceId', 'connectionId'],
  requestKeys: ['hostId', 'sessionId', 'operation', 'payload'],
  hostDescription: 'Explicit main host ID shown by the attached runtime.',
  sessionDescription: 'Explicit existing managed session ID local to that host.',
  idDescription: 'Stable caller-owned message ID. Never replay uncertain work with a new ID.',
  offerDescription: 'Live connection-specific offerId from native_host_list_approvals; never reuse across reconnect.',
})
const STRING = Object.freeze({ type: 'string', required: true })
const TARGET = Object.freeze({
  host_id: { ...STRING, description: CHILD.hostDescription },
  session_id: { ...STRING, description: CHILD.sessionDescription },
})
const OUTPUT = Object.freeze({
  schema: { type: 'json' },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
})
const TOOLS = Object.freeze([
  {
    name: 'native_host_send_message', operation: CONTROL.operation.messageSend,
    description: 'Deliver text to an existing authorized managed host session, with exact host-side message dedupe. No start, execute, tool, file, or model dispatch. Never automatically retry unconfirmed delivery.',
    parameters: { message_id: { ...STRING, description: CHILD.idDescription }, text: { ...STRING, description: 'Text to deliver to the managed session.' } },
    payload: (args) => ({ messageId: args.message_id, text: args.text }),
  },
  {
    name: 'native_host_message_status', operation: CONTROL.operation.messageStatus,
    description: 'Reconcile a message ID on this host instance without redelivering it. Unknown after a host restart is not permission to replay.',
    parameters: { message_id: { ...STRING, description: CHILD.idDescription } },
    payload: (args) => ({ messageId: args.message_id }),
  },
  {
    name: 'native_host_session_status', operation: CONTROL.operation.sessionStatus,
    description: 'Read a fresh minimal status snapshot of one existing authorized managed host session.',
    parameters: {}, payload: () => ({}),
  },
  {
    name: 'native_host_list_approvals', operation: CONTROL.operation.approvalList,
    description: 'List live host-owned approval/question requests for one authorized managed session. Fresh offers are required after reconnect; answers are never reusable execution grants.',
    parameters: {}, payload: () => ({}),
  },
  {
    name: 'native_host_answer_approval', operation: CONTROL.operation.approvalAnswer,
    description: 'Answer one live host-owned request using its current offerId. Permission requests accept allow/reject; questions accept text or an exact offered choice. No grants and no answer replay.',
    parameters: {
      approval_id: { ...STRING, description: 'Live host-native pending request ID.' },
      offer_id: { ...STRING, description: CHILD.offerDescription },
      answer: { required: true, oneOf: [
        { type: 'object', additionalProperties: false, properties: { decision: { ...STRING, enum: [CONTROL.approval.allow, CONTROL.approval.reject] } } },
        { type: 'object', additionalProperties: false, properties: { text: STRING } },
      ] },
    },
    payload: (args) => ({ approvalId: args.approval_id, offerId: args.offer_id, answer: args.answer }),
  },
])

/** Native child plugin; starting this service never waits for a main-host connection. */
export function apply(ctx, config = {}) {
  const hostId = ctx.nativeRuntime.hostId
  text(hostId)
  const limits = controlLimits(config.limits)
  const client = createControlClient({ hostId, limits })
  const listeners = new Set()
  let current = null
  let disposed = false
  let state = Object.freeze({ ready: false, hostId, hostInstanceId: null, code: null })
  const setState = (ready, hostInstanceId = null, code = null) => { state = Object.freeze({ ready, hostId, hostInstanceId, code }) }
  const stopCurrent = () => {
    const previous = current
    current = null
    previous?.disposeClose?.()
    client.close()
    setState(false)
  }
  const disposeEvents = client.onEvent((envelope) => {
    for (const listener of listeners) { try { listener(envelope) } catch {} }
  })
  const service = Object.freeze({
    get status() { return state },
    async request(input) {
      exact(input, CHILD.requestKeys)
      if (input.hostId !== hostId) fail(CONTROL.error.host)
      if (!state.ready || disposed) fail(CONTROL.error.disconnected)
      return client.request(input.operation, input.sessionId, input.payload)
    },
    onEvent(listener) {
      if (typeof listener !== 'function') fail()
      if (listeners.size >= limits.maxWatches) fail(CONTROL.error.limit)
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  })
  ctx.provide(CHILD.service, service)
  const disposeTransport = ctx.nativeRuntime.onControlTransport((transport, metadata) => {
    if (disposed) { transport.close(); return }
    try {
      exact(metadata, CHILD.metadataKeys)
      for (const value of Object.values(metadata)) text(value)
      if (metadata.hostId !== hostId) fail(CONTROL.error.host)
      stopCurrent()
      const attachment = { disposeClose: null }
      current = attachment
      attachment.disposeClose = transport.onClose(() => {
        if (current === attachment) stopCurrent()
      })
      if (typeof attachment.disposeClose !== 'function') fail()
      if (current !== attachment) { attachment.disposeClose(); transport.close(); return }
      // No readiness promise is returned to appReady: main absence is ordinary detached state.
      void client.attach(transport).then((welcome) => {
        if (current === attachment && !disposed) setState(true, welcome.hostInstanceId)
      }).catch((error) => {
        if (current !== attachment) return
        stopCurrent()
        setState(false, null, error instanceof ControlError ? error.code : CONTROL.error.failed)
      })
    } catch (error) {
      stopCurrent()
      try { transport.close() } catch {}
      setState(false, null, error instanceof ControlError ? error.code : CONTROL.error.failed)
    }
  })
  const registrations = []
  const cleanup = () => {
    if (disposed) return
    disposed = true
    disposeTransport()
    stopCurrent()
    disposeEvents()
    listeners.clear()
    for (const dispose of registrations) dispose()
  }
  ctx.on(CHILD.disposed, cleanup)
  try {
    for (const specification of TOOLS) {
      const parameters = { ...TARGET, ...specification.parameters }
      const definition = defineTool({
        name: specification.name, description: specification.description, parameters, output: OUTPUT,
        execute: async (args, execution) => {
          try {
            // Native defineTool roots are open by default; our boundary is intentionally exact.
            exact(args, Object.keys(parameters))
            if (execution?.signal?.aborted) fail(CONTROL.error.disconnected)
            const result = await service.request({ hostId: args.host_id, sessionId: args.session_id,
              operation: specification.operation, payload: specification.payload(args) })
            return { ok: true, ...result }
          } catch (error) {
            return { ok: false, code: error instanceof ControlError ? error.code : CONTROL.error.failed }
          }
        },
      })
      definition.parameters = { ...definition.parameters, additionalProperties: false }
      registrations.push(ctx.tools.register(definition))
    }
  } catch (error) { cleanup(); throw error }
  return service
}
