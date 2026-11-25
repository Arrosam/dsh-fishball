/**
 * The V3 fields of the connector row's Config (task C-WIRE; design §5.1, §5.9; R-CON-10, R-TOK-08,
 * R-OA-20 Q-OA-7 A; C-WIRE-2): the token list, the approval port and the DSH name. Every
 * one is `.volatile()`, so a save in DSH's settings service never remounts the row (spike S21).
 * The connector's limits stay src/config.js's. A module of its own, with no import beyond the
 * schema library and constants, because src/config.js (the row's schema) loads it at import time.
 */
import Schema from '@deepseek-ai/schemastery'
import { APPROVAL_LISTENER } from '../../mcp-schema/constants.js'
// The approval listener's own port bounds: the setting accepts exactly what it can bind.
import { PORT_RANGE } from '../mcp/oauth-web/constants.js'
import { AUTO_ESCALATE_PERMISSIONS_DEFAULT, SETTING, SETTING_TEXT } from './constants.js'

/** One `{label, enabled, key}` item (K1d TokenSettingsItem). */
const tokenItem = Schema.object({
  label: Schema.string().required().description(SETTING_TEXT.tokenLabel),
  enabled: Schema.boolean().required().description(SETTING_TEXT.tokenEnabled),
  key: Schema.string().required().description(SETTING_TEXT.tokenKey),
})

/** The V3 fields of the row's Config (see the module comment). */
export const SETTINGS_SCHEMA = Object.freeze({
  [SETTING.tokens[0]]: Schema.array(tokenItem).default([]).description(SETTING_TEXT.tokens).volatile(),
  // `approval.port` and `approval.dshName` share one object, so both paths name one section.
  [SETTING.approvalPort[0]]: Schema.object({
    [SETTING.approvalPort[1]]: Schema.natural().min(PORT_RANGE.min).max(PORT_RANGE.max).default(APPROVAL_LISTENER.defaultPort)
      .description(SETTING_TEXT.approvalPort).volatile(),
    // Optional, with no default: unset or whitespace-only uses the OS hostname.
    [SETTING.dshName[1]]: Schema.string().description(SETTING_TEXT.dshName).volatile(),
  }),
  [SETTING.autoEscalatePermissions[0]]: Schema.object({
    [SETTING.autoEscalatePermissions[1]]: Schema.boolean().default(AUTO_ESCALATE_PERMISSIONS_DEFAULT)
      .description(SETTING_TEXT.autoEscalatePermissions).volatile(),
  }),
})
