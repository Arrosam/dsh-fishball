/**
 * dsh-connector's browser half (task C-TOKENS-REVEAL; design §5.9, §28; requirements 1.27, 1.28 R2;
 * R-ARCH-03, R-CON-10, R-TOK-03, R-TOK-11). It does three things, and works with dsh-connector-ui
 * uninstalled:
 * 1. its own plugin settings page: the Plugins page's `plugins.row.config` entry for the connector's
 *    own row, `dsh-agent-connector#dsh-connector`, while DSH serves that row's settings (below);
 * 2. the marks part (client.marks.js): Hand over / Take back, "Managed by <agent>" and the managed
 *    row mark. It moved here from dsh-connector-ui (DESIGN.md §28, the user 2026-11-20: "every
 *    connector install has it"), so every DSH with the connector shows it, with or without Embed UI;
 * 3. the one home of the browser helpers over the connector UI backend (`UI_CLIENT`, exported as
 *    `ui`): the snapshot stream, the POST helper and the value store. The marks part and
 *    dsh-connector-ui's shell and attention part all draw from it, so a page opens one stream.
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
      slot: 'plugins.bundle.config',
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
    /** The key that saves a field, as its blur does, and the key that discards its unsaved text. */
    const ENTER_KEY = 'Enter'
    const ESCAPE_KEY = 'Escape'
    /**
     * How often the page re-reads the connector's read-only state (pair rows, the approval
     * listener) while it is mounted and the document is visible (review UI-04): pairing, a
     * connection, last-seen and a listener retry change it without any config change. Once a
     * second, as embed-UI's window re-reads its child's status (dsh-connector-ui FRAME_UI.pollMs).
     */
    const STATE_POLL_MS = 1000
    /** The read-only state's three conditions: not read yet, read, or its last read failed. */
    const STATE_READ = Object.freeze({ loading: 'loading', ok: 'ok', failed: 'failed' })
    /** Every limit's minimum (src/config.js MIN.count): the Host's schema refuses anything below it. */
    const LIMIT_MIN = 1
    /**
     * The connector's limits, in src/config.js LIMITS order. A browser chunk cannot import that
     * Node module, so the field names are written here once more: change both together.
     */
    const LIMIT_FIELDS = Object.freeze(['maxQueuedInputs', 'argumentExcerptBytes', 'maxMessageBytes', 'readSessionMessages', 'readSessionBytes'])
    /**
     * Inline layout: the settings page adds no style sheet (R-ARCH-03; only the marks part, a part of
     * its own since DESIGN.md §28, mounts one), so every rule is an inline style and
     * every interactive state (focus, hover, disabled) comes from DSH's primitives. Colours, fonts and
     * radii are DSH's theme tokens (dsh-client-ui-theme), so light and dark both follow DSH. DSH has
     * no spacing tokens; the gaps copy its Plugins page (detailSections 32px, detailSection 12px) and
     * its settings field (SettingsValueField: 12px rows, 6px inside, a 0.5px l2 rule between rows).
     * The page is three sections (tokens, the approval page, the limits), each a titled card of rows,
     * so it reads as one of DSH's own settings pages.
     */
    const GAP = Object.freeze({ page: '32px', section: '12px', row: '12px', item: '8px', tight: '6px', column: '24px', icon: '4px', hairline: '2px' })
    /**
     * `control`: a setting's input beside its words. `column`: the narrowest a row's part gets
     * before the row stacks (UI-FIX-D: at 390 px the words were squeezed beside the inputs and the
     * pair line touched the switch). The page has no style sheet for a media query, so a row stacks
     * by flex wrapping: its words keep at least `column` beside the control, else they take a line
     * of their own and the control the next one.
     */
    const SIZE = Object.freeze({ control: '240px', column: '240px', iconButton: '28px', dot: 8, icon: 14, noticeIcon: 16 })
    /**
     * The wrapping row's two shares: the words take every free pixel (`fill`, the Every Layout
     * "sidebar" pattern), so on one line the control stays at its `control` basis; each part fills
     * its own line once the row stacks.
     */
    const GROW = Object.freeze({ fill: 999, one: 1 })
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
    /**
     * A wrapping row's two parts (SIZE.column, GROW): the words (`main`) first, at least `column`
     * wide and taking the free space; the control or tools (`end`) beside them while both fit, else
     * on a line of their own. `endTools` keeps its own size and sits at the line's end either way.
     */
    const WRAP = Object.freeze({
      row: Object.freeze({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: GAP.column, rowGap: GAP.item, minWidth: 0 }),
      main: Object.freeze({ flex: `${GROW.fill} 1 ${SIZE.column}`, minWidth: 0 }),
      end: Object.freeze({ flex: `${GROW.one} 1 ${SIZE.control}`, minWidth: 0 }),
      endTools: Object.freeze({ flex: 'none', marginInlineStart: 'auto' }),
    })
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
      // A token's label and pair line, then its switch and buttons, which wrap to their own line
      // (at its end) on a narrow page instead of squeezing the label and touching the pair line.
      tokenRow: Object.freeze({ ...WRAP.row, columnGap: GAP.row }),
      tokenMain: Object.freeze({ ...WRAP.main, display: 'grid', gap: GAP.tight }),
      tokenTools: Object.freeze({ ...WRAP.endTools, display: 'flex', alignItems: 'center', gap: GAP.icon }),
      switchGap: Object.freeze({ marginInlineEnd: GAP.item, display: 'inline-flex' }),
      iconButton: Object.freeze({ width: SIZE.iconButton, padding: 0 }),
      pair: Object.freeze({ display: 'flex', alignItems: 'center', gap: GAP.tight, color: TOKEN.tertiary, ...TYPE.caption, minWidth: 0, overflowWrap: 'anywhere' }),
      // The new token's label field, then New token, which wraps under it on a narrow page.
      addRow: Object.freeze({ ...WRAP.row, columnGap: GAP.item }),
      addLabel: Object.freeze({ ...WRAP.main, display: 'grid' }),
      addButton: Object.freeze({ ...WRAP.endTools, display: 'inline-flex' }),
      actions: Object.freeze({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: GAP.item }),
      // DSH's settings row (its general settings rows: words, then the control at the row's end, a
      // 24px gap) as two wrapping lines with the same shares (WRAP): the label (title, input), then
      // the hint under the title and the errors under the input. On a narrow page each part takes a
      // line of its own: title, input, hint, errors (DSH's settings field order: input, then hint).
      setting: Object.freeze({ ...WRAP.row, rowGap: GAP.hairline, alignItems: 'flex-start' }),
      settingLabel: Object.freeze({ ...WRAP.row, flex: '1 1 100%' }),
      settingTitle: Object.freeze({ ...WRAP.main, fontWeight: TYPE.heading.fontWeight, lineHeight: TYPE.body.lineHeight }),
      settingControl: Object.freeze({ ...WRAP.end, display: 'grid' }),
      settingHint: Object.freeze({ ...WRAP.main, display: 'grid', gap: GAP.icon }),
      settingError: Object.freeze({ ...WRAP.end, display: 'grid', color: TOKEN.error, ...TYPE.caption }),
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
    /** The marks part's chunk (beside this file: DSH serves only client.<name>.js there), its effect label and its load-failure line. */
    const MARKS = Object.freeze({ chunk: './client.marks.js', effect: 'dsh-connector: marks part', unavailable: 'dsh-connector: part unavailable' })

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
      fieldRefused: 'Could not confirm the change. Check the current value and try again if needed.',
      fieldUnconfirmed: 'Could not confirm the save: {reason}',
      changedElsewhere: 'This setting was changed elsewhere meanwhile. Leave the field or press Enter again to save your value over it, or press Esc to keep the new one.',
      stateFailed: 'The connector\'s status could not be read ({code}).',
      retry: 'Retry',
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
      dshNameHint: 'The name the approval page shows for this DSH. Empty: this DSH shows as <device name>-DSH.',
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
      fieldRefused: '无法确认更改是否生效。请检查当前值，必要时重试。',
      fieldUnconfirmed: '无法确认保存结果：{reason}',
      changedElsewhere: '此设置已在别处被修改。再次离开此字段或按 Enter 将用你的值覆盖它，按 Esc 则保留新值。',
      stateFailed: '无法读取连接器的状态（{code}）。',
      retry: '重试',
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
      dshNameHint: '授权页面为此 DSH 显示的名称。留空则此 DSH 显示为 <设备名称>-DSH。',
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

    /**
     * The connector UI backend's routes, page-relative: src/ui/constants.js UI_ROUTE without the
     * leading `/` (K3 host-services/ui.d.ts). A browser chunk cannot import that Node module, so they
     * are written here once more: change both together. Embed UI reads the same paths from its host
     * half's `services` answer; both resolve to one URL, so they share one store (uiSnapshots).
     */
    const UI_ROUTE = Object.freeze({
      state: 'api/dsh-connector/ui/state',
      events: 'api/dsh-connector/ui/events',
      handOver: 'api/dsh-connector/ui/handover',
      takeBack: 'api/dsh-connector/ui/takeback',
      dismiss: 'api/dsh-connector/ui/notice/dismiss',
      opened: 'api/dsh-connector/ui/opened',
    })
    /**
     * The snapshot streams' reopen rule (eventStore): EventSource's `readyState` CLOSED, and the
     * wait before a new stream. 2 s: soon enough to follow a connector reload, slow enough not to
     * hammer a DSH whose connector is gone for good.
     */
    const STREAM = Object.freeze({ closed: 2, reopenMs: 2000 })
    const VISIBILITY_EVENT = 'visibilitychange'
    const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' })
    /**
     * The connector UI backend's snapshot before its first frame (src/ui/state.js `snapshot()`):
     * nothing managed, no target, the light off, no notice. Without the backend's routes (the
     * connector row not loaded) it stays this, so nothing is drawn and nothing is logged.
     */
    const EMPTY_UI = Object.freeze({
      marks: Object.freeze([]), targets: Object.freeze([]),
      attention: Object.freeze({ count: 0, important: false }), notice: null, light: Object.freeze({ on: false, important: false }),
    })

    /** One value components share and follow (dialog requests, seats); set() notifies them. */
    function valueStore(initial) {
      let current = initial
      const listeners = new Set()
      return {
        get: () => current,
        set: (next) => { current = next; for (const listener of listeners) listener() },
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
      }
    }

    /**
     * One shared EventSource at `path` while the page is visible and has subscribers. Hidden tabs
     * must release their HTTP/1.1 connection for host requests (DSH also streams per tab). Opening
     * the route sends a whole current snapshot, so a resumed tab needs no replay or polling.
     *
     * EventSource retries a dropped connection by itself, but gives up for good when an answer is
     * not a 200 event stream, as while the connector row reloads and its routes are briefly gone.
     * Then the store shows `initial` (nothing it showed is still known to be true) and opens a new
     * stream after STREAM.reopenMs while anyone still follows it, so the UI comes back live
     * without a page reload (R-UI-05, R-UI-10).
     */
    function eventStore(path, initial) {
      let snapshot = initial
      const listeners = new Set()
      let source
      let reopen
      const notify = () => { for (const listener of listeners) listener() }
      const stop = () => {
        const previous = source
        source = undefined
        previous?.close()
        clearTimeout(reopen)
        reopen = undefined
        // A notice or owner can change while disconnected. Don't offer its old action on resume.
        if (snapshot !== initial) { snapshot = initial; notify() }
      }
      const open = () => {
        if (document.hidden || !listeners.size || source || reopen !== undefined) return
        const current = new EventSource(routeUrl(path))
        source = current
        current.onmessage = (event) => {
          if (source !== current) return
          let next
          try { next = JSON.parse(event.data) } catch { return }
          snapshot = next
          notify()
        }
        current.onerror = () => {
          if (source !== current || current.readyState !== STREAM.closed) return
          source = undefined
          snapshot = initial
          if (!document.hidden) reopen = setTimeout(() => { reopen = undefined; open() }, STREAM.reopenMs)
          notify()
        }
      }
      const followVisibility = () => { if (document.hidden) stop(); else open() }
      return {
        subscribe(listener) {
          if (!listeners.size) document.addEventListener?.(VISIBILITY_EVENT, followVisibility)
          listeners.add(listener)
          open()
          return () => {
            listeners.delete(listener)
            if (listeners.size > 0) return
            document.removeEventListener?.(VISIBILITY_EVENT, followVisibility)
            stop()
          }
        },
        get: () => snapshot,
      }
    }
    /**
     * The one store of the backend's `events` route, keyed by its resolved URL and shared by every
     * part of either package, so a page opens one stream however many parts draw.
     */
    const uiStores = new Map()
    function uiSnapshots(path) {
      const url = routeUrl(path)
      if (!uiStores.has(url)) uiStores.set(url, eventStore(path, EMPTY_UI))
      return uiStores.get(url)
    }
    /**
     * The hook a part draws the backend's snapshot with, followed live (R-UI-05, R-UI-10: no
     * reload). @param routes - the backend's page-relative routes (UI_ROUTE, or Embed UI's `ui`).
     */
    const snapshotHook = (routes) => function useSnapshot() {
      const store = uiSnapshots(routes.events)
      return React.useSyncExternalStore(store.subscribe, store.get)
    }

    /** POST one command to the Host. @returns { ok, code, answer } (the Host's refusal code and the whole answer). */
    async function send(path, body, signal) {
      try {
        const response = await fetch(routeUrl(path), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body), signal })
        if (response.ok) return { ok: true, code: null, answer: await response.json().catch(() => ({})) }
        const answer = await response.json().catch(() => ({}))
        return { ok: false, code: typeof answer.code === 'string' ? answer.code : null, answer }
      } catch {
        return { ok: false, code: null, answer: null }
      }
    }

    /**
     * The browser helpers over the connector UI backend, exported as `ui` on this entry. Their one
     * home (DESIGN.md §28): this package's marks part and dsh-connector-ui's shell and attention
     * part use them, so neither package keeps a copy. dsh-connector-ui reaches them through
     * `require.async('dsh-agent-connector')` (its `dsh.client.external`).
     */
    const UI_CLIENT = Object.freeze({ routes: UI_ROUTE, apiUrl: routeUrl, snapshotHook, send, valueStore, visibilityEvent: VISIBILITY_EVENT })
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
     * `known` is false while the state is not read or its read failed: nothing is claimed then
     * (review UI-04: a failed read is not "Not paired"; the page shows the failure once).
     */
    function PairState({ t, row, known }) {
      if (!known) return null
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
    function TokenRow({ t, item, index, count, disabled, edit, pair, known }) {
      return h('li', { style: { ...cardRowStyle(index), ...STYLE.tokenRow }, [DATA.row]: item.key },
        h('div', { style: STYLE.tokenMain },
          h(Input, { type: 'text', 'aria-label': t('label'), value: item.label, disabled, onChange: (event) => edit.label(index, event.target.value) }),
          h(PairState, { t, row: pair, known })),
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
     * One setting row, DSH's settings layout: the `label` holds exactly the title and the control,
     * so it names the input by the title alone; the hint (with any status line) and the errors are
     * the label's siblings, so neither becomes part of the input's accessible name (USE-CASES
     * AUTH, limits). Both lines wrap as WRAP says (STYLE.setting).
     * @param control - the input element.
     */
    function SettingRow({ data, title, hint, control, errors }) {
      return h('div', { style: STYLE.setting },
        h('label', { style: STYLE.settingLabel, [DATA.setting]: data },
          h('span', { style: STYLE.settingTitle }, title),
          h('span', { style: STYLE.settingControl }, control)),
        hint === null ? null : h('div', { style: STYLE.settingHint }, hint),
        // Always laid out, empty without an error, so on a wide row the hint keeps to the title's
        // column instead of running on under the input.
        h('span', { style: STYLE.settingError }, ...errors))
    }

    /**
     * One single-field setting saved on its own (the approval port, the DSH name, each limit): the row's config form, fenced by the revision it was read at, as the list's Save.
     * @returns `{busy, problem, save(ops)}`
     */
    function useFieldSave(form, snapshot) {
      const [busy, setBusy] = React.useState(false)
      const [problem, setProblem] = React.useState(null)
      const saving = React.useRef(false)
      const save = async (ops) => {
        // Enter and blur can reach the same draft before React disables the input. Sending both
        // with the same revision would let a stale refusal overwrite the first write's success.
        if (saving.current) return false
        saving.current = true
        setBusy(true)
        setProblem(null)
        try {
          const accepted = await form.mutate(ops, snapshot.revision)
          // The form returns false for both a refusal and a lost reply, even if the change persisted.
          if (!accepted) setProblem({ key: 'fieldRefused' })
          return accepted
        } catch (error) {
          const reason = error?.message || (typeof error === 'string' && error) || error?.code || ROUTE.unreadable
          setProblem({ key: 'fieldUnconfirmed', values: { reason } })
          return false
        } finally {
          saving.current = false
          setBusy(false)
        }
      }
      return { busy, problem, save }
    }

    /** The value at `path` in the row's settings value. */
    const valueAt = (value, path) => path.reduce((node, key) => node?.[key], value)

    /**
     * One single-field setting's unsaved text and its save (the DSH name, the port, each limit):
     * the one draft rule both scalar fields share (review UI-03).
     *
     * The draft remembers the field's saved value when typing began (`base`). The save is fenced by
     * the live revision, so a change of another field meanwhile does not refuse it; but when this
     * field itself was changed elsewhere since (`base` differs from `saved`), the first blur or
     * Enter sends nothing and shows `changedElsewhere`, keeping the typed text. Another blur or
     * Enter then saves it over the newer value on purpose; Escape discards it at any time. A newer
     * change after that warning warns again (`warned` is the value the user was warned about).
     * @param saved - the field's live saved value
     * @returns `{text, busy, problem, conflict, edit(text), discard(), commit(ops)}`: `conflict` is
     *   `{value}` (the newer value warned about) or undefined; `text` is null
     *   without a draft; `commit(null)` means "nothing to save" (unchanged or invalid text) and drops the draft
     */
    function useScalarDraft(form, snapshot, saved) {
      const { busy, problem, save } = useFieldSave(form, snapshot)
      const [draft, setDraft] = React.useState(null)
      const edit = (text) => setDraft((current) => (current === null ? { text, base: saved, warned: undefined } : { ...current, text }))
      const discard = () => setDraft(null)
      const changedElsewhere = draft !== null && !Object.is(draft.base, saved)
      const commit = (ops) => {
        if (draft === null || ops === null) { discard(); return }
        if (changedElsewhere && !(draft.warned !== undefined && Object.is(draft.warned.value, saved))) {
          setDraft({ ...draft, warned: { value: saved } })
          return
        }
        // Keep the draft on an unconfirmed save so the user can retry without retyping.
        void save(ops).then((accepted) => { if (accepted) discard() })
      }
      // `conflict` is the value warned about (undefined: no warning), so a newer change elsewhere
      // after a warning shows a fresh alert, which a screen reader announces again.
      const conflict = changedElsewhere ? draft.warned : undefined
      return { text: draft?.text ?? null, busy, problem, conflict, edit, discard, commit }
    }

    /** A scalar field's input events: change stages, blur and Enter commit, Escape discards (useScalarDraft). */
    const scalarInput = (draft, commit) => ({
      onChange: (event) => draft.edit(event.target.value),
      onBlur: commit,
      onKeyDown: (event) => {
        if (event.key === ENTER_KEY) commit()
        else if (event.key === ESCAPE_KEY) draft.discard()
      },
    })
    /** The conflict alert's React key prefix; the warned value follows it, so each warning is a new alert. */
    const CONFLICT_KEY = 'conflict:'
    /** A scalar field's alerts: the conflict warning and a refused save. */
    const scalarErrors = (t, draft) => [
      draft.conflict === undefined ? null : h('span', { key: CONFLICT_KEY + JSON.stringify(draft.conflict.value), role: 'alert' }, t('changedElsewhere')),
      draft.problem === null ? null : h('span', { key: 'failed', role: 'alert' }, t(draft.problem.key, draft.problem.values)),
    ]

    /**
     * The DSH name (the user, 2026-11-17): one text field saved on blur or Enter. Left blank, this
     * DSH shows as `<device name>-DSH` (multi-DSH plan D04/D05, docs/planning/v3-multi-dsh.md).
     * A name is kept exactly as typed, surrounding spaces included (D06, the user: "照 MCP 协议来",
     * no sanitising); only an entirely blank field unsets it, as the connector's own resolver
     * counts a whitespace-only setting as unset.
     */
    function DshName({ t, form, snapshot, disabled }) {
      const saved = valueAt(snapshot.value, SETTING_PATH.dshName) ?? ''
      const draft = useScalarDraft(form, snapshot, saved)
      const commit = () => {
        const next = draft.text ?? saved
        const blank = next.trim() === ''
        draft.commit(next === saved || (blank && saved === '') ? null : [blank ? { op: OP_UNSET, path: SETTING_PATH.dshName } : { op: OP_SET, path: SETTING_PATH.dshName, value: next }])
      }
      return h(SettingRow, {
        data: SETTING_PATH.dshName.join('.'),
        title: t('dshName'),
        hint: h('p', { style: STYLE.hint }, t('dshNameHint')),
        control: h(Input, { type: 'text', value: draft.text ?? saved, disabled: disabled || draft.busy, ...scalarInput(draft, commit) }),
        errors: scalarErrors(t, draft),
      })
    }

    /**
     * One whole-number field saved on blur or Enter; a value outside `min`–`max` is refused here.
     * `hint` is the row's left-hand detail under its title (or null).
     */
    function NumberSetting({ t, form, snapshot, path, label, hint = null, min, max, disabled, data }) {
      const saved = valueAt(snapshot.value, path)
      const draft = useScalarDraft(form, snapshot, saved)
      const shown = draft.text ?? (saved === undefined ? '' : String(saved))
      // A blank field is no number (review UI-05: `Number('')` is 0, which for the port would rebind
      // to an OS-assigned port); only an explicit `0` is the port's "let the OS choose".
      const number = shown.trim() === '' ? NaN : Number(shown)
      const invalid = draft.text !== null && !(Number.isSafeInteger(number) && number >= min && (max === undefined || number <= max))
      const commit = () => draft.commit(invalid || number === saved ? null : [{ op: OP_SET, path, value: number }])
      return h(SettingRow, {
        data,
        title: label,
        hint,
        control: h(Input, { type: 'text', inputMode: 'numeric', value: shown, disabled: disabled || draft.busy, 'aria-invalid': invalid, ...scalarInput(draft, commit) }),
        errors: [invalid ? h('span', { key: 'invalid', role: 'alert' }, t('invalid')) : null, ...scalarErrors(t, draft)],
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
     * The connector's read-only state (the state route: pair rows, the approval listener), read
     * while `active` at once and every STATE_POLL_MS while the document is visible (review UI-04).
     * A poll is skipped while one is in flight, so a slow host is not asked twice; `read()` (Retry,
     * a config change) always asks. Only the newest read's answer is kept: an older one that lands
     * later is dropped, and none lands after unmount.
     * @returns `{state, read}`: `state` is `{status: STATE_READ.loading}`, `{status: ok, value}` or
     *   `{status: failed, code}`.
     */
    function useRuntimeState(active) {
      const [state, setState] = React.useState({ status: STATE_READ.loading })
      const latest = React.useRef(0)
      const inFlight = React.useRef(0)
      const read = React.useCallback(async () => {
        const ticket = ++latest.current
        inFlight.current++
        let answer
        try { answer = await call(ROUTE.state, ROUTE.get) } finally { inFlight.current-- }
        if (ticket !== latest.current) return
        const next = answer.ok ? { status: STATE_READ.ok, value: answer } : { status: STATE_READ.failed, code: answer.code ?? ROUTE.unreadable }
        // A steady poll changes nothing, so it re-renders nothing (the page's inputs keep their state either way).
        setState((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
      }, [])
      React.useEffect(() => {
        if (!active) return undefined
        const timer = setInterval(() => { if (!document.hidden && inFlight.current === 0) void read() }, STATE_POLL_MS)
        return () => {
          clearInterval(timer)
          latest.current++
        }
      }, [active, read])
      return { state, read }
    }

    /** The failed state read, once for the page, with Retry (review UI-04). */
    function StateFailure({ t, state, retry }) {
      if (state.status !== STATE_READ.failed) return null
      return h('div', { style: STYLE.actions },
        h('p', { style: { ...STYLE.error, flex: GROW.one }, role: 'alert' }, t('stateFailed', { code: state.code })),
        h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => void retry() }, t('retry')))
    }

    /**
     * The page over DSH's host-owned `form` (`{state, mutate}`, plugin-manager slot-contract
     * ConfigPageForm) that the Plugins page hands its row entry (design §5.9): the page owner
     * refreshes `state`, so an accepted change, including the item `create` adds, re-renders it.
     * No form means DSH does not serve the row's settings to this client.
     */
    function makePage(t, configForm) {
      return function DshConnectorSettings(props) {
        const liveSnapshot = React.useSyncExternalStore(
          configForm ? configForm.subscribe : () => () => {},
          configForm ? configForm.getSnapshot : () => undefined,
        )
        const form = props.form ?? (configForm ? { state: liveSnapshot, mutate: configForm.mutate.bind(configForm) } : undefined)
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
        const onPage = props.view === PAGE.pageView && snapshot !== undefined && snapshot.status !== PAGE.unavailable
        // The read-only state (pair rows, the approval listener): polled, and read again with the notice.
        const runtime = useRuntimeState(onPage)
        const readState = runtime.read
        const refreshNotice = React.useCallback(async () => {
          const [answer] = await Promise.all([call(ROUTE.notice, ROUTE.get), readState()])
          setNotice(answer.ok ? answer.notice ?? null : null)
        }, [readState])
        React.useEffect(() => { if (onPage) void refreshNotice() }, [refreshNotice, onPage, snapshot?.revision])
        const state = runtime.state.status === STATE_READ.ok ? runtime.state.value : undefined
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
          h(StateFailure, { t, state: runtime.state, retry: readState }),
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
                  t, item, index, count: list.length, disabled, edit, known: state !== undefined, pair: state?.entries?.find((row) => row.key === item.key),
                }))),
              h('div', { style: { ...RULED_ROW, ...STYLE.addRow } },
                h('div', { style: STYLE.addLabel },
                  h(Input, { type: 'text', 'aria-label': t('newLabel'), placeholder: t('newLabel'), value: newLabel, disabled: disabled || dirty, [DATA.newLabel]: true, onChange: (event) => setNewLabel(event.target.value) })),
                h(Button, { type: 'button', size: 'sm', variant: 'outline', style: STYLE.addButton, icon: h(IconPlusOutlineRegular, { size: SIZE.icon }), disabled: disabled || dirty || newLabelEmpty, [DATA.newToken]: true, onClick: () => void create() }, busy === BUSY.creating ? t('creating') : t('newToken')))),
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

    /**
     * The marks part (client.marks.js) as a sub-plugin while this row runs, as dsh-connector-ui
     * starts its parts: the load is held by an effect, so a chunk that arrives after the row stopped
     * starts nothing, and a chunk that fails to load loses only the marks, logged once.
     */
    function startMarks(ctx) {
      ctx.effect(() => {
        let live = true
        require.async(MARKS.chunk).then((module) => { if (live) ctx.plugin(module.marksPart(UI_CLIENT)) })
          .catch((error) => { ctx.logger?.warn?.(MARKS.unavailable, MARKS.chunk, error) })
        return () => { live = false }
      }, MARKS.effect)
    }

    function apply(ctx) {
      startMarks(ctx)
      const t = ctx.locale.bind(PAGE.locale)
      ctx.effect(() => ctx.locale.register(PAGE.locale, { en, zh }), PAGE.effect.locale)
      // Registered only while DSH serves the row's settings, so a deployment without the row shows
      // no trace of the page (the Plugins page asks slot keys for a configure control).
      ctx.effect(() => {
        const configForm = ctx.configForms.get(PAGE.id)
        return ctx.configForms.whileServed([PAGE.id], () =>
          ctx.slots.inject(PAGE.slot, () => ctx.slots.register({
            name: PAGE.slot,
            key: PAGE.packageName,
            locale: PAGE.locale,
          }, makePage(t, configForm))))
      }, PAGE.effect.page)
    }

    // `ui` rides on the plugin object the Loader applies (it reads name, inject and apply only), so
    // a consumer that loads this entry gets the same, already materialized helpers.
    return { name: PAGE.id, inject: ['slots', 'locale', 'configForms'], apply, ui: UI_CLIENT }
  },
})
