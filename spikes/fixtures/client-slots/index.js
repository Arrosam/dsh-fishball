/**
 * S37 fixture host half (revision 11 browser UI). It stands in for the parts of Fishball the
 * browser needs, with fixture data:
 * - a real `ask_fishball` tool whose call stays running (the session frozen inside it) until
 *   POST /api/s37/answer settles it, or the turn is stopped;
 * - a `user-questions/request` answerer that answers questions and plan reviews for sessions
 *   the spike marks, as Fishball would (S36 owns the real interception), and records the
 *   answer per tool call so the browser can tag the row;
 * - the managed set, toggled by POST /api/s37/manage (Hand over / Take back);
 * - GET /api/s37/events: server-sent snapshots, one at once, then one per change.
 * Shared state lives on globalThis.__s37 so the spike server (same process) can seed it.
 */
export const name = 'fishball-spike-client-slots'
export const inject = ['tools', 'connection']

const API = Object.freeze({ events: '/api/s37/events', answer: '/api/s37/answer', manage: '/api/s37/manage' })
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const SSE_HEADERS = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })

export function apply(ctx) {
  const s37 = (globalThis.__s37 ??= { assistantId: null, managed: new Set(), cards: new Map(), tags: {}, fishballAnswers: new Set(), titles: {}, listeners: new Set(), log: [] })
  const snapshot = () => ({
    assistantId: s37.assistantId,
    managed: [...s37.managed],
    titles: s37.titles,
    cards: [...s37.cards.values()].map(({ settle, ...card }) => card),
    tags: s37.tags,
  })
  const changed = () => { for (const push of s37.listeners) push(snapshot()) }
  s37.changed = changed

  ctx.tools.register({
    name: 'ask_fishball',
    description: 'Ask Fishball to approve one call before making it (S37 fixture).',
    parameters: {
      type: 'object',
      properties: { tool: { type: 'string' }, arguments: { type: 'object' }, quote: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } },
      required: ['tool', 'arguments', 'why'],
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
    async execute(args, exec) {
      const sessionId = exec.agent?.session?.id ?? exec.agent?.sessionId ?? exec.sessionId
      s37.log.push({ execKeys: Object.keys(exec), agentKeys: exec.agent ? Object.keys(exec.agent) : null, sessionId, callId: exec.callId })
      const id = exec.callId
      const seed = s37.seedFor?.(sessionId) ?? {}
      return await new Promise((resolve) => {
        const finish = (text) => { s37.cards.delete(id); changed(); resolve(text) }
        s37.cards.set(id, {
          id, kind: 'permission', sessionId, callId: exec.callId, tool: args.tool, arguments: args.arguments,
          why: args.why, quotes: seed.quotes ?? [], thread: seed.thread ?? [], note: seed.note ?? null,
          settle: finish,
        })
        // Item 16: a session's card leaves when its turn is stopped.
        exec.signal?.addEventListener('abort', () => finish('stopped'), { once: true })
        changed()
      })
    },
  })

  // Fishball answering questions and plan reviews (fixture: first option, or the approve label).
  ctx.on('user-questions/request', (request, next) => {
    const sessionId = request.agent?.session?.id ?? request.agent?.sessionId
    s37.log.push({ question: true, sessionId, wait: request.wait, intent: request.questions?.[0]?.intent })
    if (!s37.fishballAnswers.has(sessionId)) return next()
    const answers = request.questions.map((q) => ({ id: q.id, selected: [q.intent?.approve ?? q.options?.[0]?.label ?? ''] }))
    // A plan review names its call in the intent; an untimed question names none, so the
    // fixture falls back to the call the spike scripted (S36 settles how the build finds it).
    const callId = request.wait?.callId ?? request.questions?.[0]?.intent?.callId ?? s37.currentCall?.(sessionId)
    // The call's log position lets a turn-tail entry place the tag in its turn (S37: a turn knows
    // its start and end seq, not its call ids).
    const callEvent = request.agent?.session?.snapshotEvents?.().findLast((e) => e.type === 'tool/call' && e.data?.callId === callId)
    if (callId) s37.tags[callId] = { answer: answers.map((a) => a.selected.join(', ')).join('; '), sessionId, seq: callEvent?.seq ?? null, plan: request.questions?.[0]?.intent?.kind === 'plan-review' }
    changed()
    return Promise.resolve({ answers })
  }, { prepend: true })

  const events = (request) => {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        const push = (snap) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(snap)}\n\n`)) } catch { close() } }
        s37.listeners.add(push)
        close = () => { s37.listeners.delete(push); try { controller.close() } catch {} }
        request.signal.addEventListener('abort', close)
        push(snapshot())
      },
      cancel: () => close(),
    })
    return Promise.resolve(new Response(body, { status: 200, headers: SSE_HEADERS }))
  }
  const answer = async (request) => {
    const body = await request.json().catch(() => null)
    const card = body && s37.cards.get(body.id)
    if (!card || !['allow', 'reject'].includes(body.decision)) return json(409, { ok: false, code: 'unknown' })
    s37.log.push({ answered: body })
    card.settle(body.decision === 'allow' ? 'allowed once by the user' : `rejected by the user${body.note ? ': ' + body.note : ''}`)
    return json(200, { ok: true })
  }
  const manage = async (request) => {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.sessionId !== 'string' || typeof body.managed !== 'boolean') return json(400, { ok: false, code: 'bad-body' })
    if (body.managed) s37.managed.add(body.sessionId); else s37.managed.delete(body.sessionId)
    s37.log.push({ manage: body })
    changed()
    return json(200, { ok: true })
  }
  for (const route of [
    { path: API.events, methods: ['GET'], fetch: events },
    { path: API.answer, methods: ['POST'], fetch: answer },
    { path: API.manage, methods: ['POST'], fetch: manage },
  ]) ctx.effect(() => ctx.connection.fetch.register({ ...route, requestBody: 'buffered' }), `s37: ${route.path}`)
}
