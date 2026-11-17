/**
 * dsh-connector's browser half: its own plugin settings page, and nothing else (task
 * C-TOKENS-REVEAL; design §5.9; requirements 1.27, 1.28 R2; R-ARCH-03, R-CON-10, R-TOK-03, R-TOK-11).
 *
 * By the user's rule a plugin's own settings page is not "UI" ("不带UI的意思是不影响dsh本身的UI"), so
 * this entry registers exactly one thing: the Plugins page's `plugins.row.config` entry for the
 * connector's own row, `dsh-agent-connector#dsh-connector`, while DSH serves that row's settings. No
 * sidebar, no other slot, no style element; it works with dsh-connector-ui uninstalled.
 *
 * The page shows the tokens list (label, switch, delete, reorder; one Save writes the list through
 * the row's DSH config form, so every list edit is an ordinary settings save the connector's sync
 * checks), a label field with **New token**, the duplicate notice (R3, R5), and the reveal modal.
 *
 * The reveal (R-TOK-11): New token POSTs `{label}` to the connector's owner-only create route; its
 * one answer carries the value. The value lives only in the modal's state, shown with **Copy** and
 * **Close** (Close works at any time, 1.33 Q-D3 B); closing drops it and nothing re-opens it. It is
 * never put in a URL, the settings document, the console or storage. The list refreshes from the
 * config form, which shows the new entry without a value.
 *
 * C-WIRE mounts it (the package's `dsh.client`) and adds, on the same page, the read-only pair state
 * of each entry (R-ID-12), the approval port with the approval listener's status (R-OA-20), the
 * DSH name the approval page shows (C-WIRE-2; the user, 2026-11-17), and the connector's limits, which moved here
 * from dsh-connector-ui's card (decided item 55). Every edit is a save of the row's settings
 * through DSH's form, as the token list's. The strings are this file's dictionaries: DSH's client loads no JSON, and the package's
 * locale/*.json hold only the Plugins page's `meta` text.
 */
/**
 * The package's npm name (the user, 2026-11-17: `dsh-connector` is taken on npm). The Loader
 * registers a package's client under it (dsh-client-modules graphRow), and the settings slot key
 * starts with it; the row id below did not change.
 */
const PACKAGE_NAME = 'dsh-agent-connector'

window.__ModuleLoader__.load({
  id: PACKAGE_NAME,
  factory(require) {
    const React = require('react')
    // DSH's own primitives and icons (the same exports on 0.2.1-rc.5 and 0.2.2-rc.1): the page
    // draws no control of its own, so focus rings, hover, disabled and both themes are DSH's.
    const {
      Button, Input, Modal, StateDot, Switch,
      IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular,
      IconCopyOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, IconWarningOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /**
     * The row's identity (design §5.9): the slot key is `<package>#<row id>`, DSH's rowConfigKey
     * (dsh-client-ui-plugin-manager). The row id is the settings namespace DSH serves and stays
     * `dsh-connector`; the package is `dsh-agent-connector` since the npm rename (the user,
     * 2026-11-17). `tokensField` is the settings list.
     */
    const PAGE = Object.freeze({
      id: 'dsh-connector',
      packageName: PACKAGE_NAME,
      slot: 'plugins.row.config',
      locale: 'dsh-connector-tokens',
      tokensField: 'tokens',
      pageView: 'page',
      /** ConfigFormSnapshot.status when DSH does not serve the row's settings to this client. */
      unavailable: 'unavailable',
      /** ConfigFormSnapshot.status before the first accepted section. */
      loading: 'loading',
      effect: Object.freeze({ locale: 'dsh-connector: settings page words', page: 'dsh-connector: settings page' }),
    })
    /**
     * The host half's routes, page-relative: the same paths as src/settings-page/constants.js
     * without the leading `/`. A browser chunk cannot import that Node module, so they are written
     * here once more: change both together.
     */
    const ROUTE = Object.freeze({
      create: 'api/dsh-connector/tokens/create',
      notice: 'api/dsh-connector/tokens/notice',
      state: 'api/dsh-connector/settings/state',
      post: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }) }),
      get: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      /** The answer that could not be read: shown as this code. */
      unreadable: 'request-failed',
    })
    /** Settings-path writes (dsh-settings SettingsPathOpView). */
    const OP_SET = 'set'
    const OP_UNSET = 'unset'
    /**
     * The other V3 settings, by their path in the row's config (src/settings/constants.js SETTING;
     * a browser chunk cannot import it, so the paths are written here once more: change both together).
     */
    const SETTING_PATH = Object.freeze({ approvalPort: Object.freeze(['approval', 'port']), dshName: Object.freeze(['approval', 'dshName']) })
    /** The `approval.port` bounds (src/settings/constants.js PORT_RANGE). */
    const PORT_RANGE = Object.freeze({ min: 0, max: 65535 })
    /** The approval listener's healthy status (mcp/oauth-web LISTENER_STATUS.ok); any other is shown as its code. */
    const LISTENER_OK = 'ok'
    /** The approval status words' key prefix (one key per CONNECTOR_STATUS code). */
    const APPROVAL_STATUS_KEY = 'approval.'
    /** Scripting hooks (data attributes) for the page's parts. */
    const DATA = Object.freeze({
      root: 'data-dsh-connector-tokens',
      row: 'data-dsh-connector-token-row',
      newLabel: 'data-dsh-connector-new-label',
      newToken: 'data-dsh-connector-new-token',
      notice: 'data-dsh-connector-notice',
      reveal: 'data-dsh-connector-reveal',
      copy: 'data-dsh-connector-copy',
      pair: 'data-dsh-connector-pair',
      connected: 'data-dsh-connector-connected',
      approval: 'data-dsh-connector-approval',
      limits: 'data-dsh-connector-limits',
      setting: 'data-dsh-connector-setting',
    })
    /** Stands for a `{name}` that is a node (withName): a character no dictionary or name holds. */
    const NAME_SLOT = '{name}'
    /** The key that saves a number field, as its blur does. */
    const ENTER_KEY = 'Enter'
    /** Every limit's minimum (src/config.js MIN.count): the Host's schema refuses anything below it. */
    const LIMIT_MIN = 1
    /**
     * The connector's limits, in src/config.js LIMITS order. A browser chunk cannot import that
     * Node module, so the field names are written here once more: change both together.
     */
    const LIMIT_FIELDS = Object.freeze(['maxQueuedInputs', 'argumentExcerptBytes', 'maxMessageBytes', 'readSessionMessages', 'readSessionBytes'])
    /**
     * Inline layout: the page adds no style sheet (R-ARCH-03), so every rule is an inline style and
     * every interactive state (focus, hover, disabled) comes from DSH's primitives. Colours, fonts and
     * radii are DSH's theme tokens (dsh-client-ui-theme), so light and dark both follow DSH. DSH has
     * no spacing tokens; the gaps copy its Plugins page (detailSections 32px, detailSection 12px) and
     * its settings field (SettingsValueField: 12px rows, 6px inside, a 0.5px l2 rule between rows).
     * The page is three sections (tokens, the approval page, the limits), each a titled card of rows,
     * so it reads as one of DSH's own settings pages.
     */
    const GAP = Object.freeze({ page: '32px', section: '12px', row: '12px', item: '8px', tight: '6px', column: '24px', icon: '4px' })
    const SIZE = Object.freeze({ control: '240px', iconButton: '28px', dot: 8, icon: 14, noticeIcon: 16 })
    const TOKEN = Object.freeze({
      label: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      tertiary: 'var(--dsw-alias-label-tertiary)',
      error: 'var(--dsw-alias-state-error-primary)',
      rule: '.5px solid var(--dsw-alias-border-l2)',
      frame: '.5px solid var(--dsw-alias-border-l3)',
      card: 'var(--dsw-alias-bg-layer-1)',
      code: 'var(--dsw-alias-markdown-code-block)',
      codeFont: 'var(--dsw-font-markdown-code-font-family)',
      radius: 'var(--dsw-radius-md)',
      radiusSmall: 'var(--dsw-radius-sm)',
      body: 'var(--dsw-font-xs-13)',
      // DSH's danger tint (its Tag's `danger` tone mixes the error colour at 10%).
      errorTint: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)',
      errorFrame: '.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent)',
      errorBar: '3px solid var(--dsw-alias-state-error-primary)',
    })
    /** DSH's type steps the page uses (its settings field: 12/18 captions, 13/20 body, 14/20 headings). */
    const TYPE = Object.freeze({
      caption: Object.freeze({ fontSize: '12px', lineHeight: '18px' }),
      body: Object.freeze({ fontSize: '13px', lineHeight: '20px' }),
      heading: Object.freeze({ fontSize: '14px', lineHeight: '20px', fontWeight: 500 }),
    })
    /** One setting row's grid: its words on the left, its control on the right (DSH's settings rows). */
    const ROW_AREA = Object.freeze({ title: 'title', hint: 'hint', control: 'control', error: 'error' })
    const STYLE = Object.freeze({
      page: Object.freeze({ display: 'grid', gap: GAP.page, color: TOKEN.label, font: TOKEN.body }),
      section: Object.freeze({ display: 'grid', gap: GAP.section, minWidth: 0 }),
      head: Object.freeze({ display: 'flex', alignItems: 'baseline', gap: GAP.item }),
      heading: Object.freeze({ margin: 0, ...TYPE.heading }),
      count: Object.freeze({ color: TOKEN.secondary, ...TYPE.caption }),
      lead: Object.freeze({ margin: 0, color: TOKEN.secondary, ...TYPE.caption }),
      hint: Object.freeze({ margin: 0, color: TOKEN.tertiary, ...TYPE.caption }),
      error: Object.freeze({ margin: 0, color: TOKEN.error, ...TYPE.caption }),
      card: Object.freeze({ display: 'grid', minWidth: 0, border: TOKEN.frame, borderRadius: TOKEN.radius, background: TOKEN.card, overflow: 'hidden' }),
      list: Object.freeze({ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }),
      cardRow: Object.freeze({ padding: `${GAP.row} 16px`, minWidth: 0 }),
      cardRule: Object.freeze({ borderTop: TOKEN.rule }),
      empty: Object.freeze({ margin: 0, padding: '20px 16px', textAlign: 'center', color: TOKEN.tertiary }),
      tokenRow: Object.freeze({ display: 'flex', alignItems: 'center', gap: GAP.row, minWidth: 0 }),
      tokenMain: Object.freeze({ display: 'grid', gap: GAP.tight, flex: 1, minWidth: 0 }),
      tokenTools: Object.freeze({ display: 'flex', alignItems: 'center', gap: GAP.icon, flex: 'none' }),
      switchGap: Object.freeze({ marginInlineEnd: GAP.item, display: 'inline-flex' }),
      iconButton: Object.freeze({ width: SIZE.iconButton, padding: 0 }),
      pair: Object.freeze({ display: 'flex', alignItems: 'center', gap: GAP.tight, color: TOKEN.tertiary, ...TYPE.caption, minWidth: 0, overflowWrap: 'anywhere' }),
      addRow: Object.freeze({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: GAP.item }),
      actions: Object.freeze({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: GAP.item }),
      setting: Object.freeze({
        display: 'grid', gridTemplateColumns: `minmax(0, 1fr) minmax(0, ${SIZE.control})`, columnGap: GAP.column, rowGap: '2px', alignItems: 'center',
        gridTemplateAreas: `"${ROW_AREA.title} ${ROW_AREA.control}" "${ROW_AREA.hint} ${ROW_AREA.control}" "${ROW_AREA.hint} ${ROW_AREA.error}"`,
      }),
      // The label stays the input's label (its text names the field) while its parts take the row's grid.
      settingLabel: Object.freeze({ display: 'contents' }),
      settingTitle: Object.freeze({ gridArea: ROW_AREA.title, fontWeight: TYPE.heading.fontWeight, lineHeight: TYPE.body.lineHeight }),
      settingHint: Object.freeze({ gridArea: ROW_AREA.hint, display: 'grid', gap: GAP.icon, alignSelf: 'start' }),
      settingControl: Object.freeze({ gridArea: ROW_AREA.control, display: 'grid', minWidth: 0 }),
      settingError: Object.freeze({ gridArea: ROW_AREA.error, display: 'grid', color: TOKEN.error, ...TYPE.caption }),
      status: Object.freeze({ margin: 0, display: 'flex', alignItems: 'center', gap: GAP.tight, ...TYPE.caption }),
      // The words in the label colour (full contrast on the tint); the error colour is the tint, the
      // frame, the start bar and the icon, so the box still reads as an error.
      notice: Object.freeze({ margin: 0, display: 'flex', alignItems: 'flex-start', gap: GAP.item, padding: '10px 12px', border: TOKEN.errorFrame, borderInlineStart: TOKEN.errorBar, borderRadius: TOKEN.radiusSmall, background: TOKEN.errorTint, color: TOKEN.label, lineHeight: TYPE.body.lineHeight }),
      noticeIcon: Object.freeze({ flex: 'none', marginTop: '2px', color: TOKEN.error }),
      revealBody: Object.freeze({ display: 'grid', gap: GAP.section }),
      value: Object.freeze({ margin: 0, padding: '12px 14px', border: TOKEN.frame, borderRadius: TOKEN.radiusSmall, background: TOKEN.code, fontFamily: TOKEN.codeFont, ...TYPE.body, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', userSelect: 'all' }),
    })
    /** DSH's StateDot states the pair line and the listener line use (dsh-client-ui-primitives StateDot). */
    const DOT = Object.freeze({ on: 'done', off: 'idle', problem: 'error' })
    /** What the page is doing: one action at a time, each with its own button text. */
    const BUSY = Object.freeze({ none: null, saving: 'saving', creating: 'creating' })
    /** The Copy button's outcome, by its message key. */
    const COPY = Object.freeze({ done: 'copied', failed: 'copyFailed' })
    /** Separates a duplicated entry key from a row index in a React key. */
    const DUPLICATE_ROW = '#'
    /** A step in the list for the reorder buttons. */
    const MOVE = Object.freeze({ up: -1, down: 1 })

    const en = {
      summary: 'Tokens for agents that connect to this DSH.',
      tokens: 'Tokens',
      approvalSection: 'Approval page',
      loading: 'Loading…',
      hint: 'Each agent gets its own token. A token is shown once, when it is created; nobody can view or edit it afterwards. To replace a token, delete it and create a new one.',
      empty: 'No tokens yet.',
      label: 'Label',
      enabled: 'On',
      up: 'Move up',
      down: 'Move down',
      remove: 'Delete',
      save: 'Save',
      saving: 'Saving…',
      discard: 'Discard',
      saveFailed: 'The settings were not saved.',
      readOnly: 'This deployment stores settings read-only.',
      unavailable: 'The connector is not loaded, so its tokens cannot be managed right now.',
      newLabel: 'Label for the new token',
      newToken: 'New token',
      creating: 'Creating…',
      createFailed: 'No token was created ({code}).',
      notice: 'These tokens are duplicated or were added by hand, so they refuse service until this is fixed: {labels}. Delete them and create new ones.',
      noticeSeparator: '; ',
      labelSeparator: ', ',
      revealTitle: 'Your new token',
      revealHint: 'Copy it now: this is the only time it is shown. If you lose it, delete the token and create a new one.',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy failed; select the token and copy it by hand.',
      close: 'Close',
      paired: 'Paired as {name}',
      unpaired: 'Not paired',
      connected: 'connected',
      offline: 'not connected',
      lastSeen: 'last seen {at}',
      neverSeen: 'never seen',
      idPrefix: 'ID:',
      dshName: 'DSH name',
      dshNameHint: 'The name the approval page shows for this DSH. Empty: it shows this DSH\'s address.',
      approvalPort: 'Approval page port',
      approvalHint: 'Browser agents sign in on this port of DSH\'s host.',
      approvalStatus: 'Approval page: {status}',
      approvalOk: 'listening on port {port}',
      'approval.approval-port-in-use': 'the port is in use; it is tried again every 30 seconds. Choose another port or free this one.',
      limits: 'Safety limits',
      invalid: 'Enter a whole number.',
      'field.maxQueuedInputs': 'Events queued for an agent and not yet taken',
      'field.argumentExcerptBytes': 'Bytes of a request\'s call the managing agent sees',
      'field.maxMessageBytes': 'Bytes in one message',
      'field.readSessionMessages': 'Messages session_read returns',
      'field.readSessionBytes': 'Bytes session_read returns',
    }
    const zh = {
      summary: '连接到此 DSH 的 agent 所用的 token。',
      tokens: 'Token',
      approvalSection: '授权页面',
      loading: '加载中…',
      hint: '每个 agent 使用自己的 token。token 只在创建时显示一次，之后任何人都无法查看或修改。要更换 token，请删除它并新建一个。',
      empty: '还没有 token。',
      label: '标签',
      enabled: '启用',
      up: '上移',
      down: '下移',
      remove: '删除',
      save: '保存',
      saving: '保存中…',
      discard: '放弃',
      saveFailed: '设置没有保存。',
      readOnly: '本部署的设置是只读的。',
      unavailable: '连接器未加载，暂时无法管理它的 token。',
      newLabel: '新 token 的标签',
      newToken: '新建 token',
      creating: '正在创建…',
      createFailed: '没有创建 token（{code}）。',
      notice: '这些 token 重复或是手动添加的，在修复之前拒绝服务：{labels}。请删除它们并新建。',
      noticeSeparator: '；',
      labelSeparator: '、',
      revealTitle: '你的新 token',
      revealHint: '请现在复制：它只显示这一次。如果丢失，请删除该 token 并新建一个。',
      copy: '复制',
      copied: '已复制',
      copyFailed: '复制失败；请选中 token 手动复制。',
      close: '关闭',
      paired: '已配对为 {name}',
      unpaired: '未配对',
      connected: '已连接',
      offline: '未连接',
      lastSeen: '最近一次 {at}',
      neverSeen: '从未连接',
      idPrefix: 'ID:',
      dshName: 'DSH 名称',
      dshNameHint: '授权页面为此 DSH 显示的名称。留空则显示此 DSH 的地址。',
      approvalPort: '授权页面端口',
      approvalHint: '浏览器 agent 在 DSH 主机的这个端口上登录。',
      approvalStatus: '授权页面：{status}',
      approvalOk: '正在监听端口 {port}',
      'approval.approval-port-in-use': '端口被占用；每 30 秒重试一次。请换一个端口或释放此端口。',
      limits: '安全限制',
      invalid: '请输入整数。',
      'field.maxQueuedInputs': '为 agent 排队、尚未取走的事件',
      'field.argumentExcerptBytes': '管理 agent 可见的请求调用字节数',
      'field.maxMessageBytes': '单条消息字节数',
      'field.readSessionMessages': 'session_read 返回的消息数',
      'field.readSessionBytes': 'session_read 返回的字节数',
    }

    const routeUrl = (path) => new URL(path, document.baseURI).toString()
    /** One call to the host half: its JSON answer, or `{ok: false, code}` when it cannot be read. */
    async function call(path, init) {
      try {
        const answer = await (await fetch(routeUrl(path), init)).json()
        if (answer !== null && typeof answer === 'object' && typeof answer.ok === 'boolean') return answer
      } catch { /* unreachable or unreadable: the code below */ }
      return { ok: false, code: ROUTE.unreadable }
    }

    /** The settings list as the page edits it: `{label, enabled, key}` items only. */
    const listOf = (value) => (Array.isArray(value?.[PAGE.tokensField]) ? value[PAGE.tokensField] : [])
      .map((item) => ({ label: typeof item?.label === 'string' ? item.label : '', enabled: item?.enabled === true, key: typeof item?.key === 'string' ? item.key : '' }))
    const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b)

    /** The duplicate notice (R3, R5): labels only, one group per problem, in DSH's danger tint. */
    function Notice({ t, notice }) {
      if (notice === null) return null
      const labels = notice.labels.map((group) => group.join(t('labelSeparator'))).join(t('noticeSeparator'))
      return h('p', { style: STYLE.notice, role: 'alert', [DATA.notice]: notice.code },
        // DSH's icons take no style prop, so the glyph's offset sits on a wrapper.
        h('span', { style: STYLE.noticeIcon, 'aria-hidden': true }, h(IconWarningOutlineRegular, { size: SIZE.noticeIcon })),
        h('span', null, t('notice', { labels })))
    }

    /**
     * The one-time reveal (AUTH-ST-08): open while `value` is set. Copy writes the clipboard; Close
     * calls `onClose`, which drops the value from the page.
     */
    function Reveal({ t, value, onClose }) {
      const [copy, setCopy] = React.useState(null)
      const copyValue = async () => {
        try { await navigator.clipboard.writeText(value); setCopy(COPY.done) } catch { setCopy(COPY.failed) }
      }
      // A done copy swaps Copy's glyph for a check; the words stay, and the status line says it.
      const copied = copy === COPY.done
      return h(Modal, {
        open: true,
        onClose,
        closeLabel: t('close'),
        title: t('revealTitle'),
        footer: h(React.Fragment, null,
          h(Button, { type: 'button', variant: 'outline', icon: h(copied ? IconCheckOutlineRegular : IconCopyOutlineRegular, { size: SIZE.icon }), [DATA.copy]: true, onClick: () => void copyValue() }, t('copy')),
          h(Button, { type: 'button', variant: 'primary', onClick: onClose }, t('close'))),
      },
        h('div', { style: STYLE.revealBody },
          h('p', { style: STYLE.lead }, t('revealHint')),
          h('pre', { style: STYLE.value, [DATA.reveal]: true }, value),
          copy === null ? null : h('p', { style: copied ? STYLE.hint : STYLE.error, role: 'status' }, t(copy))))
    }

    /**
     * An entry's read-only pair state (R-ID-12, AUTH-UC-09): paired or not, its name (or a bold
     * `ID:` and its id, R-NAME-08), whether it is connected now and when it was last seen. React
     * escapes the name, so markup in it is shown, never run. DSH's StateDot leads a paired line
     * (green connected, grey not); the words say the same, so colour is not the only signal.
     */
    function PairState({ t, row }) {
      if (row === undefined || !row.paired) return h('span', { style: STYLE.pair, [DATA.pair]: 'unpaired' }, t('unpaired'))
      const name = row.name ?? h(React.Fragment, null, h('strong', null, t('idPrefix')), ' ', row.id)
      const seen = row.lastSeenAt === null ? t('neverSeen') : t('lastSeen', { at: new Date(row.lastSeenAt).toLocaleString() })
      return h('span', { style: STYLE.pair, [DATA.pair]: 'paired', [DATA.connected]: row.connected },
        h(StateDot, { state: row.connected ? DOT.on : DOT.off, size: SIZE.dot }),
        h('span', null, withName(t('paired'), name), ' · ', t(row.connected ? 'connected' : 'offline'), ' · ', seen))
    }
    /** `text` with its `{name}` replaced by the node `name` (a name is never formatted into a string). */
    function withName(text, name) {
      const at = text.indexOf(NAME_SLOT)
      return at < 0 ? text : h(React.Fragment, null, text.slice(0, at), name, text.slice(at + NAME_SLOT.length))
    }

    /** A card row's style: every row after the first carries the l2 rule above it (DSH's settings list). */
    const RULED_ROW = Object.freeze({ ...STYLE.cardRow, ...STYLE.cardRule })
    const cardRowStyle = (index) => (index === 0 ? STYLE.cardRow : RULED_ROW)

    /** An icon-only ghost button: its words are its name and tooltip, so it reads the same without the glyph. */
    const iconButton = (Icon, label, props) => h(Button, { type: 'button', size: 'sm', variant: 'ghost', 'aria-label': label, title: label, style: STYLE.iconButton, ...props }, h(Icon, { size: SIZE.icon }))

    /**
     * One list row: the label and its pair state, then the switch, reorder and delete, all staged
     * until Save; the pair state is read only.
     */
    function TokenRow({ t, item, index, count, disabled, edit, pair }) {
      return h('li', { style: { ...cardRowStyle(index), ...STYLE.tokenRow }, [DATA.row]: item.key },
        h('div', { style: STYLE.tokenMain },
          h(Input, { type: 'text', 'aria-label': t('label'), value: item.label, disabled, onChange: (event) => edit.label(index, event.target.value) }),
          h(PairState, { t, row: pair })),
        h('div', { style: STYLE.tokenTools },
          h('span', { style: STYLE.switchGap }, h(Switch, { checked: item.enabled, label: t('enabled'), title: t('enabled'), disabled, onChange: (on) => edit.enabled(index, on) })),
          iconButton(IconChevronUpOutlineRegular, t('up'), { disabled: disabled || index === 0, onClick: () => edit.move(index, MOVE.up) }),
          iconButton(IconChevronDownOutlineRegular, t('down'), { disabled: disabled || index === count - 1, onClick: () => edit.move(index, MOVE.down) }),
          iconButton(IconTrashOutlineRegular, t('remove'), { disabled, onClick: () => edit.remove(index) })))
    }

    /** A titled section of the page (DSH's Plugins page section: a heading, an optional count, then its parts). */
    const section = (title, count, data, ...children) => h('section', { style: STYLE.section, ...data },
      h('div', { style: STYLE.head }, h('h3', { style: STYLE.heading }, title), count === undefined ? null : h('span', { style: STYLE.count }, count)),
      ...children)

    /** A card of rows (DSH's settings list on a layer-1 surface): each child is one row. */
    const card = (rows) => h('div', { style: STYLE.card }, rows.map((row, index) => h('div', { key: row.key ?? index, style: cardRowStyle(index) }, row)))

    /**
     * One setting row, DSH's settings layout: its title and hint on the left, its control on the
     * right, its errors under the control. The `label` wraps the title and the control (so the title
     * names the field); it is `display: contents`, so its parts sit in the row's grid.
     */
    function SettingRow({ data, title, hint, control, errors }) {
      return h('div', { style: STYLE.setting },
        h('label', { style: STYLE.settingLabel, [DATA.setting]: data },
          h('span', { style: STYLE.settingTitle }, title),
          h('span', { style: STYLE.settingControl }, control)),
        // Outside the label, so an alert never becomes part of the input's accessible name.
        errors.some(Boolean) ? h('span', { style: STYLE.settingError }, ...errors) : null,
        hint === null ? null : h('div', { style: STYLE.settingHint }, hint))
    }

    /**
     * One single-field setting saved on its own (the approval port, the DSH name, each limit): the row's config form, fenced by the revision it was read at, as the list's Save.
     * @returns `{busy, failed, save(ops)}`
     */
    function useFieldSave(form, snapshot) {
      const [busy, setBusy] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const save = async (ops) => {
        setBusy(true)
        let accepted = false
        try { accepted = await form.mutate(ops, snapshot.revision) } catch { accepted = false }
        setBusy(false)
        setFailed(!accepted)
        return accepted
      }
      return { busy, failed, save }
    }

    /** The value at `path` in the row's settings value. */
    const valueAt = (value, path) => path.reduce((node, key) => node?.[key], value)

    /**
     * The DSH name (the user, 2026-11-17): one text field saved on blur or Enter. An empty field
     * unsets it, and the approval page then shows this DSH's address.
     */
    function DshName({ t, form, snapshot, disabled }) {
      const { busy, failed, save } = useFieldSave(form, snapshot)
      const saved = valueAt(snapshot.value, SETTING_PATH.dshName) ?? ''
      const [text, setText] = React.useState(null)
      const commit = () => {
        const next = (text ?? saved).trim()
        if (text === null || next === saved) { setText(null); return }
        void save([next === '' ? { op: OP_UNSET, path: SETTING_PATH.dshName } : { op: OP_SET, path: SETTING_PATH.dshName, value: next }])
          .then((accepted) => { if (accepted) setText(null) })
      }
      return h(SettingRow, {
        data: SETTING_PATH.dshName.join('.'),
        title: t('dshName'),
        hint: h('p', { style: STYLE.hint }, t('dshNameHint')),
        control: h(Input, {
          type: 'text', value: text ?? saved, disabled: disabled || busy,
          onChange: (event) => setText(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === ENTER_KEY) commit() },
        }),
        errors: [failed ? h('span', { key: 'failed', role: 'alert' }, t('saveFailed')) : null],
      })
    }

    /**
     * One whole-number field saved on blur or Enter; a value outside `min`–`max` is refused here.
     * `hint` is the row's left-hand detail under its title (or null).
     */
    function NumberSetting({ t, form, snapshot, path, label, hint = null, min, max, disabled, data }) {
      const { busy, failed, save } = useFieldSave(form, snapshot)
      const saved = valueAt(snapshot.value, path)
      const [text, setText] = React.useState(null)
      const shown = text ?? (saved === undefined ? '' : String(saved))
      const number = Number(shown)
      const invalid = text !== null && !(Number.isSafeInteger(number) && number >= min && (max === undefined || number <= max))
      const commit = () => {
        if (text === null || invalid || number === saved) { setText(null); return }
        // A refused save keeps the typed text, so the user sees what was not saved beside the error.
        void save([{ op: OP_SET, path, value: number }]).then((accepted) => { if (accepted) setText(null) })
      }
      return h(SettingRow, {
        data,
        title: label,
        hint,
        control: h(Input, {
          type: 'text', inputMode: 'numeric', value: shown, disabled: disabled || busy, 'aria-invalid': invalid,
          onChange: (event) => setText(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === ENTER_KEY) commit() },
        }),
        errors: [
          invalid ? h('span', { key: 'invalid', role: 'alert' }, t('invalid')) : null,
          failed ? h('span', { key: 'failed', role: 'alert' }, t('saveFailed')) : null,
        ],
      })
    }

    /**
     * The approval page's port (R-OA-20, Q-OA-7 A) with the listener's status from the state route
     * under its hint: DSH's StateDot (green listening, red otherwise) and the status words.
     */
    function Approval({ t, form, snapshot, approval, disabled }) {
      const ok = approval?.status === LISTENER_OK
      const status = approval === undefined ? null
        : ok ? t('approvalOk', { port: approval.port }) : t(APPROVAL_STATUS_KEY + approval.status)
      const hint = h(React.Fragment, null,
        h('p', { style: STYLE.hint }, t('approvalHint')),
        status === null ? null : h('p', { style: { ...STYLE.status, color: ok ? TOKEN.secondary : TOKEN.error }, role: 'status' },
          h(StateDot, { state: ok ? DOT.on : DOT.problem, size: SIZE.dot }),
          h('span', null, t('approvalStatus', { status }))))
      return h('div', { [DATA.approval]: approval?.status ?? '' },
        h(NumberSetting, { t, form, snapshot, path: SETTING_PATH.approvalPort, label: t('approvalPort'), hint, min: PORT_RANGE.min, max: PORT_RANGE.max, disabled, data: SETTING_PATH.approvalPort.join('.') }))
    }

    /**
     * The connector's limits (LIMIT_FIELDS; moved here from dsh-connector-ui, decided item 55), each
     * with its page label; the Host's schema still decides validity.
     */
    function Limits({ t, form, snapshot, disabled }) {
      return section(t('limits'), undefined, { [DATA.limits]: true },
        card(LIMIT_FIELDS.map((field) => h(NumberSetting, { key: field, t, form, snapshot, path: [field], label: t('field.' + field), min: LIMIT_MIN, disabled, data: field }))))
    }

    /**
     * The page over DSH's host-owned `form` (`{state, mutate}`, plugin-manager slot-contract
     * ConfigPageForm) that the Plugins page hands its row entry (design §5.9): the page owner
     * refreshes `state`, so an accepted change, including the item `create` adds, re-renders it.
     * No form means DSH does not serve the row's settings to this client.
     */
    function makePage(t) {
      return function DshConnectorSettings(props) {
        const form = props.form
        const snapshot = form?.state
        const saved = listOf(snapshot?.value)
        // The staged list and the revision it was staged from, which fences its Save: a list
        // changed underneath (New token, the hosted create, another tab) refuses that Save instead
        // of being overwritten, which would delete the new entry for good.
        const [draft, setDraft] = React.useState(null)
        const [busy, setBusy] = React.useState(BUSY.none)
        const [problem, setProblem] = React.useState(null)
        const [notice, setNotice] = React.useState(null)
        const [newLabel, setNewLabel] = React.useState('')
        // The value of the token just created: only here, only until Close (R-TOK-11).
        const [revealed, setRevealed] = React.useState(null)
        // The read-only state (pair rows, the approval listener): refreshed with the notice.
        const [state, setState] = React.useState(undefined)
        const refreshNotice = React.useCallback(async () => {
          const [answer, read] = await Promise.all([call(ROUTE.notice, ROUTE.get), call(ROUTE.state, ROUTE.get)])
          setNotice(answer.ok ? answer.notice ?? null : null)
          setState(read.ok ? read : undefined)
        }, [])
        const onPage = props.view === PAGE.pageView && snapshot !== undefined && snapshot.status !== PAGE.unavailable
        React.useEffect(() => { if (onPage) void refreshNotice() }, [refreshNotice, onPage, snapshot?.revision])
        if (props.view !== PAGE.pageView) return t('summary')
        if (!onPage) return h('p', { style: STYLE.hint }, t('unavailable'))
        if (snapshot.status === PAGE.loading) return h('p', { style: STYLE.hint, role: 'status' }, t('loading'))
        // A draft equal to the saved list is no edit: the saved list is shown, so nothing hides
        // an item added meanwhile.
        const dirty = draft !== null && !sameList(draft.items, saved)
        const list = dirty ? draft.items : saved
        const disabled = !snapshot.writable || busy !== BUSY.none
        const stage = (change) => {
          setProblem(null)
          setDraft((current) => (current !== null && !sameList(current.items, saved)
            ? { ...current, items: change([...current.items]) }
            : { items: change([...saved]), revision: snapshot.revision }))
        }
        const edit = {
          label: (index, label) => stage((next) => { next[index] = { ...next[index], label }; return next }),
          enabled: (index, enabled) => stage((next) => { next[index] = { ...next[index], enabled }; return next }),
          remove: (index) => stage((next) => { next.splice(index, 1); return next }),
          move: (index, step) => stage((next) => { const [item] = next.splice(index, 1); next.splice(index + step, 0, item); return next }),
        }
        const save = async () => {
          setBusy(BUSY.saving)
          let accepted = false
          try { accepted = await form.mutate([{ op: OP_SET, path: [PAGE.tokensField], value: draft.items }], draft.revision) } catch { accepted = false }
          setBusy(BUSY.none)
          if (accepted) setDraft(null)
          else setProblem(t('saveFailed'))
          await refreshNotice()
        }
        const create = async () => {
          setBusy(BUSY.creating)
          setProblem(null)
          const answer = await call(ROUTE.create, { ...ROUTE.post, body: JSON.stringify({ label: newLabel }) })
          setBusy(BUSY.none)
          if (!answer.ok || typeof answer.value !== 'string') { setProblem(t('createFailed', { code: answer.code ?? ROUTE.unreadable })); return }
          setNewLabel('')
          setRevealed(answer.value)
        }
        // No page heading: the Plugins page draws the row's title above its configuration. The page
        // is DSH's section rhythm: Tokens (the list and New token in one card, Save under it), the
        // approval page (its port and the DSH name it shows) and the limits.
        const newLabelEmpty = newLabel.trim() === ''
        return h('div', { style: STYLE.page, [DATA.root]: true },
          section(t('tokens'), list.length === 0 ? undefined : String(list.length), {},
            h('p', { style: STYLE.lead }, t('hint')),
            snapshot.writable ? null : h('p', { style: STYLE.hint }, t('readOnly')),
            h(Notice, { t, notice }),
            h('div', { style: STYLE.card },
              list.length === 0 ? h('p', { style: STYLE.empty }, t('empty')) : h('ul', { style: STYLE.list },
                // Keyed by the entry key, so a reorder moves a row (and its focus) instead of remounting
                // it; a key two items share is a duplicate (design §5.9), whose second row is keyed apart.
                list.map((item, index) => h(TokenRow, {
                  key: list.findIndex((other) => other.key === item.key) === index ? item.key : item.key + DUPLICATE_ROW + index,
                  t, item, index, count: list.length, disabled, edit, pair: state?.entries?.find((row) => row.key === item.key),
                }))),
              h('div', { style: { ...RULED_ROW, ...STYLE.addRow } },
                h(Input, { type: 'text', 'aria-label': t('newLabel'), placeholder: t('newLabel'), value: newLabel, disabled: disabled || dirty, [DATA.newLabel]: true, onChange: (event) => setNewLabel(event.target.value) }),
                h(Button, { type: 'button', size: 'sm', variant: 'outline', icon: h(IconPlusOutlineRegular, { size: SIZE.icon }), disabled: disabled || dirty || newLabelEmpty, [DATA.newToken]: true, onClick: () => void create() }, busy === BUSY.creating ? t('creating') : t('newToken')))),
            dirty ? h('div', { style: STYLE.actions },
              h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy !== BUSY.none, onClick: () => { setDraft(null); setProblem(null) } }, t('discard')),
              h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled, onClick: () => void save() }, busy === BUSY.saving ? t('saving') : t('save'))) : null,
            problem === null ? null : h('p', { style: STYLE.error, role: 'alert' }, problem)),
          section(t('approvalSection'), undefined, {},
            card([
              h(Approval, { key: 'port', t, form, snapshot, approval: state?.approval, disabled }),
              h(DshName, { key: 'name', t, form, snapshot, disabled }),
            ])),
          h(Limits, { t, form, snapshot, disabled }),
          revealed === null ? null : h(Reveal, { t, value: revealed, onClose: () => setRevealed(null) }))
      }
    }

    function apply(ctx) {
      const t = ctx.locale.bind(PAGE.locale)
      ctx.effect(() => ctx.locale.register(PAGE.locale, { en, zh }), PAGE.effect.locale)
      // Registered only while DSH serves the row's settings, so a deployment without the row shows
      // no trace of the page (the Plugins page asks slot keys for a configure control).
      ctx.effect(() => ctx.configForms.whileServed([PAGE.id], () =>
        ctx.slots.inject(PAGE.slot, () => ctx.slots.register({
          name: PAGE.slot,
          key: `${PAGE.packageName}#${PAGE.id}`,
          locale: PAGE.locale,
        }, makePage(t)))), PAGE.effect.page)
    }

    return { name: PAGE.id, inject: ['slots', 'locale', 'configForms'], apply }
  },
})
