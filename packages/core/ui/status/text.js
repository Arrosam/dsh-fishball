/**
 * The status strip's copy (task F-STATUS; R-FB-03, R-FB-04, R-FB-09, R-FB-10, R-BND-05, R-EXT-14;
 * design §6.3a). PROPOSED wording, reviewed with the pairing copy (W3 question P-3). Data only:
 * frozen strings and pure template formatters that interpolate names, codes and numbers only.
 *
 * `line` keys are the strip's line kinds: the link's states (`LINK.state`), Connect's states
 * (`CONNECT.state`) and `fishball-off`. A code is shown verbatim after the word (`code`), because
 * the codes are the documented words a user can look up (K3 `LinkCode`, `ConnectConfigurationCode`).
 * fishball-ui moves this file with the strip (F-UI).
 */
export const STATUS_TEXT = Object.freeze({
  en: Object.freeze({
    line: Object.freeze({
      'connected': 'Connected to the target DSH.',
      'target-unset': 'No target is set.',
      'target-unreachable': 'The target DSH cannot be reached.',
      'token-refused': 'The target refused Fishball\'s credential.',
      'needs-authorization': 'Fishball is not connected to the target yet.',
      'authorizing': 'Finish on the approval page.',
      'needs-configuration': 'Connect needs configuration.',
      'failed': 'Connect failed.',
      'fishball-off': 'Fishball is off in this DSH.',
    }),
    code: (text, code) => `${text} (${code})`,
    guards: (list) => `Guards overridden: ${list}.`,
    set: (list) => `Plugins enabled but not loaded: ${list}.`,
    member: (name, reason) => `${name} (${reason})`,
    tools: (count) => `${count} contributed tools are offered to Fishball's model.`,
    separator: ', ',
    control: Object.freeze({ connect: 'Connect', cancel: 'Cancel' }),
  }),
  zh: Object.freeze({
    line: Object.freeze({
      'connected': '已连接到目标 DSH。',
      'target-unset': '尚未设置目标。',
      'target-unreachable': '无法连接到目标 DSH。',
      'token-refused': '目标拒绝了 Fishball 的凭据。',
      'needs-authorization': 'Fishball 尚未连接到目标。',
      'authorizing': '请在授权页面上完成操作。',
      'needs-configuration': '连接需要配置。',
      'failed': '连接失败。',
      'fishball-off': '此 DSH 中的 Fishball 已关闭。',
    }),
    code: (text, code) => `${text}（${code}）`,
    guards: (list) => `已被覆盖的防护：${list}。`,
    set: (list) => `已启用但未加载的插件：${list}。`,
    member: (name, reason) => `${name}（${reason}）`,
    tools: (count) => `Fishball 的模型可使用 ${count} 个贡献工具。`,
    separator: '、',
    control: Object.freeze({ connect: '连接', cancel: '取消' }),
  }),
})

/** The language a strip falls back to. */
export const STATUS_DEFAULT_LANG = 'en'
