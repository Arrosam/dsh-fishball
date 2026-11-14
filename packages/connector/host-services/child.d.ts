/**
 * `fishballChild`: the instance's child locator (task K3; design §4.1; R-HOST-02, R-HOST-06,
 * R-HOST-07, R-HOST-10, R-UI-01, R-UI-02; S4-Q1 decided A). Provided by the instance's host row
 * and looked up at runtime by fishball-embed-ui (see index.d.ts). Types only.
 *
 * It replaces the `ui` / `status` / `retry` fields V2 passed through contract 1.2. The vocabulary
 * below is V2's (`fishball-connector/contract` STATUS, STATUS_CODES) plus the V3 codes the
 * requirements name; the values are spelled exactly as the requirements spell them.
 */
import type { Dispose } from './index.js'

/** The child's lifecycle state (V2 STATUS, unchanged). */
export type ChildState = 'disabled' | 'waiting' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed'

/**
 * Lifecycle codes (V2 STATUS_CODES and the instance's own launch codes, plus V3's).
 * - `PROFILE_INCOMPATIBLE`: an enabled set member or `fishball-hosted-settings` was skipped by the
 *   child's profile load; the start is blocked (design §8.1, R-BND-03, R-HOST-11 (4));
 * - `fishball-off`: the owner disabled `fishball-core` in the child; the child runs anyway
 *   (R-FB-10). It is a code with state `ready`, not a state of its own.
 */
export type LifecycleCode =
  | 'NATIVE_START_FAILED' | 'NATIVE_STOP_FAILED' | 'NATIVE_CHILD_EXITED' | 'NATIVE_UNAVAILABLE'
  | 'NATIVE_TIMEOUT' | 'NATIVE_DISABLED' | 'INVALID_MAIN_HOME' | 'PROFILE_INCOMPATIBLE' | 'fishball-off'

/**
 * Target codes (design §6.1), reported in `status().code` while the child itself is ready:
 * - `TARGET_UNREACHABLE`: no connector answered at the target;
 * - `TOKEN_REFUSED`: the target refused the token;
 * - `TARGET_INCOMPATIBLE`: the target is not a V3 connector (404 on the MCP route, design §9.1);
 * - `token-revoked`: the target refused a token the child had paired with before: the user
 *   disabled or deleted the hosted entry (R-HOST-10). No replacement is created on its own;
 * - `target-insecure`, `target-invalid` (DECIDED D5): core refused the target URL itself, before any
 *   request (R-FB-04, REM-EP-01 rows 6–8), with state `target-unset`: plain `http:` to a host that
 *   is not a loopback name, or a value that is not an `http:` / `https:` URL.
 * The runtime values are K1's `TARGET_CODE` (`fishball-connector/mcp-schema`, DECIDED D7), and
 * `TargetState`'s are K1's `TARGET_STATE`; a change here changes that object in the same amendment.
 */
export type TargetCode = 'TARGET_UNREACHABLE' | 'TOKEN_REFUSED' | 'TARGET_INCOMPATIBLE' | 'token-revoked' | 'target-insecure' | 'target-invalid'

export type ChildStatusCode = LifecycleCode | TargetCode

/**
 * `code` is `null` when there is nothing to report. A lifecycle code wins over a target code:
 * a target code appears only while `state` is `ready` (PROPOSED).
 * `plugin` names the bundle a `PROFILE_INCOMPATIBLE` start was blocked by (R-HOST-11 (4),
 * HOST-ST-01 #3: the status names it); absent otherwise. The field name is PROPOSED.
 */
export interface ChildStatus {
  readonly state: ChildState
  readonly code: ChildStatusCode | null
  readonly plugin?: string
}

/**
 * The child's MCP link to its target (R-FB-03, R-FB-04):
 * - `connected`: the link holds a listen stream on the target's `fishball-events`;
 * - `target-unreachable`: the target did not answer, or is not a V3 connector;
 * - `token-refused`: the target refused the token (`code` is `token-revoked` when it had accepted
 *   it before, else `TOKEN_REFUSED`);
 * - `target-unset`: there is nothing to connect with: no connector in this DSH and a blank
 *   `target.url`, or a `target.tokenRef` that holds no value (HOST-UC-05 A1, which the case left
 *   open between this and `token-refused`: PROPOSED).
 */
export type TargetState = 'connected' | 'target-unreachable' | 'token-refused' | 'target-unset'

export interface TargetStatus {
  readonly state: TargetState
  readonly code: TargetCode | null
}

/**
 * The loopback names the frame may use (S4-Q1 decided A, R-UI-02). The child is reachable under
 * all three. A host name is case-insensitive (RFC 3986 §3.2.2) and a WHATWG URL's `hostname` is
 * already lower-case, so a caller passes the hostname of the main page's request as its URL parsed
 * it; a page opened as `LOCALHOST` therefore arrives as `localhost`. Embed-UI's admit route checks
 * the main page's hostname against these three before it calls the locator, and refuses any other
 * name itself (design §4.1); the locator still rejects any other value from an untyped caller.
 */
export type LoopbackHostname = '127.0.0.1' | 'localhost' | '[::1]'

/**
 * The child view the frame opens: Fishball's conversation (`chat`) or its slim settings panel
 * (`settings`). V2's two descriptor views (instance host.js `PLUGIN.ui`), with the same names.
 */
export type AdmitView = 'chat' | 'settings'

/** The page language the child is admitted with (V2 UI_LANG). */
export type AdmitLang = 'zh' | 'en'

export interface AdmitRequest {
  readonly view: AdmitView
  readonly lang: AdmitLang
  readonly hostname: LoopbackHostname
}

/**
 * Why `admit` rejects (`HostServiceError.code`; both codes DECIDED #15, #16, kept):
 * - `hostname-refused`: the hostname is not one of `LoopbackHostname`; embed-UI then shows "Open DSH
 *   at 127.0.0.1 to use Fishball" instead of a frame (R-UI-02);
 * - `not-ready`: the child is not `ready`, or it stopped or restarted before the ticket was minted.
 */
export type AdmitErrorCode = 'hostname-refused' | 'not-ready'

/** Hosted model sync (R-HOST-07), V2's `providerSync`, started only from embed-UI's Plugins card. */
export interface ProviderSyncStatus {
  readonly state: 'inactive' | 'ready'
  readonly instanceId?: string
}

/** A model-sync refusal, as V2's sync routes answer it. */
export interface ProviderSyncRefusal { readonly ok: false; readonly error: { readonly code: string } }

export type ProviderSyncCheckResult =
  | {
      readonly ok: true
      readonly result: {
        readonly checkId: string
        readonly missing: readonly { readonly id: string; readonly name: string; readonly models: readonly string[] }[]
        readonly notOffered: readonly { readonly id: string; readonly name: string; readonly reason: string }[]
        readonly present: number
      }
    }
  | ProviderSyncRefusal

export type ProviderSyncAddResult =
  | { readonly ok: true; readonly result: { readonly items: readonly { readonly id: string; readonly outcome: 'added' | 'skipped' | 'failed'; readonly reason?: string }[] } }
  | ProviderSyncRefusal

export interface ProviderSync {
  status(): ProviderSyncStatus
  /** One preview of what the child lacks; concurrent calls share the check in flight. */
  check(): Promise<ProviderSyncCheckResult>
  /** Confirms exactly `ids` of that check. */
  add(request: { readonly checkId: string; readonly ids: readonly string[] }): Promise<ProviderSyncAddResult>
}

export interface FishballChild {
  readonly apiVersion: 1

  status(): ChildStatus

  /** Calls `fn` (no argument) after a change of `status()`, of an `origin(...)` or of `targetStatus()`. */
  onChange(fn: () => void): Dispose

  /**
   * The child web's origin under `hostname`, with the child's own port, for example
   * `http://localhost:49152`; `null` while the child is not `ready` or for a refused hostname.
   */
  origin(hostname: LoopbackHostname): string | null

  /**
   * A one-time admission URL for the frame's first navigation (design §4.1): the single-use,
   * short-lived ticket is bound to the current child generation, the view and `hostname`, and is
   * redeemed once by the child into its own login cookie (S4). Resolves to `{url}` and nothing
   * else. The URL is never logged; a later reload asks for a new one. Rejects with
   * `HostServiceError<AdmitErrorCode>`.
   */
  admit(request: AdmitRequest): Promise<{ readonly url: string }>

  /**
   * Retry (decided 1 = A). It acts in exactly two cases and changes nothing otherwise, so a Retry
   * before the host is ready leaves a stopped child stopped (HOST-ST-01 #9):
   * - state `failed`: restarts the child (V2's rule);
   * - code `token-revoked` with a same-DSH connector: the instance reads
   *   `fishballConnectorTokens.entryState` of its hosted entry. `deleted`: it creates a new hosted
   *   entry and the child pairs with it (R-HOST-10, HOST-DT-01 rule 5; never a succession).
   *   `disabled` or `enabled`: nothing, so a disabled entry is never replaced.
   * Resolves once the retry has run; read `status()` for its outcome.
   */
  retry(): Promise<void>

  targetStatus(): TargetStatus

  readonly providerSync: ProviderSync
}
