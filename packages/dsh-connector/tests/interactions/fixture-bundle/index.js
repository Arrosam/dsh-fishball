/**
 * The interactions suite's fixture bundle (`fbix-tools`), installed by the worker BEFORE the
 * connector (extension.mjs `bundles`), as V2's fbtest-tools bundle was. It holds test stand-ins
 * only, never a connector part:
 * - the fixture tools: `bash`, `pwsh`, `terminal_send`, `terminal_open` and `fbtest_ask` ask DSH's
 *   approval service in their body under their own name (or `as`) and the call's id (or none with
 *   `nocall`, or one not in the log with `fakecall`), as DSH's sandbox escalation does;
 *   `fbtest_echo` asks nothing. Every call is recorded with its DSH outcome;
 * - the user's stock prompt: an `approval/request` listener. It is prepended here, at this row's
 *   apply, which runs before the connector's; the connector prepends at its own (later) apply, so
 *   the connector runs first and its `next()` reaches this stand-in ahead of DSH's own browser
 *   answerer (the dev session's diagnosis, 2026-11-17). It holds the prompt open until a case clicks
 *   (`releaseStock`) or the request's signal aborts (a closed prompt);
 * - the session's own question card: a `user-questions/request` listener, placed the same way, open
 *   until a case answers or discusses it, or its signal aborts (as DSH closes a card).
 * State lives on globalThis because DSH loads this module through another URL than the worker.
 */
import { IX } from '../constants.mjs'

export const name = IX.fixtureRow.name
export const inject = ['tools']

export const store = (globalThis.__fbixFixtures ??= { calls: [], registerErrors: [], stock: [], cards: [], stockMode: IX.stock.hold })

function fixture(ctx, toolName, asks) {
  return {
    name: toolName,
    description: IX.fixture.description(toolName),
    parameters: IX.fixture.parameters,
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
    async execute(args, exec) {
      const text = String(args.command ?? args.text ?? '')
      const entry = { name: toolName, sessionId: exec.agent?.id ?? null, callId: exec.callId ?? null, text, outcome: null, at: Date.now() }
      store.calls.push(entry)
      if (!asks) { entry.outcome = IX.outcome.notAsked; return IX.fixture.echoed(text) }
      const callId = args.nocall ? undefined : args.fakecall ? IX.fixture.nowhereCallId : exec.callId
      entry.outcome = await ctx.get(IX.dsh.approvalService).request({
        agent: exec.agent, toolName: args.as ?? toolName, ...(callId ? { callId } : {}), reason: IX.fixture.reason(text), signal: exec.signal,
      })
      entry.decidedAt = Date.now()
      return IX.fixture.outcomeText(entry.outcome)
    },
  }
}

/** The user's stock prompt: open until a case clicks or its signal aborts. */
function stockPrompt(req) {
  const entry = { sessionId: req.agent?.id ?? null, toolName: req.toolName, callId: req.callId ?? null, reason: req.reason ?? null, at: Date.now(), answered: null }
  Object.defineProperty(entry, 'signal', { value: req.signal, enumerable: false })
  store.stock.push(entry)
  if (store.stockMode === IX.stock.throws) throw new Error(IX.stock.throwMessage)
  return new Promise((resolve) => {
    Object.defineProperty(entry, 'resolve', { value: (outcome) => { entry.answered = outcome; resolve(outcome) }, enumerable: false })
  })
}

/** The session's own question card: open until a case answers or discusses it, or its signal aborts. */
function questionCard(req) {
  const card = {
    index: store.cards.length, sessionId: req.agent?.id ?? null, callId: req.wait?.callId ?? req.questions?.[0]?.intent?.callId ?? null,
    timed: req.wait?.timed === true, planReview: req.questions?.[0]?.intent?.kind === IX.planReviewKind,
    questions: JSON.parse(JSON.stringify(req.questions ?? [])), state: IX.card.open, closedCode: null,
  }
  store.cards.push(card)
  return new Promise((resolve, reject) => {
    Object.defineProperty(card, 'resolve', { value: resolve, enumerable: false })
    Object.defineProperty(card, 'reject', { value: reject, enumerable: false })
    const onAbort = () => {
      if (card.state !== IX.card.open) return
      card.state = IX.card.closed
      card.closedCode = req.signal?.reason?.code ?? IX.card.abortedCode
      reject(req.signal?.reason ?? Object.assign(new Error(IX.card.abortedCode), { name: IX.card.errorName, code: IX.card.abortedCode }))
    }
    if (req.signal?.aborted) onAbort()
    else req.signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = []
    for (const [toolName, asks] of IX.fixture.tools) {
      try { disposers.push(ctx.tools.register(fixture(ctx, toolName, asks))) } catch (e) { store.registerErrors.push({ name: toolName, error: String(e?.message ?? e) }) }
    }
    return () => { for (const dispose of disposers) dispose() }
  }, name)
  ctx.on(IX.dsh.approvalEvent, stockPrompt, { prepend: true })
  ctx.on(IX.dsh.questionEvent, questionCard, { prepend: true })
}
