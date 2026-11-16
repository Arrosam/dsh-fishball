/**
 * The V3 fields of the connector row's Config (task C-WIRE; design §5.1, §5.9; R-CON-10, R-TOK-08,
 * R-ROUTE-04, R-OA-20 Q-OA-7 A): the token list, the designated agent and the approval port. Every
 * one is `.volatile()`, so a save in DSH's settings service never remounts the row (spike S21).
 * The connector's limits stay src/config.js's. A module of its own, with no import beyond the
 * schema library and constants, because src/config.js (the row's schema) loads it at import time.
 */
import Schema from '@deepseek-ai/schemastery'
import { APPROVAL_LISTENER } from '../../mcp-schema/constants.js'
import { PORT_RANGE, SETTING, SETTING_TEXT } from './constants.js'

/** One `{label, enabled, key}` item (K1d TokenSettingsItem). */
const tokenItem = Schema.object({
  label: Schema.string().required().description(SETTING_TEXT.tokenLabel),
  enabled: Schema.boolean().required().description(SETTING_TEXT.tokenEnabled),
  key: Schema.string().required().description(SETTING_TEXT.tokenKey),
})

/** The V3 fields of the row's Config (see the module comment). */
export const SETTINGS_SCHEMA = Object.freeze({
  [SETTING.tokens[0]]: Schema.array(tokenItem).default([]).description(SETTING_TEXT.tokens).volatile(),
  [SETTING.agentToken[0]]: Schema.object({
    [SETTING.agentToken[1]]: Schema.string().description(SETTING_TEXT.agentToken).volatile(),
  }),
  [SETTING.approvalPort[0]]: Schema.object({
    [SETTING.approvalPort[1]]: Schema.natural().min(PORT_RANGE.min).max(PORT_RANGE.max).default(APPROVAL_LISTENER.defaultPort)
      .description(SETTING_TEXT.approvalPort).volatile(),
  }),
})
