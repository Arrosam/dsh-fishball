/**
 * The real credential client and receiver (src/native-runtime/credential.js) bound to one SDK, over
 * in-memory wires (fakes.mjs memoryWire) into one child store: what a start, a restart or a
 * reconnect of the link does, as the host areas' worlds need it.
 */
import { parseJson } from '@dsh-instance/test-helpers/json'
import { HOSTED_IMPORT, MODULE } from './constants.mjs'
import { memoryWire } from './fakes.mjs'
import { importInstance } from './instance.mjs'

/**
 * A link into `credentials`. `connect()` makes a new authenticated wire (the previous client and
 * receiver close) and returns it; `receiver: false` is a child that never answers; `timeoutMs` is
 * the client's request bound (both its probe and import bounds). `client`, `receiver` and `wire`
 * are the current ones, `wires` every wire so far, `imports()` the import frames the host sent,
 * parsed, and `close()` closes the current ends.
 */
export async function credentialLink(sdk, credentials, { receiver = true, timeoutMs }) {
  const { createCredentialClient, createCredentialReceiver } = await importInstance(sdk, MODULE.credential)
  const wires = []
  let client
  let answering
  const close = () => { client?.close(); answering?.close() }
  return {
    wires,
    close,
    get client() { return client },
    get receiver() { return answering },
    get wire() { return wires.at(-1) },
    connect() {
      close()
      const wire = memoryWire()
      answering = receiver ? createCredentialReceiver({ credentials }) : undefined
      answering?.attach(wire.child)
      client = createCredentialClient(wire.host, { timeoutMs, importTimeoutMs: timeoutMs })
      wires.push(wire)
      return wire
    },
    imports: () => wires.flatMap((wire) => wire.frames.toChild).map(parseJson).filter((frame) => frame?.op === HOSTED_IMPORT.ops.import),
  }
}
