/**
 * V3-S7b spike constants (throwaway prototype, not product code).
 * Paths follow v3-design.md §5.5 / §5.5a so the spike exercises the designed URLs.
 * Every value marked K is a spike placeholder for a number frozen at V3-K.
 */
export const S7B = Object.freeze({
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  versionsRoot: '/Users/samuel/Library/Application Support/DSH/data/versions',
  host: '127.0.0.1',
  paths: Object.freeze({
    mcp: '/api/fishball/mcp',
    issuer: '/api/fishball/oauth',
    token: '/api/fishball/oauth/token',
    prmPrefix: '/.well-known/oauth-protected-resource',
    asmPrefix: '/.well-known/oauth-authorization-server',
    // Approval listener (R-OA-20): only these two answer; everything else is 404.
    authorize: '/authorize',
    decision: '/authorize/decision',
    control: '/__s7b/control',
    spikeFile: 's7b-spike.json',
    readyFile: 's7b-ready.json',
  }),
  protocol: '2026-07-28',
  extension: 'io.modelcontextprotocol/oauth-client-credentials',
  tokenPrefix: 'fbt_',
  tokenBytes: 32,
  opaqueBytes: 32,
  minTokenChars: 32,                       // TQ-4
  accessLifetimeSeconds: 3600,             // Q27
  codeLifetimeMs: 60_000,                  // K (R-OA-14)
  pendingLifetimeMs: 600_000,              // K (R-OA-15)
  maxFormBytes: 8192,
  failureLimit: Object.freeze({ max: 5, windowMs: 60_000 }),   // K (R-TOK-06, R-OA-17)
  cimd: Object.freeze({
    maxBytes: 5120,                        // draft-ietf-oauth-client-id-metadata-document-00 §6.6
    timeoutMs: 3000,                       // K
    maxCacheSeconds: 86_400,               // K
  }),
  idPattern: /^[A-Za-z0-9_-]{1,64}$/,      // R-ID-02 (no dot)
  nameMaxChars: 64,                        // R-NAME-02
  scope: Object.freeze({ full: 'fishball', pair: 'fishball:pair' }),
  // Requests a pair-only token may make (R-OA-04): discovery, tools/list and the `pair` tool.
  pairOnly: Object.freeze({ methods: Object.freeze(['server/discover', 'tools/list', 'ping']), tool: 'pair' }),
  grants: Object.freeze({ cc: 'client_credentials', code: 'authorization_code', refresh: 'refresh_token' }),
  // Prototype entries: key -> credential ref. Values are generated into ctx.credentials.
  entries: Object.freeze(Array.from({ length: 24 }, (_, i) => `e${i + 1}`).map((key) => Object.freeze({ key, ref: `FB_S7B_${key.toUpperCase()}` }))),
  loopbackNames: Object.freeze(['localhost', '127.0.0.1', '[::1]']),
  status: Object.freeze({ ok: 'ok', portInUse: 'approval-port-in-use' }),
  page: Object.freeze({
    dshName: 'Spike DSH',
    invalidToken: 'This token is not valid.',
    rateLimited: 'Too many attempts. Wait a minute and try again.',
    alreadyPaired: 'This token is already used by an agent. Create a new token in the connector\'s settings.',
    idInvalid: 'id-invalid: the id must be 1-64 characters of A-Z, a-z, 0-9, _ or -.',
    idTaken: 'id-taken: another agent on this DSH already uses this id.',
    nameInvalid: 'name-invalid: the name must be 1-64 characters with no control characters.',
    nameTaken: 'name-taken: another agent on this DSH already uses this name.',
    expired: 'This request has expired. Start again from your agent.',
    enterToken: 'Enter a token.',
    badClient: 'The client id is not a valid client metadata document URL, or its document could not be used.',
    badRedirect: 'The redirect URI is not registered for this client.',
  }),
})
