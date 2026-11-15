/**
 * The connector's own settings page, host half (task C-TOKENS-REVEAL; design §5.9; R-ARCH-03,
 * R-TOK-11). The HTTP words (statuses, methods, the buffered body, the JSON headers with
 * `cache-control: no-store`, `bad-body`) are the connector's (../constants.js) and are imported.
 */

/**
 * The page's owner-only Fetch routes. DSH's `connection.fetch` registry is exact-path and
 * owner-only, and applies DSH's Host/Origin fence before a handler runs, so a handler checks only
 * its body (as dsh-connector-ui's host routes do). The browser half (client.js) calls them
 * page-relative, so it keeps the same paths without the leading `/`.
 * - `create`: POST `{label}` → `{ok: true, entryKey, label, value}`, the one response that ever
 *   carries a token value (R-TOK-04, R-TOK-11);
 * - `notice`: GET → `{ok: true, notice: {code, labels} | null}`, the duplicate notice (R3, R5).
 */
export const SETTINGS_PAGE = Object.freeze({
  route: Object.freeze({
    create: '/api/dsh-connector/tokens/create',
    notice: '/api/dsh-connector/tokens/notice',
  }),
  /**
   * The largest create body read (design §5.9 "JSON body bound"; the value is this route's own
   * choice, not the token endpoint's form bound, which bounds another body): a label is short and
   * nothing else is read, so 4 KiB leaves room for any label without reading large bodies.
   */
  maxBodyBytes: 4096,
  /** The row effect's label, followed by the route path. */
  effectLabel: 'dsh-connector settings page: ',
})

/** Log lines: the label and codes only, never a value (design §5.9 step 4). */
export const LOG = Object.freeze({
  created: 'token entry "%s" created',
  routeUnavailable: 'settings page route %s not registered (%s)',
})
