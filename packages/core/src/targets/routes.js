/**
 * The target routes (task MULTI-1; MULTI-0 `SEAM_TARGETS.route`): core's owner-only exact Fetch
 * routes on DSH's authenticated channel, which fishball-ui's sidebar and core's own settings page
 * act through. They replace the single-target `/api/fishball/connect` and `/cancel` routes.
 * - GET `list`: 200 `TargetsSnapshot`, the same value as `ui.targets.list()`;
 * - POST `connect`: 200 K3a `ConnectBegin`, exactly its outcome's members. The request's `Origin`
 *   and `Host` pick the callback (link/web-callback.js), as the old route did;
 * - POST `cancel`, `retry`, `pairing`, `add`, `remove`, `url`: 200 `{ok: true[, targetId]}`,
 *   409 for a refusal, 400 for a body that is not a JSON object;
 * - a missing, unknown or removed `targetId`: 404 `{ok: false, code: 'unknown-target'}`;
 * - a throw: 503 `{code}` with no error detail (its message could name a credential detail),
 *   logged by its code only.
 */
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { MCP } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { TARGET_HTTP, TARGET_LOG } from './constants.js'

const ROUTE = SEAM_TARGETS.route
const FIELD = ROUTE.fields
const REFUSAL = SEAM_TARGETS.refusal

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: TARGET_HTTP.headers })
const statusOf = (result) => {
  if (result?.ok === true || result?.outcome !== undefined) return TARGET_HTTP.ok
  return result?.code === REFUSAL.unknownTarget ? TARGET_HTTP.notFound : TARGET_HTTP.conflict
}
/** Exactly the `ConnectBegin` members of a known outcome (connect.d.ts); a refusal passes as it is. */
const beginAnswer = (begin) => {
  const members = TARGET_HTTP.beginMembers[begin?.outcome]
  if (members === undefined) return begin?.ok === false ? { ok: false, code: begin.code } : undefined
  return { outcome: begin.outcome, ...Object.fromEntries(members.map((key) => [key, begin[key]])) }
}
const confirmed = (body) => ({ confirmed: body[FIELD.confirmed] === true })

/**
 * @param {object} ctx core's main row context (`connection.fetch`, `logger`)
 * @param {object} targets the collection (`createTargets`)
 * @param {{callbackFor?: (request: Request) => object | undefined}} [options] the press's callback choice
 * @returns {() => Promise<void>} withdraws every route
 */
export function registerTargetRoutes(ctx, targets, { callbackFor = () => undefined } = {}) {
  const logger = ctx.logger?.(TARGET_LOG.name)
  const { service } = targets
  /** POST action → its call with the parsed body; every one names a `targetId` except `add`. */
  const actions = Object.freeze({
    [ROUTE.connect]: (body, request) => targets.beginVia(body[ROUTE.targetIdField], callbackFor(request)).then(beginAnswer),
    [ROUTE.cancel]: (body) => service.cancel(body[ROUTE.targetIdField]),
    [ROUTE.retry]: (body) => service.retry(body[ROUTE.targetIdField]),
    [ROUTE.pairing]: (body) => service.choose(body[ROUTE.targetIdField], body[FIELD.choice], confirmed(body)),
    [ROUTE.add]: (body) => service.add(body[FIELD.url]),
    [ROUTE.remove]: (body) => service.remove(body[ROUTE.targetIdField], confirmed(body)),
    [ROUTE.url]: (body) => service.setUrl(body[ROUTE.targetIdField], body[FIELD.url], confirmed(body)),
  })

  const guarded = (act) => async (request) => {
    try { return await act(request) } catch (error) {
      logger?.warn(TARGET_LOG.failed, request.url, codeOf(error))
      return json(TARGET_HTTP.unavailable, { code: TARGET_HTTP.unavailableCode })
    }
  }
  const post = (path) => guarded(async (request) => {
    let body
    try { body = await request.json() } catch { body = undefined }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return json(TARGET_HTTP.badRequest, { ok: false, code: MCP.refusal.invalidArguments })
    const result = await actions[path](body, request)
    if (result === undefined) return json(TARGET_HTTP.unavailable, { code: TARGET_HTTP.unavailableCode })
    return json(statusOf(result), result)
  })

  const disposers = []
  const dispose = async () => { await Promise.all(disposers.splice(0).map((withdraw) => withdraw?.())) }
  try {
    disposers.push(ctx.connection.fetch.register({ path: ROUTE.list, methods: [ROUTE.read], requestBody: TARGET_HTTP.requestBody, fetch: guarded(async () => json(TARGET_HTTP.ok, service.list())) }))
    for (const path of Object.keys(actions)) {
      disposers.push(ctx.connection.fetch.register({ path, methods: [ROUTE.method], requestBody: TARGET_HTTP.requestBody, fetch: post(path) }))
    }
  } catch (error) {
    // A path another row claimed: withdraw what was registered, so no half-registered set remains.
    void dispose().catch(() => {})
    throw error
  }
  return dispose
}
