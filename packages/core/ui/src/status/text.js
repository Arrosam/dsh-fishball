/**
 * The sidebar targets' copy (MULTI-3; first F-STATUS's strip copy: R-FB-03, R-FB-04, R-FB-09,
 * R-FB-10, R-BND-05, R-EXT-14; design §6.3a). Data only: frozen strings and pure template formatters
 * that interpolate names, codes and numbers only.
 *
 * `line` keys are the link's states (`SEAM_STATUS.link`), Connect's states (`SEAM_STATUS.connect`)
 * and `fishball-off`, computed from those constants so a rename cannot drift; their words are the
 * strip's, unchanged. A code is shown verbatim after the word (`code`): the codes are the documented
 * words a user can look up. `state` keys are the four public states (`SEAM_TARGETS.state`),
 * `placeholder` keys `SEAM_TARGETS.placeholder` (Q01: the user's "未设置/名字未知"), `identity` keys
 * `SEAM_TARGETS.identity`. `words` are the sidebar's own labels.
 *
 * `words.sessions` (the heading of a target's running managed sessions) and `untitledSession` (a
 * session the connector sent no title for): PROPOSED wording, en and zh, for the user's review.
 */
import { SEAM_STATUS, SEAM_TARGETS } from 'fishball-shared/ui-seam'

const { link: LS, connect: CS, reason: RS } = SEAM_STATUS
const { state: TS, placeholder: PH, identity: ID } = SEAM_TARGETS
const OFF = SEAM_STATUS.fishball.off

export const STATUS_TEXT = Object.freeze({
  en: Object.freeze({
    title: 'DSH targets',
    empty: 'No DSH target yet. Targets are added in Fishball settings.',
    line: Object.freeze({
      [LS.connected]: 'Connected to this DSH.',
      [LS.unset]: 'No target address is set.',
      [LS.unreachable]: 'This DSH cannot be reached.',
      [LS.refused]: 'This DSH refused Fishball\'s credential.',
      [CS.needsAuthorization]: 'Fishball is not connected to this DSH yet.',
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
    tools: (count) => (count === 1 ? '1 contributed tool offered' : `${count} contributed tools offered`),
    separator: ', ',
    control: Object.freeze({ [SEAM_STATUS.control.connect]: 'Connect', [SEAM_STATUS.control.cancel]: 'Cancel' }),
    retry: 'Retry',
    state: Object.freeze({ [TS.connected]: 'Connected', [TS.connecting]: 'Connecting', [TS.failed]: 'Failed', [TS.notSet]: 'Not set' }),
    placeholder: Object.freeze({ [PH.unset]: 'Not set', [PH.unnamed]: 'Name unavailable' }),
    identity: Object.freeze({
      [ID.pending]: 'Live name: waiting for the first answer.',
      [ID.live]: 'Live name: updates as this DSH renames.',
      [ID.unsupported]: 'Live name: not offered by this DSH; read at each connection.',
      [ID.stale]: 'Live name: the last refresh failed; showing the last known name.',
    }),
    words: Object.freeze({
      address: 'Address',
      openApproval: 'Open the approval page',
      settings: 'Fishball settings',
      sessions: 'Running sessions',
    }),
    untitledSession: 'Untitled session',
  }),
  zh: Object.freeze({
    title: 'DSH 目标',
    empty: '还没有 DSH 目标。可在 Fishball 设置中添加。',
    line: Object.freeze({
      [LS.connected]: '已连接到此 DSH。',
      [LS.unset]: '尚未设置目标地址。',
      [LS.unreachable]: '无法连接到此 DSH。',
      [LS.refused]: '此 DSH 拒绝了 Fishball 的凭据。',
      [CS.needsAuthorization]: 'Fishball 尚未连接到此 DSH。',
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
    tools: (count) => `已提供 ${count} 个贡献工具`,
    separator: '、',
    control: Object.freeze({ [SEAM_STATUS.control.connect]: '连接', [SEAM_STATUS.control.cancel]: '取消' }),
    retry: '重试',
    state: Object.freeze({ [TS.connected]: '已连接', [TS.connecting]: '连接中', [TS.failed]: '失败', [TS.notSet]: '未设置' }),
    placeholder: Object.freeze({ [PH.unset]: '未设置', [PH.unnamed]: '名字未知' }),
    identity: Object.freeze({
      [ID.pending]: '实时名称：等待首次应答。',
      [ID.live]: '实时名称：此 DSH 改名时随之更新。',
      [ID.unsupported]: '实时名称：此 DSH 不提供；每次连接时读取。',
      [ID.stale]: '实时名称：上次刷新失败；显示最后已知的名称。',
    }),
    words: Object.freeze({
      address: '地址',
      openApproval: '打开授权页面',
      settings: 'Fishball 设置',
      sessions: '运行中的会话',
    }),
    untitledSession: '未命名会话',
  }),
})

/** The language the view falls back to. */
export const STATUS_DEFAULT_LANG = 'en'
