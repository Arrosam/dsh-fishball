/**
 * The status strip's copy (task F-STATUS; R-FB-03, R-FB-04, R-FB-09, R-FB-10, R-BND-05, R-EXT-14;
 * design §6.3a). PROPOSED wording, reviewed with the pairing copy (W3 question P-3). Data only:
 * frozen strings and pure template formatters that interpolate names, codes and numbers only.
 *
 * `line` keys are the strip's line kinds: the link's states (`LINK.state`), Connect's states
 * (`CONNECT.state`) and `fishball-off`, computed from those constants so a rename cannot drift.
 * `reason` keys are `STATUS_MODEL.reason`. A code is shown verbatim after the word (`code`),
 * because the codes are the documented words a user can look up (K3 `LinkCode`,
 * `ConnectConfigurationCode`, the plugin manager's error codes). fishball-ui moves this file with
 * the strip (F-UI).
 */
import { CONNECT, LINK } from '../../contracts/constants.js'
import { STATUS_MODEL } from '../../src/status/constants.js'

const { state: LS } = LINK
const { state: CS } = CONNECT
const { reason: RS } = STATUS_MODEL
const OFF = STATUS_MODEL.fishball.off

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
    tools: (count) => (count === 1 ? '1 contributed tool is offered to Fishball\'s model.' : `${count} contributed tools are offered to Fishball's model.`),
    separator: ', ',
    control: Object.freeze({ [STATUS_MODEL.control.connect]: 'Connect', [STATUS_MODEL.control.cancel]: 'Cancel' }),
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
    tools: (count) => `Fishball 的模型可使用 ${count} 个贡献工具。`,
    separator: '、',
    control: Object.freeze({ [STATUS_MODEL.control.connect]: '连接', [STATUS_MODEL.control.cancel]: '取消' }),
  }),
})

/** The language a strip falls back to. */
export const STATUS_DEFAULT_LANG = 'en'
