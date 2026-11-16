/** Public I-READY seams relayed by the implementer; no implementation source is inspected. */
import net from 'node:net'
import { once } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { requireModule } from '../../dsh-connector-shared/oauth-client/subject.mjs'

export const at = (relative) => path.join(V3.instance.dir, relative)
export const moduleOf = (sdk, file, exports) => requireModule(sdk, {
  task: 'I-READY', entry: at('src/native-runtime/' + file + '.js'), exports,
})
/** Real in-process TCP pair; no DSH process and no HTTP probe. */
export async function wirePair(t, sdk) {
  const { Wire } = await moduleOf(sdk, 'wire', ['Wire'])
  const { runtimeLimits } = await moduleOf(sdk, 'constants', ['runtimeLimits'])
  const server = net.createServer()
  t.after(() => server.close())
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const connected = once(server, 'connection')
  const client = net.connect(server.address().port, '127.0.0.1')
  const [socket] = await connected
  t.after(() => { client.destroy(); socket.destroy() })
  const sender = new Wire(client, runtimeLimits())
  const receiver = new Wire(socket, runtimeLimits())
  sender.authenticated = true
  receiver.authenticated = true
  return { sender, receiver }
}
export const constantsOf = (sdk) => moduleOf(sdk, 'constants', ['RUNTIME', 'loopbackOrigin'])
export const childOf = (sdk) => moduleOf(sdk, 'child', ['childReadiness', 'requireBaseServices'])
export const hostOf = (sdk) => moduleOf(sdk, 'index', ['readyHealth', 'createNativeRuntime'])

/** Only the package's own modules: generated dependencies and tests are not production code. */
export function sourceFiles(dir = V3.instance.dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['test', 'node_modules', 'bundled', '.git'].includes(entry.name)) return []
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:m?js|cjs)$/.test(entry.name) ? [file] : []
  })
}
