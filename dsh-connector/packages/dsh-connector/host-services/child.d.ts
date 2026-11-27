/**
 * `dshInstanceChild`: the instance's child locator (task K3; design §4.1; R-HOST-02, R-HOST-06,
 * R-HOST-07, R-HOST-10, R-UI-01, R-UI-02; S4-Q1 decided A). Provided by the instance's host row
 * and looked up at runtime by dsh-connector-ui (see index.d.ts). Types only.
 *
 * It replaces the `ui` / `status` / `retry` fields V2 passed through contract 1.2. The vocabulary
 * below is V2's (`dsh-connector/contract` STATUS, STATUS_CODES) plus the V3 codes the
 * requirements name; the values are spelled exactly as the requirements spell them. I-HOST
 * amended it (2026-11-16): `fishball-off` withdrawn, `targetStatus` from the host's own state,
 * `[::1]` not served, `retry` creates no token, `reconnect` added.
 */
import type { Dispose } from './index.js'

/** The child's lifecycle state (V2 STATUS, unchanged). */
export type ChildState = 'disabled' | 'waiting' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed'

/**
 * Lifecycle codes (V2 STATUS_CODES and the instance's own launch codes, plus V3's).
 * - `PROFILE_INCOMPATIBLE`: an enabled placed bundle was skipped by the child's profile load; the
 *   start is blocked (design §8.1, R-BND-03).
 * `fishball-off` is withdrawn (I-HOST, the user's answer Q4 = A, R-FB-10 amended by 1.39: "the
 * instance reports only generic child states"; whether Fishball is on is core's own status inside
 * the child).
 */
export type LifecycleCode =
  | 'NATIVE_START_FAILED' | 'NATIVE_STOP_FAILED' | 'NATIVE_CHILD_EXITED' | 'NATIVE_UNAVAILABLE'
  | 'NATIVE_TIMEOUT' | 'NATIVE_DISABLED' | 'INVALID_MAIN_HOME' | 'PROFILE_INCOMPATIBLE'

/**
 * Target codes (design §6.1), reported in `targetStatus().code` only (I-HOST: since 1.39 the
 * instance cannot read core's link, so `status().code` holds lifecycle codes only):
 * - `TARGET_UNREACHABLE`: no connector answered at the target;
 * - `TOKEN_REFUSED`: the target refused the token;
 * - `TARGET_INCOMPATIBLE`: the target is not a V3 connector (404 on the MCP route, design §9.1);
 * - `token-revoked`: the target refused a token the child had paired with before: the user
 *   disabled or deleted the hosted entry (R-HOST-10). No replacement is created on its own;
 * - `target-insecure`, `target-invalid` (DECIDED D5): core refused the target URL itself, before any
 *   request (R-FB-04, REM-EP-01 rows 6–8), with state `target-unset`: plain `http:` to a host that
 *   is not a loopback name, or a value that is not an `http:` / `https:` URL.
 * The runtime values are K1's `TARGET_CODE` (`dsh-connector/mcp-schema`, DECIDED D7); a change
 * here changes that object in the same amendment.
 */
export type TargetCode = 'TARGET_UNREACHABLE' | 'TOKEN_REFUSED' | 'TARGET_INCOMPATIBLE' | 'token-revoked' | 'target-insecure' | 'target-invalid'

export type ChildStatusCode = LifecycleCode | TargetCode

/**
 * `code` is a lifecycle code, or `null` when there is nothing to report (I-HOST: target codes are
 * `targetStatus()`'s).
 * `plugin` names the bundle a `PROFILE_INCOMPATIBLE` start was blocked by (R-BND-03,
 * HOST-ST-01 #3: the status names it); absent otherwise. The field name is PROPOSED.
 */
export interface ChildStatus {
  readonly state: ChildState
  readonly code: ChildStatusCode | null
  readonly plugin?: string
}

/**
 * The child's target as the DSH side can see it (I-HOST, the user's answer Q3 = A, 2026-11-16).
 * Since requirements 1.39 the instance cannot read core's link inside the child, so it answers from
 * the host's own state only:
 * - `connected`: a same-DSH connector and the last hosted entry the instance created is `enabled`;
 * - `token-refused` (`token-revoked`): the last hosted entry is `disabled` or `deleted`;
 * - `target-unset`: no same-DSH connector, or a connector but no hosted entry created yet.
 * MULTI-0 (2026-11-18; PLAN-MULTI §3.3, D09): the child's target is always this DSH's own
 * connector (the actual parent). The instance's remote-target override is withdrawn from its
 * settings, launch and token rules, so `target-unreachable` no longer arises from a remote URL;
 * further targets are added inside Fishball (core's `targets.d.ts`), which the instance never sees.
 * The runtime values are K1's `TARGET_STATE` (DECIDED D7); a change here changes that object in the
 * same amendment.
 */
export type TargetState = 'connected' | 'target-unreachable' | 'token-refused' | 'target-unset'

export interface TargetStatus {
  readonly state: TargetState
  readonly code: TargetCode | null
}

/**
 * The loopback names the frame may use (S4-Q1 decided A, R-UI-02). The child's web server listens
 * on `127.0.0.1`, so it is reachable as `127.0.0.1` and `localhost`; `[::1]` stays in the type,
 * and `admit` answers it `not-ready` and `origin` `null` (I-HOST, the user's answer Q5 = A: a
 * second loopback listener is not designed). A host name is case-insensitive (RFC 3986 §3.2.2) and a WHATWG URL's `hostname` is
 * already lower-case, so a caller passes the hostname of the main page's request as its URL parsed
 * it; a page opened as `LOCALHOST` therefore arrives as `localhost`. Embed-UI's admit route checks
 * the main page's hostname against these three before it calls the locator, and refuses any other
 * name itself (design §4.1); the locator still rejects any other value from an untyped caller.
 */
export type LoopbackHostname = '127.0.0.1' | 'localhost' | '[::1]'

/**
 * The child view the frame opens: the child's Fishball page (`chat`), or that page with core's own
 * plugin settings opened (`settings`, fishball-ui's `view=settings` continuation). V2's two
 * descriptor views, with the same names (requirements 1.41 Q-G3: only the child's Fishball page).
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

/**
 * Hosted model sync (R-HOST-07; 1.41 Q-G7), V2's `providerSync`, started from the instance's own
 * settings page, and once automatically when a new child first becomes ready (the user, 2026-11-16:
 * "instance初次安装时同步一次"). It copies the host's providers and their model lists into the child
 * and nothing else: the model Fishball uses is chosen in Fishball's settings inside the child (the
 * user, 2026-11-16: "同步只是同步model list，至于fishball用什么还要在fishball内设置").
 */
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

/** Why `reconnect` refuses (PROPOSED spellings, I-HOST). MULTI-0 withdrew `target-remote` with the remote override. */
export type ReconnectRefusalCode = 'not-ready' | 'connector-missing' | 'operation-failed' | 'credentials-unwritable' | 'hosted-entry-disabled' | 'hosted-binding-unavailable' | 'rebind-not-confirmed'

export interface DshInstanceChild {
  readonly apiVersion: 1

  status(): ChildStatus

  /**
   * Calls `fn` (no argument) after a change of `status()` or of an `origin(...)`, and after the
   * instance itself changed what `targetStatus()` reads (a new hosted entry recorded, the Retry
   * notice). `targetStatus()` also follows the connector's entry state, which has no event (K3
   * `DshConnectorTokens`): a reader re-reads it per use, not only on `onChange` (I-HOST).
   */
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
   * `HostServiceError<AdmitErrorCode>`, or with the code `invalid-request` for a view or language
   * outside the types above (an untyped caller's bug, not the child being down).
   */
  admit(request: AdmitRequest): Promise<{ readonly url: string }>

  /**
   * Retry (decided 1 = A; R-HOST-10 amended by 1.29 R6 = B, 1.32 R11). It never creates a token,
   * and it acts in exactly two cases, changing nothing otherwise, so a Retry before the host is
   * ready leaves a stopped child stopped (HOST-ST-01 #9):
   * - state `failed`: restarts the child (V2's rule);
   * - target code `token-revoked` and `dshConnectorTokens.entryState` of the last hosted entry is
   *   `deleted`: it records the instance's notice `hosted-entry-deleted`, which the instance's own
   *   settings page shows with the ways to replace the token (Reconnect there, a newly generated
   *   token in core's token field in the child, or Connect). `disabled`: nothing, so a disabled
   *   entry is never replaced, and re-enabling it restores it.
   * Resolves once the retry has run; read `status()` for its outcome.
   */
  retry(): Promise<void>
  /**
   * Re-hand the held credential to the existing hosted child. Provision a new entry only
   * after deletion or confirmed credential loss; no pairing or sessions are transferred.
   * A storage acknowledgement is distinct from the connector confirming pairing and presence.
   */
  reconnect(): Promise<
    | { readonly ok: true; readonly outcome?: 'rebound' | 'paired' }
    | { readonly ok: true; readonly outcome: 'stored'; readonly code: 'pairing-not-confirmed' }
    | { readonly ok: false; readonly code: ReconnectRefusalCode }
  >

  targetStatus(): TargetStatus

  /**
   * The connector token entry key of the hosted entry the child holds now (the newest one the
   * instance recorded), or `null` before any is recorded or while the record is unread. Non-secret.
   * dsh-connector-ui offers it to the connector's UI backend as the one agent whose window this
   * DSH can open (`DshConnectorUi.offerWindows`), so its sidebar entry names that agent. A new
   * recorded entry is announced by `onChange`. Added 2026-11-21; an older locator lacks it, and
   * then no agent has a window here.
   */
  agentEntry(): string | null

  readonly providerSync: ProviderSync
}
