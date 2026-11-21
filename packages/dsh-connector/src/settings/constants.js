/**
 * The connector row's V3 settings: their paths in the row's config, the approval port's range, and
 * the log lines (task C-WIRE; design §5.1, §5.9, R-TOK-08, R-OA-20 Q-OA-7, R-CON-10; C-WIRE-2).
 * The default port is K1's (APPROVAL_LISTENER.defaultPort) and the item shape K1d's
 * (TokenSettingsItem); both are imported where used, never restated.
 */

/**
 * Where each V3 setting sits in the row's config (DSH's settings service addresses it by path).
 * - `tokens`: the token list, `{label, enabled, key}` items (K1d TokenSettingsItem);
 * - `approval.port`: the approval listener's port (R-OA-20, Q-OA-7 A);
 * - `approval.dshName`: the raw base of the MCP server name and the approval page's DSH name;
 *   unset or whitespace-only uses `node:os.hostname()` (MULTI-2).
 * - `requests.allowHighRisk`: whether a managing agent may allow a high-risk permission request
 *   (HIGH-RISK-APPROVAL, the user, 2026-11-21); off restores the strict rule (`allow-needs-low-risk`).
 * C-WIRE-2 withdrew `routing.agentToken`, the designated agent (the user's answer q5, 2026-11-17:
 * "Remove agentToken entirely").
 */
export const SETTING = Object.freeze({
  tokens: Object.freeze(['tokens']),
  approvalPort: Object.freeze(['approval', 'port']),
  dshName: Object.freeze(['approval', 'dshName']),
  allowHighRisk: Object.freeze(['requests', 'allowHighRisk']),
})

/**
 * `requests.allowHighRisk`'s default: on (the user, 2026-11-21: "a manager must be able to approve
 * high-risk requests too"; deciding when is the manager's responsibility).
 */
export const HIGH_RISK = Object.freeze({ allowedByDefault: true })

/** DSH's settings-service path edits (dsh-settings SettingsPathOp). */
export const PATH_OP = Object.freeze({ set: 'set', unset: 'unset' })

/** The connector's own DSH services read with `ctx.get` (not injected, so the row loads without them). */
export const SETTINGS_SERVICE = Object.freeze({
  settings: 'settings',
  /** dsh-hmr's service (index.js `outsideHmr`). */
  hmr: 'hmr',
})

/** dsh-hmr's private transaction store field on its service (index.js `outsideHmr`; both SDKs). */
export const HMR_TRANSACTION_FIELD = 'executing'

/** Descriptions shown by DSH's native form (R-CON-10). Model-free, user-facing. */
export const SETTING_TEXT = Object.freeze({
  tokens: 'Token entries for the agents that connect to this DSH. Create one with New token on the connector\'s settings page.',
  tokenLabel: 'A name for the entry; it is shown, not secret.',
  tokenEnabled: 'Off: the agent using this token is refused until it is switched on again.',
  tokenKey: 'The entry\'s key, written when it was created. Do not edit it.',
  approvalPort: 'The port of the approval page that browser agents sign in on. It binds the same host as DSH.',
  dshName: 'The DSH name shown on the approval page and advertised over MCP with -DSH appended. Empty: the OS device name.',
  allowHighRisk: 'On: a managing agent may allow a high-risk permission request, one call at a time and with a reason, which DSH\'s log records. Off: it can only escalate such a request to you. Standing grants are always low risk only.',
})

/** Programming errors (thrown, never shown to a user). */
export const MISUSE = Object.freeze({
  noSettings: 'dsh-connector settings: DSH\'s settings service is not available',
})

/** Log lines (`logger.warn(LOG.format, line, code)`): codes only, never a value or a label. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  applyFailed: 'settings: the token list could not be applied',
  listenerFailed: 'settings: a settings listener failed',
})
