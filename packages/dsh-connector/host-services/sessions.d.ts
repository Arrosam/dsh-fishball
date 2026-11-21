/**
 * `dshConnectorSessions`: what a main-DSH plugin needs to act for the agent that manages a session
 * (the user, 2026-11-20, for dsh-connector-watchdog: a generic connector feature instead of a
 * Watchdog hook; watchdog-project-notes.md §4). Provided by dsh-connector (src/wire/domain.js).
 * Types only.
 *
 * Planned, not provided yet (the user's order, 2026-11-20: delegates first, then Watchdog, then
 * this): `backends`, hosted session backends (a Claude Code or Codex subagent run as a managed-only
 * session, read-only in the user's sidebar, reachable only through its manager), whose permission
 * requests enter the same delegate → grant → offer path as a DSH session's.
 */
import type { Dispose } from './index.js'

/** The K1 descriptor of a permission request, as the manager's `permission` offer would carry it. */
export interface DelegatedDescriptor {
  readonly approvalId: string
  readonly offerId: string
  readonly kind: 'approval'
  readonly prompt: string
  readonly title: string
  readonly at: number
  readonly toolName: string
  readonly callId: string | null
  readonly reason: string
  readonly arguments: string
  readonly argumentsStatus: 'complete' | 'truncated' | 'unavailable'
}

export interface DelegatedRequest {
  /** The root session the request belongs to (a subagent asks for its root). */
  readonly sessionId: string
  readonly descriptor: DelegatedDescriptor
}

/**
 * - `allow` / `reject`: decides this one call (never a standing grant); `reason` must be non-empty.
 *   A reject's reason is what the session's agent reads. The manager gets `settlement {by: 'delegate',
 *   delegate: {name, toolName, reason}}`.
 * - `pass`: the request goes on to the manager; its offer carries `delegate {name, outcome: 'passed',
 *   reason?}` (the optional reason, trimmed, when non-empty).
 * A throw or any other answer also goes on to the manager, as `delegate {name, outcome: 'failed',
 * reason}`: the thrown error's `code` (else its `name`), or `invalid-verdict`. It is logged; there
 * is no other failure state.
 */
export type DelegateVerdict =
  | { readonly verdict: 'allow' | 'reject'; readonly reason: string }
  | { readonly verdict: 'pass'; readonly reason?: string }

export interface PermissionDelegate {
  /** [a-z][a-z0-9-]{0,47}, unique; shown to the manager in the settlement. */
  readonly name: string
  /** Synchronous: whether this delegate decides the root session's permission requests now. */
  claims(sessionId: string): boolean
  /**
   * Asked after the connector's standing-grant check and before any offer, for managed sessions
   * only. The first registered delegate that claims the session is the only one asked. `signal`
   * aborts when the call ends (Stop, the turn ended); the call is then cancelled whatever is answered.
   * Questions and plan reviews never reach a delegate.
   */
  decide(request: DelegatedRequest, options: { readonly signal?: AbortSignal }): Promise<DelegateVerdict>
}

export interface SessionReadMessage {
  readonly seq: number
  readonly role: 'user' | 'assistant' | 'principal' | 'agent' | 'context'
  readonly author: string
  readonly text: string
}

export interface DshConnectorSessions {
  readonly apiVersion: 1
  readonly delegates: {
    /** Throws for an invalid definition, a taken name, or a closing connector. */
    register(delegate: PermissionDelegate): Dispose
  }
  /** The root session a session belongs to (itself unless it is a subagent's). */
  rootOf(sessionId: string): string
  /** The principal key managing the session's root, or undefined when nobody manages it. */
  managerOf(sessionId: string): string | undefined
  /** `session_read`'s bounded read (newest messages kept, the connector's caps apply). */
  read(input: { sessionId: string; maxMessages: number; maxBytes: number }): Promise<{ messages: readonly SessionReadMessage[]; truncated: boolean }>
  /**
   * The Stop button: ends the running turn, if any. The session still takes messages afterwards.
   * With a non-empty `reason` the turn is cancelled with DSH's `{kind: 'hook', reason}` cause
   * instead of the user's, so the manager's `turn-finished` reads `stop {kind: 'aborted', message:
   * 'the turn was cancelled (hook: <reason>)'}` and tells this plugin's stop from the user's.
   */
  stop(input: { sessionId: string; reason?: string }): Promise<void>
}
