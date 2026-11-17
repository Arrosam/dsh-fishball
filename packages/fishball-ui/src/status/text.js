/**
 * The status strip's copy (task F-STATUS; R-FB-03, R-FB-04, R-FB-09, R-FB-10, R-BND-05, R-EXT-14;
 * design §6.3a). PROPOSED wording, reviewed with the pairing copy (W3 question P-3). Data only:
 * frozen strings and pure template formatters that interpolate names, codes and numbers only.
 *
 * `line` keys are the strip's line kinds: the link's states (`SEAM_STATUS.link`, core's
 * `LINK.state`), Connect's states (`SEAM_STATUS.connect`, core's `CONNECT.state`) and
 * `fishball-off`, computed from those constants so a rename cannot drift. `reason` keys are
 * `SEAM_STATUS.reason`. A code is shown verbatim after the word (`code`),
 * because the codes are the documented words a user can look up (K3 `LinkCode`,
 * `ConnectConfigurationCode`, the plugin manager's error codes). Moved with the strip from core
 * by F-UI; the words' keys come from `fishball-shared/ui-seam`, never from core.
 *
 * UI-POLISH-F reworded `tools` into a chip and added `card` (the card's heading, its state badges,
 * the tools chip's hint and the approval link's text); the line words are unchanged.
 */
import { SEAM_STATUS } from 'fishball-shared/ui-seam'

const { link: LS, connect: CS, reason: RS } = SEAM_STATUS
const OFF = SEAM_STATUS.fishball.off

/**
 * The status card's states (UI-POLISH-F): what the card's badge, dot and accent say. One state per
 * group of line kinds, mapped in `src/status/index.js` (`CARD_OF`); fishball-ui's own vocabulary, so
 * it lives here and not in the seam.
 */
export const CARD = Object.freeze({
  connected: 'connected', unset: 'unset', disconnected: 'disconnected', connecting: 'connecting',
  attention: 'attention', failed: 'failed', off: 'off',
})

export const STATUS_TEXT = Object.freeze({
  en: Object.freeze({
    line: Object.freeze({
      [LS.connected]: 'Connected to the target DSH.',
      [LS.unset]: 'No target is set.',
      [LS.unreachable]: 'The target DSH cannot be reached.',
      [LS.refused]: 'The target refused Fishball\'s credential.',
      [CS.needsAuthorization]: 'Fishball is not connected to the target yet.',
      [CS.authorizing]: 'Finish on the approval page.',
      [CS.needsConfiguration]: 'Connect needs configuration.',
      [CS.failed]: 'Connect failed.',
      [OFF]: 'Fishball is off in this DSH.',
    }),
    code: (text, code) => `${text} (${code})`,
    guards: (list) => `Guards overridden: ${list}.`,
    set: (list) => `Plugins enabled but not loaded: ${list}.`,
    reason: Object.freeze({ [RS.skipped]: 'skipped', [RS.failed]: 'failed to start' }),
    member: (name, reason) => `${name} (${reason})`,
    // UI-POLISH-F: a compact chip beside the card's heading; the sentence moved to `card.toolsHint`.
    tools: (count) => (count === 1 ? '1 contributed tool' : `${count} contributed tools`),
    separator: ', ',
    control: Object.freeze({ [SEAM_STATUS.control.connect]: 'Connect', [SEAM_STATUS.control.cancel]: 'Cancel' }),
    card: Object.freeze({
      title: 'Target DSH',
      offTitle: 'Fishball',
      toolsHint: 'Contributed tools offered to Fishball\'s model',
      openApproval: 'Open the approval page',
      badge: Object.freeze({
        [CARD.connected]: 'Connected', [CARD.unset]: 'Not set', [CARD.disconnected]: 'Not connected', [CARD.connecting]: 'Connecting',
        [CARD.attention]: 'Needs setup', [CARD.failed]: 'Failed', [CARD.off]: 'Off',
      }),
    }),
  }),
  zh: Object.freeze({
    line: Object.freeze({
      [LS.connected]: '已连接到目标 DSH。',
      [LS.unset]: '尚未设置目标。',
      [LS.unreachable]: '无法连接到目标 DSH。',
      [LS.refused]: '目标拒绝了 Fishball 的凭据。',
      [CS.needsAuthorization]: 'Fishball 尚未连接到目标。',
      [CS.authorizing]: '请在授权页面上完成操作。',
      [CS.needsConfiguration]: '连接需要配置。',
      [CS.failed]: '连接失败。',
      [OFF]: '此 DSH 中的 Fishball 已关闭。',
    }),
    code: (text, code) => `${text}（${code}）`,
    guards: (list) => `已被覆盖的防护：${list}。`,
    set: (list) => `已启用但未加载的插件：${list}。`,
    reason: Object.freeze({ [RS.skipped]: '已跳过', [RS.failed]: '启动失败' }),
    member: (name, reason) => `${name}（${reason}）`,
    tools: (count) => `${count} 个贡献工具`,
    separator: '、',
    control: Object.freeze({ [SEAM_STATUS.control.connect]: '连接', [SEAM_STATUS.control.cancel]: '取消' }),
    card: Object.freeze({
      title: '目标 DSH',
      offTitle: 'Fishball',
      toolsHint: '提供给 Fishball 模型的贡献工具',
      openApproval: '打开授权页面',
      badge: Object.freeze({
        [CARD.connected]: '已连接', [CARD.unset]: '未设置', [CARD.disconnected]: '未连接', [CARD.connecting]: '连接中',
        [CARD.attention]: '需要配置', [CARD.failed]: '失败', [CARD.off]: '已关闭',
      }),
    }),
  }),
})

/** The language a strip falls back to. */
export const STATUS_DEFAULT_LANG = 'en'
