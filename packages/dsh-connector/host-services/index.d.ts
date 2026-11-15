/**
 * Host-only service contracts of a main DSH (task K3; design §3.6, §4.1, §5.4; requirements
 * R-CON-11, R-HOST-05/06/09/10, R-UI-01/02/10). Types only: nothing here runs. The prose freeze is
 * `README.md` beside this file.
 *
 * Every service is a Cordis service provided in-process to plugins of the same DSH. None is
 * reachable over MCP, HTTP or from a browser, and none carries a token value. Each has
 * `apiVersion: 1`; a consumer treats any other value as the service being absent (UIM-EP-01 #5).
 *
 * Providers and consumers are listed once, in README.md. Values marked PROPOSED are product
 * choices: frozen as they stand (decided 3 = A), and the user may still change them.
 */

/** Disposes what a registration created. Idempotent: a second call does nothing. */
export type Dispose = () => void

/** A refusal returned as data (never thrown) by a host-only service. */
export interface Refusal<Code extends string> {
  readonly ok: false
  readonly code: Code
}

/**
 * The error a host-only service rejects with when the contract says it rejects. `code` is one of
 * the codes named at that member; the message is diagnostic text only and never holds a secret.
 */
export interface HostServiceError<Code extends string = string> extends Error {
  readonly code: Code
}

export type { DshConnectorHandover, HandoverPrincipal, ManagedSession, PrincipalRef, HandOverResult, TakeBackResult, HandOverRefusalCode, TakeBackRefusalCode } from './handover.js'
export type { DshConnectorTokens, HostedTokenEntry, HostedEntryState, RetireResult, RetireRefusalCode, CreateHostedErrorCode } from './tokens.js'
export type {
  DshInstanceChild, ChildState, ChildStatus, ChildStatusCode, LifecycleCode, TargetCode, TargetState, TargetStatus,
  LoopbackHostname, AdmitRequest, AdmitView, AdmitLang, AdmitErrorCode, ProviderSync, ProviderSyncStatus,
  ProviderSyncCheckResult, ProviderSyncAddResult,
} from './child.js'

import type { DshConnectorHandover } from './handover.js'
import type { DshConnectorTokens } from './tokens.js'
import type { DshInstanceChild } from './child.js'

/**
 * The services as DSH declares its own: members of the cordis `Context`. A consumer must load and
 * report without the provider (R-UI-01, R-ARCH-03), so it looks the service up at runtime
 * (`ctx.get(name)`, or a `ctx.inject([name], …)` sub-scope) and does not list it in its own
 * `inject`: Cordis on both SDKs treats a trailing `?` literally, and every listed key gates the
 * row's activation (fold-notify/index.js, instance host.js). Design §4.2's `'name?'` spelling
 * means this.
 *
 * Resolving this augmentation needs `@deepseek-ai/cordis` (a DSH peer) in the consumer's types.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    dshConnectorHandover: DshConnectorHandover
    dshConnectorTokens: DshConnectorTokens
    dshInstanceChild: DshInstanceChild
  }
}
