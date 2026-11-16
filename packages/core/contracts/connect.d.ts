/**
 * Connect: core as a public OAuth client of the connector's approval page (gate K3a; design
 * §6.3a; R-FB-03, R-OA-11…19, R-OA-22; requirements 1.31–1.33; decided items 11, 12, 67). Types
 * only; the values are `constants.js`'s `CONNECT`, and the OAuth words are `MCP.oauth`.
 *
 * Two layers, so each has one owner:
 * - `OAuthClient`: the S7c K2 token manager (`v3-s7c.md` §4 K2), Fishball side's copy in
 *   core's `src/link/oauth-client.js` (design §6.3a "one copy per side"; most of it is the MCP SDK's own
 *   `auth()` and `OAuthClientProvider`). It knows nothing about Fishball;
 * - `FishballConnect`: core's Connect control on top of it (F-LINK-SAVE builds it; F-STATUS and
 *   fishball-ui draw it).
 * Nothing here carries a token value, a code or a grant: they stay inside `ctx.credentials`.
 */

/** `CONNECT.state`, the S7c token manager's states. */
export type ConnectState = 'needs-configuration' | 'needs-authorization' | 'authorizing' | 'authorized' | 'failed'

/** `CONNECT.configuration`: why Connect sends nothing (PROPOSED spellings). */
export type ConnectConfigurationCode =
  | 'metadata-url-missing' | 'metadata-url-not-https' | 'metadata-url-root-path' | 'not-a-connector' | 'web-callback-insecure'

/**
 * - `needs-configuration` carries the failing rule's `code`;
 * - `failed` carries the OAuth error or `null` (no value, code or grant, ever);
 * - every other state has `code: null`.
 */
export interface ConnectStatus {
  readonly state: ConnectState
  /** A `ConnectConfigurationCode`, an OAuth error word, or `null`. */
  readonly code: string | null
}

/**
 * What one `begin()` answers at once; the attempt runs on until the callback, its timeout or
 * `cancel()` (S7c §4):
 * - `authorized`: a grant for this target is saved; nothing to do;
 * - `approval-url`: open `url` in the browser; while the attempt is pending a second `begin()`
 *   answers the same URL, and the URL is dead once the attempt ended. It carries no secret;
 * - `needs-configuration`: nothing was sent (`code` says why).
 */
export type ConnectBegin =
  | { readonly outcome: 'authorized' }
  | { readonly outcome: 'approval-url'; readonly url: string }
  | { readonly outcome: 'needs-configuration'; readonly code: ConnectConfigurationCode }

/**
 * Options of one token manager: one target, one saved grant record.
 * - `serverUrl`: the target's MCP URL; the connector check (`not-a-connector`) runs against it
 *   before any authorization request;
 * - `clientMetadataUrl`: the user-hosted CIMD document URL (`CONNECT.setting`; required, no default);
 * - `recordKey`: the DSH credential record its grant is saved under (`kind: grant`), once, after the
 *   first successful code exchange (R9); refresh rotates it in place under `modifyRecord`'s lock;
 * - `authorizationParameters`: extra authorization-request parameters; core passes
 *   `{[MCP.oauth.agentIdParameter]: identity.id}` (R-OA-22). A server that does not know one ignores it;
 * - `redirectUri`: the web callback for a browser on another machine (Q-A3 B), else the loopback
 *   `CONNECT.callback.loopbackPath` on a fresh OS port per attempt through `ctx.authorization`.
 */
export interface OAuthClientOptions {
  readonly serverUrl: string
  readonly clientMetadataUrl: string | undefined
  readonly recordKey: string
  readonly authorizationParameters?: Readonly<Record<string, string>>
  readonly redirectUri?: string
}

/**
 * The token manager.
 * - `authProvider`: what core's link passes to `StreamableHTTPClientTransport`; single-flight
 *   refresh; `invalid_grant` on refresh drops the grant and moves to `needs-authorization` once,
 *   with no retry loop (design §6.3a step 5);
 * - `status()` / `onChange(fn)`: the current state; `onChange` returns its disposer;
 * - `begin()` / `cancel()`: one `ctx.authorization` attempt (PKCE S256, `state` and `iss` checked,
 *   `resource` sent, the code exchanged with no secret);
 * - `forget()`: deletes the saved grant (a changed target origin is a new first connection).
 */
export interface OAuthClient {
  readonly authProvider: unknown
  status(): ConnectStatus
  onChange(fn: (status: ConnectStatus) => void): () => void
  begin(): Promise<ConnectBegin>
  cancel(): void
  forget(): Promise<void>
}

/** `src/link/oauth-client.js`'s one export (the factory); the context is the caller's DSH `ctx`. */
export type CreateOAuthClient = (ctx: unknown, options: OAuthClientOptions) => OAuthClient

/**
 * Core's Connect control for the configured target (standalone, or hosted with a remote target).
 * It is `OAuthClient`'s `status` / `onChange` / `begin` / `cancel`, bound to the current target
 * and core's `identity.id`; a hosted child with a same-DSH connector uses the hosted import instead
 * (`link.d.ts`), and Connect reports `authorized` once that credential is saved.
 * Callback, completion, and `set_name` after it: F-LINK-SAVE (design §6.3a steps 4–5, R-NAME).
 */
export type FishballConnect = Pick<OAuthClient, 'status' | 'onChange' | 'begin' | 'cancel'>
