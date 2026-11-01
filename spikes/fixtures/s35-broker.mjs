/**
 * S35 fixture: a stand-in for revision 11's broker, reduced to what S35 asks.
 *
 * - `approval/request` listener (prepended, host level), as src/approvals.js registers today:
 *   - a managed session's request goes to a scripted "Fishball" decision (allow / reject+reason);
 *   - Fishball's own request becomes a card and is answered `rejected` AT ONCE, so the turn
 *     never waits; an identical later call is answered `allowed-once` by a one-time pass.
 * - `tools/post-execute` listener (host level): DSH's approval outcome carries no text
 *   (dsh-user-approval OUTCOMES is closed), so the broker remembers what it did per call id,
 *   and this listener rewrites the result the agent sees for exactly those call ids.
 * - optional prepended `tools/pre-execute` listener (variant B): turns another listener's `ask`
 *   for Fishball into a `deny` whose reason is the waiting text, without calling the service.
 * - Fishball's own body-asking tool (`s35_add_plugin`) and another plugin's tools: one gated by
 *   a pre-execute `ask` (stand-in for Auto review / permission hooks), one asking in its body
 *   (stand-in for sandbox escalation) and wording the outcome itself.
 */
import { createHash } from 'node:crypto'

export const S35 = Object.freeze({
  cardPrefix: 'card_',
  outcome: { allowed: 'allowed-once', rejected: 'rejected' },
  tools: { add: 's35_add_plugin', gated: 's35_other_gated', bodyAsk: 's35_other_body_ask' },
  // Agent-visible wording proposed for the build (requirements items 12, 21-22).
  text: {
    hint: 'Next time, call ask_fishball before a call that needs approval, and explain why it is needed.',
    allowed: 'Fishball approved this call once.',
    rejected: (reason) => `Fishball rejected this call: ${reason}`,
    waiting: (card) => `Waiting for your approval (card ${card}). The call did not run. You will be told when the user answers; if they allow it, make the identical call again.`,
    approvedWake: (card, tool) => `[approval] The user allowed card ${card}. Run ${tool} again with the identical arguments.`,
  },
})

/** Canonical JSON (sorted keys) so a retry with the same arguments in another key order matches. */
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  return JSON.stringify(value)
}
const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)

/** The model-requested arguments of one call id (as src/approvals.js argumentsOf, spike S11). */
export function argumentsOf(session, callId, toolName) {
  const events = session.snapshotEvents()
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    let call
    if (e.type === 'assistant/message') {
      const b = e.data?.message?.content?.find((x) => x.type === 'tool-call' && x.id === callId)
      if (b) call = { name: b.name, raw: b.arguments }
    } else if (e.type === 'tool/ptc-dispatch-start' && e.data?.subCallId === callId) call = { name: e.data.name, raw: e.data.arguments }
    if (!call) continue
    if (call.name !== toolName) return undefined
    try { return typeof call.raw === 'string' ? JSON.parse(call.raw) : call.raw } catch { return undefined }
  }
  return undefined
}

/**
 * Mount the broker stand-in on a host row context.
 * @param c - context with ['approval', 'tools'].
 * @param opts.fishballId - () => the Fishball stand-in's session id.
 * @param opts.decideManaged - (req, args) => ({decision:'allow'|'reject', reason}) Fishball's scripted answer.
 * @param opts.variantB - () => boolean: use the pre-execute deny path for Fishball instead of service + post-execute.
 */
export function mountS35Broker(c, { fishballId, decideManaged, variantB = () => false }) {
  const marks = new Map() // callId -> { kind: 'managed-allow'|'managed-reject'|'card', ... }
  const cards = new Map() // cardId -> { sessionId, tool, key, state }
  const passes = new Map() // key -> cardId (one-time)
  const seenRaw = [] // DSH's own result text, before the post-execute rewrite (evidence)
  let nextCard = 1
  const keyOf = (sessionId, tool, args) => `${sessionId}|${tool}|${digest(canonical(args ?? null))}`

  /** File a card for Fishball's own request, or consume a matching pass. */
  const fishballAsks = (agent, tool, callId, args) => {
    const key = keyOf(agent.id, tool, args)
    if (passes.has(key)) {
      const card = passes.get(key); passes.delete(key)
      cards.get(card).state = 'used'
      marks.set(callId, { kind: 'pass', card })
      return S35.outcome.allowed
    }
    const card = S35.cardPrefix + nextCard++
    cards.set(card, { sessionId: agent.id, tool, key, args, state: 'pending', callId })
    marks.set(callId, { kind: 'card', card })
    return S35.outcome.rejected
  }

  c.on('approval/request', async (req, next) => {
    const agent = req.agent
    if (!agent) return next()
    const args = argumentsOf(agent.session, req.callId, req.toolName)
    if (agent.id === fishballId()) return fishballAsks(agent, req.toolName, req.callId, args)
    const answer = await decideManaged(req, args)
    if (answer.decision === 'allow') { marks.set(req.callId, { kind: 'managed-allow' }); return S35.outcome.allowed }
    marks.set(req.callId, { kind: 'managed-reject', reason: answer.reason })
    return S35.outcome.rejected
  }, { prepend: true })

  // Variant B: run the later pre-execute listeners first, and turn their `ask` for Fishball into a deny.
  c.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    if (!variantB() || decision.kind !== 'ask' || exec.agent?.id !== fishballId()) return decision
    const outcome = fishballAsks(exec.agent, exec.name, exec.callId, exec.arguments)
    if (outcome === S35.outcome.allowed) return { kind: 'allow' }
    marks.delete(exec.callId) // the deny reason already carries the wording; nothing to rewrite
    const card = [...cards.entries()].at(-1)[0]
    return { kind: 'deny', reason: S35.text.waiting(card), info: { code: 'fishball-waiting', card } }
  }, { prepend: true })

  c.on('tools/post-execute', async (exec, result, next) => {
    const mark = marks.get(exec.callId)
    if (!mark) return next()
    marks.delete(exec.callId)
    const raw = result.content.map((b) => b.text ?? '').join('')
    seenRaw.push({ callId: exec.callId, tool: exec.name, mark: mark.kind, isError: result.isError, raw })
    const text = (t) => [{ type: 'text', text: t }]
    if (mark.kind === 'managed-allow') return { kind: 'accept', content: [...result.content, ...text('\n\n' + S35.text.allowed + ' ' + S35.text.hint)] }
    if (mark.kind === 'managed-reject') return { kind: 'block', feedback: text(S35.text.rejected(mark.reason) + '\n' + S35.text.hint) }
    if (mark.kind === 'card') return { kind: 'block', feedback: text(S35.text.waiting(mark.card)) }
    return next() // a pass: the call ran; leave its result alone
  })

  return {
    marks, cards, passes, seenRaw,
    /** The card a call filed (for a tool body that words its own outcome). */
    cardFor: (callId) => (marks.get(callId)?.kind === 'card' ? marks.get(callId).card : undefined),
    /** The user's Allow on a card: a one-time pass for the identical call. */
    allow(card) { const k = cards.get(card); k.state = 'allowed'; passes.set(k.key, card); return k },
  }
}

/** Fishball's own tool whose body asks (as add_plugin does), and another plugin's two tools. */
export function registerS35Tools(c, broker) {
  const params = { type: 'object', properties: { spec: { type: 'string' }, flag: { type: 'boolean' } }, required: ['spec'] }
  const output = { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] }
  c.tools.register({
    name: S35.tools.add, description: 'stand-in for add_plugin: asks in its body', parameters: params, output,
    async execute(args, exec) {
      const outcome = await c.approval.request({ agent: exec.agent, toolName: S35.tools.add, callId: exec.callId, reason: 'install ' + args.spec, signal: exec.signal })
      if (outcome === S35.outcome.allowed) return `installed ${args.spec}`
      // The body words its own result: a filed card is "waiting", anything else is a refusal.
      const card = broker.cardFor(exec.callId)
      if (card) { broker.marks.delete(exec.callId); return S35.text.waiting(card) }
      return `not installed (${outcome})`
    },
  })
  c.tools.register({ name: S35.tools.gated, description: 'another plugin tool, gated by a pre-execute ask', parameters: params, output, async execute(args) { return `gated ran with ${args.spec}` } })
  c.tools.register({
    name: S35.tools.bodyAsk, description: 'another plugin tool that asks in its body and words the outcome itself', parameters: params, output,
    async execute(args, exec) {
      const outcome = await c.approval.request({ agent: exec.agent, toolName: S35.tools.bodyAsk, callId: exec.callId, reason: 'escalate', signal: exec.signal })
      return outcome === S35.outcome.allowed ? `body-ask ran with ${args.spec}` : `other plugin: approval ${outcome}`
    },
  })
  // Stand-in for DSH's gate on another plugin's tool (Auto review denial, a permission hook).
  c.on('tools/pre-execute', (exec, next) => (exec.name === S35.tools.gated ? { kind: 'ask', reason: 'gated by policy' } : next()))
}
