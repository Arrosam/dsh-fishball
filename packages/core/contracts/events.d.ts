/**
 * `fishballInstance.events`: core's interception service (task K3; design §6.4; requirements
 * R-INT-01…09, 1.21; S2-Q1 and Q-S3-2 decided B; spikes V3-S2 `a499141`, V3-S3 `b4dca86`).
 * Types; the runtime values named here (default priority, `fenced`) are `constants.js`'s
 * `INTERCEPT` beside this file, and `disconnected` is K1's `LINK_REFUSAL`. F-INTERCEPT builds the
 * service in `packages/core/src/events/`.
 *
 * Core holds its pair's one `agent-events` subscription. Every polled event is recorded in
 * core's acceptance ledger and then dispatched with no LLM involved:
 * - the candidates are the live registrations whose `types` include the event's `type` and whose
 *   `filter` returns `true` (a throwing filter counts as `false` for that registration);
 * - no candidate: the event goes to the Fishball agent and may start one turn (R-INT-02);
 * - otherwise exactly one registration gets it: the highest `priority`, and among equal
 *   priorities the earliest registration (R-INT-03). The others never see it. If that one fails,
 *   the event falls back to Fishball, never to the next candidate (EVT-DT-02 rule 8).
 */

/**
 * An event as core hands it to an interceptor: every field of the mailbox entry (design §3.4,
 * plus `at`, epoch milliseconds of the commit). K1 freezes the entry; a K1 change to it changes
 * this type in the same amendment.
 * `type` is one of K1's event types (R-EVS-02) or `contributed:<namespace>.<event>` (K2). Two
 * deliveries of one event carry the same `eventId` (R-EVT-02); an interceptor dedupes by it.
 */
export interface InterceptedEvent {
  readonly eventId: string
  readonly mailboxGeneration: string
  readonly sequence: number
  readonly type: string
  readonly at: number
  readonly sourceSessionId: string | null
  readonly correlationId: string | null
  readonly offer?: { readonly offerId: string; readonly revision: number; readonly decisionKind: string }
  readonly payload: unknown
  readonly payloadDigest: string
}

/**
 * One registration (R-INT-01).
 * - `pluginId` names the registering plugin in core's ledger (`interceptor:<pluginId>`) and log.
 *   An open record found after a restart is offered again to the registration of this `pluginId`.
 * - `types` lists the event types wanted, at least one.
 * - `filter` is an optional **synchronous** predicate over the event; only a returned `true`
 *   matches. A throw is "no match" for this registration.
 * - `priority` is any finite number, negative included (default 0). Higher wins.
 *
 * Registering the same set of `types` with the same `priority` as a live registration is accepted,
 * and core logs one warning naming both plugins; the earlier registration keeps winning.
 */
export interface InterceptRegistration {
  readonly pluginId: string
  readonly types: readonly string[]
  readonly filter?: (event: InterceptedEvent) => boolean
  readonly priority?: number
}

/**
 * What `commit`'s `send` resolves to: the result of the answer call through core's link (K1's
 * tool result). `ok: false` with `code: 'disconnected'` (the link was down, design §6.3) means the
 * answer never reached the connector.
 */
export type CommitSendResult = { readonly ok: true; readonly [field: string]: unknown } | { readonly ok: false; readonly code: string }

/**
 * `commit`'s result: `send`'s own result, or `fenced` when this handler no longer holds the event
 * as accepted (it was released, it fell back to Fishball, or a commit already began).
 */
export type CommitResult = CommitSendResult | { readonly ok: false; readonly code: 'fenced' }

/** The controller a handler gets. It has exactly these three members. */
export interface InterceptControl {
  /**
   * Must be awaited before any effect. Makes core's acceptance record durable and open, and lets
   * core ack the event at the connector (R-INT-08). Resolves `true` when accepted; `false` when the
   * event is no longer this handler's (its registration was disposed, or it already fell back):
   * the handler then does nothing. An effect made before `accept` resolved `true` counts as not
   * accepted (R-INT-01).
   */
  accept(): Promise<boolean>

  /**
   * The fence around an answer sent through core's link (R-INT-04). Core moves the record from
   * accepted to committing, then calls `send` once. From then on the event stays with this
   * interceptor whatever happens to the handler, except that an answer that never reached the
   * connector (`send` rejects, or resolves `{ok: false, code: 'disconnected'}`) falls back to
   * Fishball once. So an answer is committed or fenced, never both (S3 WD-FAIL-RACE).
   * `commit` itself never rejects: a rejected `send` resolves `{ok: false, code: 'disconnected'}`.
   * PROPOSED: S3 falls back only for an answer that never reached the connector; a rejected `send`
   * is treated as one, as the S3 prototype did (its `send` threw only before the request left).
   */
  commit(send: () => Promise<CommitSendResult>): Promise<CommitResult>

  /**
   * Hands the event back to the Fishball agent, which is then woken for it once (R-INT-05,
   * R-WD-09). Allowed while the event is offered or accepted, before any `commit`. Resolves `true`
   * when the event went to Fishball, `false` when it was fenced (no longer this handler's, or a
   * commit began).
   */
  release(event: InterceptedEvent, options: { readonly toFishball: true }): Promise<boolean>
}

/**
 * The handler. Core keeps the record open until the returned promise settles (S2-Q1 B).
 * - Settles after `accept` and with no fallback: the record closes. Nothing about the event enters
 *   any agent's context; its acceptance, commit and outcome go only to the background log
 *   (R-INT-09).
 * - Throws, rejects, or its plugin is off, down or not ready, or the registration is disposed:
 *   an event offered but not accepted, or accepted with no `commit` begun, goes to Fishball once;
 *   one whose `commit` began stays with the interceptor (R-INT-04).
 * - After a restart of the Fishball DSH, an open record is offered again to the registration of
 *   the same `pluginId` (the handler dedupes by `eventId`); when that plugin is off or down, the
 *   event goes to Fishball once.
 */
export type InterceptHandler = (event: InterceptedEvent, ctl: InterceptControl) => Promise<void>

export interface FishballInstanceEvents {
  /**
   * Registers an interception and returns its disposer.
   * - `priority` is optional, default 0. Dispatch order: the highest `priority` first, then the
   *   earliest registration.
   * - Disposing is synchronous: from then on the registration matches nothing, and events in
   *   flight to it that are not committing fall back to Fishball once (EVT-UC-03 E1, R-WD-07).
   * - DECIDED (#17, kept by the user; packages/dsh-connector/mcp-schema/README.md "User decisions"): an invalid registration (no `pluginId`, empty `types`, a non-function `filter` or
   *   handler, a priority that is not a finite number) throws a `TypeError`, registering nothing.
   */
  intercept(registration: InterceptRegistration, onEvent: InterceptHandler): () => void
}
