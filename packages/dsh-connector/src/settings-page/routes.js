/**
 * The settings page's owner-only Fetch routes (design §5.9 steps 2–4; R-TOK-11). `create` is the
 * only route that ever answers a token value: once, in a JSON body sent `Cache-Control: no-store`,
 * never in a URL, a log or an error. A refusal carries a code only.
 */
import { API_CODE, HTTP, HTTP_METHOD, RESPONSE_HEADERS } from '../constants.js'
import { CREATE_ERROR } from '../tokens/index.js'
import { LOG, SETTINGS_PAGE } from './constants.js'

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: RESPONSE_HEADERS.json })
const refused = (status, code) => json(status, { ok: false, code })
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The create body, a JSON object, or undefined when it is unreadable, over the bound or not one.
 * Its `label` is passed on as it came: the registry owns the label rule and rejects a bad one with
 * a TypeError, which the route answers as a bad body.
 */
async function bodyOf(request) {
  let text
  try { text = await request.text() } catch { return undefined }
  if (Buffer.byteLength(text) > SETTINGS_PAGE.maxBodyBytes) return undefined
  let body
  try { body = JSON.parse(text) } catch { return undefined }
  return isRecord(body) ? body : undefined
}

/**
 * @param {{tokens: {create: (label: string) => Promise<{entryKey: string, label: string, value: string}>, notice: () => object | undefined}, logger: object}} options
 * @returns {{path: string, methods: string[], fetch: (request: Request) => Promise<Response>}[]}
 */
export function routes({ tokens, logger }) {
  async function create(request) {
    const body = await bodyOf(request)
    if (body === undefined) return refused(HTTP.badRequest, API_CODE.badBody)
    let created
    // A failed write was logged by the registry with the label; the answer carries the code only.
    try { created = await tokens.create(body.label) } catch (error) {
      return error instanceof TypeError ? refused(HTTP.badRequest, API_CODE.badBody) : refused(HTTP.serverError, CREATE_ERROR.operationFailed)
    }
    logger.info(LOG.created, created.label)
    return json(HTTP.ok, { ok: true, entryKey: created.entryKey, label: created.label, value: created.value })
  }
  return [
    { path: SETTINGS_PAGE.route.create, methods: [HTTP_METHOD.post], fetch: create },
    { path: SETTINGS_PAGE.route.notice, methods: [HTTP_METHOD.get], fetch: async () => json(HTTP.ok, { ok: true, notice: tokens.notice() ?? null }) },
  ]
}
