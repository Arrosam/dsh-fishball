/**
 * Host API on DSH's authenticated /api channel (DESIGN §10). DSH has already applied its
 * browser authentication and same-origin fence; bodies are validated here.
 *
 * GET  state                  -> current snapshot (JSON)
 * GET  events                 -> server-sent snapshots: one at once, then one per change
 * POST recovery               -> { action: 'retry' | 'adopt' }
 * POST plugins                -> { plugin: string, on: boolean } (your own choice, DESIGN §4)
 * POST plugins/remove         -> { plugin: string } (uninstall a plugin installed in Fishball only)
 * POST tool-approvals/remove  -> { toolKey: string } (withdraw an allowance, DESIGN §7)
 * POST context-window         -> { contextWindowTokens, maxOutputTokens } (DESIGN §6; each a
 *                                positive whole number, or null for unset)
 * POST send                   -> { sessionId: string, note: string } ("Send to Fishball", DESIGN §5b)
 * POST watches                -> { sessionId: string } ("Tell Fishball when finished", DESIGN §5c)
 * POST watches/remove         -> { watchId: string }
 * POST read                   -> {} (Fishball's chat is on screen: its unread replies are read)
 * POST brand                  -> { style: 'fishball' | 'deepseek' } (the sidebar brand icon, DESIGN §10)
 * GET  messenger/client.js    -> the Messenger look's browser file (DESIGN §10c)
 * GET  plugins/detail?plugin= -> one plugin's page data (DESIGN §10d); 404 unknown
 * GET  plugins/icon?plugin=   -> one plugin's icon image; 404 unknown when it has none
 * POST plugins/refresh        -> {} (read the plugin list again; the Fishball tab's Refresh)
 * POST install/inspect        -> { spec }: DSH's inspection of what it names (revision 10a)
 * POST install                -> { spec, requestId, approvedBuilds? }: install for Fishball, then turn it on
 * POST install/cancel         -> { requestId }: cancel that install
 * POST plugins/settings       -> { plugin, row, values?, reset? } (your settings, DESIGN §10d);
 *                                400 invalid with `path`; 409 unknown, shared-with-dsh, no-settings
 */
import { isSettingInput } from './context-window.js'
import { API, API_CODE, BRAND_STYLE, HTTP, HTTP_METHOD, PLUGIN_MANAGER, RECOVERY_ACTION, REQUEST_BODY_BUFFERED, RESPONSE_HEADERS } from './constants.js'
import { LifecycleStateError } from './errors.js'

const ACTIONS = new Set(Object.values(RECOVERY_ACTION))
const BRAND_STYLES = new Set(Object.values(BRAND_STYLE))
const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS.json })
/** A refused command: 409 unless the error names another status, with its extra fields (an invalid setting's path). */
const refusal = (error) => json(error.status ?? HTTP.conflict, { ok: false, code: error.code, ...error.fields })
const frame = (payload) => `data: ${JSON.stringify(payload)}\n\n`

const isRecord = (body) => body !== null && typeof body === 'object' && !Array.isArray(body)
const isName = (value) => typeof value === 'string' && value.length > 0
const isText = (value) => typeof value === 'string' && value.trim().length > 0
/** Settings reset paths: an array of paths, each an array of field names (`[]` is the whole row). */
const isPaths = (value) => Array.isArray(value) && value.every((path) => Array.isArray(path) && path.every(isName))

/** Body readers: the validated command, or undefined for anything malformed. */
const BODY = Object.freeze({
  recovery: (body) => (isRecord(body) && ACTIONS.has(body.action) ? body.action : undefined),
  plugin: (body) => (isRecord(body) && isName(body.plugin) && typeof body.on === 'boolean' ? { plugin: body.plugin, on: body.on } : undefined),
  pluginRemove: (body) => (isRecord(body) && isName(body.plugin) ? body.plugin : undefined),
  toolApproval: (body) => (isRecord(body) && isName(body.toolKey) ? body.toolKey : undefined),
  watch: (body) => (isRecord(body) && isName(body.sessionId) ? { sessionId: body.sessionId } : undefined),
  unwatch: (body) => (isRecord(body) && isName(body.watchId) ? { watchId: body.watchId } : undefined),
  brand: (body) => (isRecord(body) && BRAND_STYLES.has(body.style) ? body.style : undefined),
  read: (body) => (isRecord(body) ? {} : undefined),
  send: (body) => (isRecord(body) && isName(body.sessionId) && typeof body.note === 'string' ? { sessionId: body.sessionId, note: body.note } : undefined),
  installSpec: (body) => (isRecord(body) && isText(body.spec) ? body.spec.trim() : undefined),
  install: (body) => (isRecord(body) && isText(body.spec) && isName(body.requestId)
    && (body.approvedBuilds === undefined || (Array.isArray(body.approvedBuilds) && body.approvedBuilds.every(isName)))
    ? { spec: body.spec.trim(), requestId: body.requestId, approvedBuilds: body.approvedBuilds }
    : undefined),
  installCancel: (body) => (isRecord(body) && isName(body.requestId) ? body.requestId : undefined),
  settings: (body) => (isRecord(body) && isName(body.plugin) && isName(body.row)
    && (body.values === undefined || isRecord(body.values)) && (body.reset === undefined || isPaths(body.reset))
    && (body.values !== undefined || body.reset !== undefined)
    ? { plugin: body.plugin, row: body.row, values: body.values, reset: body.reset }
    : undefined),
  contextWindow: (body) => (isRecord(body) && isSettingInput(body.contextWindowTokens) && isSettingInput(body.maxOutputTokens)
    ? { contextWindowTokens: body.contextWindowTokens, maxOutputTokens: body.maxOutputTokens }
    : undefined),
})

/**
 * Register the routes; they are removed with the plugin context.
 * @param ctx - fishball row context (needs connection).
 * @param state - { snapshot(), subscribe(fn), recover(action), setPlugin(plugin, on), removePlugin(plugin),
 *   removeAllowance(toolKey), setContextWindow(setting), send({ sessionId, note }),
 *   addWatch({ sessionId }), removeWatch({ watchId }), markRead(), setBrandStyle(style), messengerScript(),
 *   pluginDetail(plugin), pluginIcon(plugin), saveSettings({ plugin, row, values, reset }), inspectInstall(spec),
 *   install({ spec, requestId, approvedBuilds }), cancelInstall(requestId), refreshPlugins() }; the commands reject
 *   LifecycleStateError for a refusal (409 unless it names another status); messengerScript resolves the
 *   file's bytes; pluginIcon resolves the icon's data URL.
 */
export function registerRoutes(ctx, state) {
  const streams = new Set()
  ctx.effect(() => () => { for (const close of [...streams]) close() }, 'fishball: event streams')

  const events = (request) => {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        // A stream the browser closed between abort and cleanup throws on enqueue; close it
        // here so one dead stream never surfaces as a listener failure.
        const push = (snapshot) => {
          try { controller.enqueue(encoder.encode(frame(snapshot))) } catch { close() }
        }
        const unsubscribe = state.subscribe(push)
        close = () => {
          if (!streams.delete(close)) return
          unsubscribe()
          request.signal.removeEventListener('abort', close)
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        streams.add(close)
        request.signal.addEventListener('abort', close)
        push(state.snapshot())
      },
      cancel: () => close(),
    })
    return Promise.resolve(new Response(body, { status: HTTP.ok, headers: RESPONSE_HEADERS.eventStream }))
  }

  /**
   * One POST: parse and validate the body, run it, and answer. A LifecycleStateError answers its
   * refusal (409 unless it names another status); anything else 500 `failed`.
   * @param answer - (value) => the answer's fields beside `ok: true`.
   */
  const post = (read, run, answer) => async (request) => {
    let body
    try { body = await request.json() } catch { return json(HTTP.badRequest, { ok: false, code: API_CODE.badBody }) }
    const input = read(body)
    if (input === undefined) return json(HTTP.badRequest, { ok: false, code: API_CODE.badBody })
    try {
      return json(HTTP.ok, { ok: true, ...answer(await run(input)) })
    } catch (error) {
      if (error instanceof LifecycleStateError) return refusal(error)
      return json(HTTP.serverError, { ok: false, code: API_CODE.failed })
    }
  }
  /** A command: its answer is the new state. */
  const command = (read, run) => post(read, run, () => ({ state: state.snapshot() }))
  /** A call: its answer is the result it returns. */
  const call = (read, run) => post(read, run, (result) => result)

  /**
   * One GET for a named plugin (`?plugin=`): 400 bad-body without it; a LifecycleStateError
   * answers its status (404 for an unknown plugin); anything else 500 `failed`.
   * @param run - (plugin) => Promise<Response>.
   */
  const forPlugin = (run) => async (request) => {
    const plugin = new URL(request.url).searchParams.get(PLUGIN_MANAGER.pluginParam)
    if (!isName(plugin)) return json(HTTP.badRequest, { ok: false, code: API_CODE.badBody })
    try { return await run(plugin) } catch (error) {
      if (error instanceof LifecycleStateError) return refusal(error)
      return json(HTTP.serverError, { ok: false, code: API_CODE.failed })
    }
  }

  /** The plugin's icon: DSH's metadata gives a base64 data URL; anything else is not served. */
  const icon = async (plugin) => {
    const match = PLUGIN_MANAGER.dataUrl.exec(await state.pluginIcon(plugin))
    if (match === null) return json(HTTP.notFound, { ok: false, code: API_CODE.unknown })
    return new Response(Buffer.from(match[2], 'base64'), { status: HTTP.ok, headers: { ...RESPONSE_HEADERS.image, 'content-type': match[1] } })
  }

  /** The Messenger look's browser file; a read failure answers 500 `failed`. */
  const messengerScript = async () => {
    try { return new Response(await state.messengerScript(), { status: HTTP.ok, headers: RESPONSE_HEADERS.javascript }) } catch {
      return json(HTTP.serverError, { ok: false, code: API_CODE.failed })
    }
  }

  const routes = [
    { path: API.state, methods: [HTTP_METHOD.get], fetch: () => Promise.resolve(json(HTTP.ok, state.snapshot())) },
    { path: API.events, methods: [HTTP_METHOD.get], fetch: events },
    { path: API.recovery, methods: [HTTP_METHOD.post], fetch: command(BODY.recovery, (action) => state.recover(action)) },
    { path: API.plugins, methods: [HTTP_METHOD.post], fetch: command(BODY.plugin, ({ plugin, on }) => state.setPlugin(plugin, on)) },
    { path: API.pluginsRemove, methods: [HTTP_METHOD.post], fetch: command(BODY.pluginRemove, (plugin) => state.removePlugin(plugin)) },
    { path: API.toolApprovals, methods: [HTTP_METHOD.post], fetch: command(BODY.toolApproval, (toolKey) => state.removeAllowance(toolKey)) },
    { path: API.contextWindow, methods: [HTTP_METHOD.post], fetch: command(BODY.contextWindow, (setting) => state.setContextWindow(setting)) },
    { path: API.send, methods: [HTTP_METHOD.post], fetch: command(BODY.send, (input) => state.send(input)) },
    { path: API.watches, methods: [HTTP_METHOD.post], fetch: command(BODY.watch, (input) => state.addWatch(input)) },
    { path: API.brand, methods: [HTTP_METHOD.post], fetch: command(BODY.brand, (style) => state.setBrandStyle(style)) },
    { path: API.watchesRemove, methods: [HTTP_METHOD.post], fetch: command(BODY.unwatch, (input) => state.removeWatch(input)) },
    { path: API.read, methods: [HTTP_METHOD.post], fetch: command(BODY.read, () => state.markRead()) },
    { path: API.messengerClient, methods: [HTTP_METHOD.get], fetch: messengerScript },
    { path: API.pluginsDetail, methods: [HTTP_METHOD.get], fetch: forPlugin(async (plugin) => json(HTTP.ok, { ok: true, detail: await state.pluginDetail(plugin) })) },
    { path: API.pluginsIcon, methods: [HTTP_METHOD.get], fetch: forPlugin(icon) },
    { path: API.pluginsSettings, methods: [HTTP_METHOD.post], fetch: command(BODY.settings, (input) => state.saveSettings(input)) },
    { path: API.pluginsRefresh, methods: [HTTP_METHOD.post], fetch: command(BODY.read, () => state.refreshPlugins()) },
    { path: API.installInspect, methods: [HTTP_METHOD.post], fetch: call(BODY.installSpec, async (spec) => ({ inspection: await state.inspectInstall(spec) })) },
    { path: API.install, methods: [HTTP_METHOD.post], fetch: call(BODY.install, (input) => state.install(input)) },
    { path: API.installCancel, methods: [HTTP_METHOD.post], fetch: call(BODY.installCancel, async (requestId) => ({ outcome: await state.cancelInstall(requestId) })) },
  ]
  for (const route of routes) {
    ctx.effect(() => ctx.connection.fetch.register({ ...route, requestBody: REQUEST_BODY_BUFFERED }), `fishball: ${route.path}`)
  }
}
