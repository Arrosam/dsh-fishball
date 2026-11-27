/**
 * The adapter row as a loader row: the adapter suite's in-process DSH host (oauth-client/subject.mjs
 * openHost with the tool registry) plus the SDK's cordis-plugin-loader, and the plugin from
 * createAdapterPlugin({now, timers, fetch}) (the adapter suite's fake clock and recording fetch)
 * registered as a loader builtin, so a settings change is loader.update(id, {config}).
 */
import { importSdk } from 'dsh-connector-test-helpers/sdk'
import { cleanups, openHost, tempRoot } from '../oauth-client/subject.mjs'
import { adapterModule } from '../adapter/subject.mjs'
import { fakeClock, otherServer, recordingFetch } from '../adapter/fakes.mjs'
import { FIXTURE } from '../adapter/constants.mjs'
import { ADAPTER_ROW, SERVERS } from './constants.mjs'

const spin = () => new Promise((resolve) => setImmediate(resolve))
const settle = async () => { for (let i = 0; i < 60; i++) await spin() }

/** The config of a server list (names → fixture URLs) with the fixture CIMD. */
export const configOf = (names, extra = {}) => ({ clientMetadataUrl: FIXTURE.cimd, servers: names.map((serverName) => ({ serverName, url: SERVERS.url(serverName) })), ...extra })

export async function adapterRowWorld(t, sdk, config) {
  const scope = cleanups(t)
  const root = tempRoot(scope)
  const host = await openHost(sdk, root, { tools: true })
  scope.defer(() => host.close())
  const { Loader } = await importSdk(sdk, ADAPTER_ROW.loader)
  await host.ctx.plugin(Loader)
  const mod = await adapterModule(sdk)
  const clock = fakeClock()
  const recorder = recordingFetch(otherServer())
  let applies = 0
  const plugin = mod.createAdapterPlugin({ now: clock.now, timers: clock.timers, fetch: recorder.fetch })
  const counted = { ...plugin, apply: (...args) => { applies += 1; return plugin.apply(...args) } }
  host.ctx.loader.builtins[ADAPTER_ROW.name] = counted
  const id = await host.ctx.loader.create({ name: ADAPTER_ROW.builtinPrefix + ADAPTER_ROW.name, config })
  await host.ctx.loader.await().catch(() => {})
  await settle()
  const fiber = () => host.ctx.loader.resolve(id)?.fiber
  return {
    mod, host, recorder, fiber,
    applies: () => applies,
    active: () => fiber()?.state === ADAPTER_ROW.fiberActive,
    status: () => host.ctx.get(ADAPTER_ROW.service)?.status(),
    names: () => host.ctx.get(ADAPTER_ROW.service)?.status()?.servers.map((s) => s.serverName),
    signInTool: () => host.ctx.tools.get(ADAPTER_ROW.tool),
    async configure(next) {
      await host.ctx.loader.update(id, { config: next }).catch(() => {})
      await host.ctx.loader.await().catch(() => {})
      await settle()
    },
  }
}
