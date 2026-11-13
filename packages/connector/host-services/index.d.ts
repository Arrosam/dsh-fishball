/**
 * Host-only service contracts of a main DSH (task K3; design §3.6, §4.1, §5.4; requirements
 * R-CON-11, R-HOST-05/06/09/10, R-UI-01/02/10). Types only: nothing here runs. The prose freeze is
 * `README.md` beside this file.
 *
 * Every service is a Cordis service provided in-process to plugins of the same DSH. None is
 * reachable over MCP, HTTP or from a browser, and none carries a token value. Each has
 * `apiVersion: 1`; a consumer treats any other value as the service being absent (UIM-EP-01 #5).
 *
 * Providers and consumers:
 * - `fishballConnectorHandover`: provided by fishball-connector, used by fishball-embed-ui;
 * - `fishballConnectorTokens`: provided by fishball-connector, used by the instance's host row;
 * - `fishballChild`: provided by the instance's host row, used by fishball-embed-ui. It is declared
 *   here, beside the other host-only services of a main DSH, so its consumer needs only the
 *   connector's type folder; the instance never imports this file.
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

export type { FishballConnectorHandover, HandoverPrincipal, ManagedSession, PrincipalRef, HandOverResult, TakeBackResult, HandOverRefusalCode, TakeBackRefusalCode } from './handover.js'
export type { FishballConnectorTokens, HostedTokenEntry, RetireResult, RetireRefusalCode, CreateHostedErrorCode } from './tokens.js'
export type {
  FishballChild, ChildState, ChildStatus, ChildStatusCode, LifecycleCode, TargetCode, TargetState, TargetStatus,
  LoopbackHostname, AdmitRequest, AdmitView, AdmitLang, AdmitErrorCode, ProviderSync, ProviderSyncStatus,
  ProviderSyncCheckResult, ProviderSyncAddResult,
} from './child.js'

import type { FishballConnectorHandover } from './handover.js'
import type { FishballConnectorTokens } from './tokens.js'
import type { FishballChild } from './child.js'

/**
 * The services as DSH declares its own: members of the cordis `Context`. Each consumer injects
 * them optionally (`'fishballConnectorHandover?'`, `'fishballConnectorTokens?'`,
 * `'fishballChild?'`), so it loads and reports without the provider (R-UI-01, R-ARCH-03).
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    fishballConnectorHandover: FishballConnectorHandover
    fishballConnectorTokens: FishballConnectorTokens
    fishballChild: FishballChild
  }
}
