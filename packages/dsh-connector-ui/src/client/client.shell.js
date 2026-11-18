/**
 * dsh-connector-ui, the shell part (U-SHELL, U-DRAW, U-WIRE):
 * 1. The one Fishball entry (R-UI-11): the fish row in DSH's sidebar panel list. DSH's own brand
 *    mark and name are not overridden (no sidebar.brand.* slot): a brand override would change
 *    the host UI for every user of that DSH.
 * 2. No settings card (R-UI-06, 1.33 Q-D2): the connector's limits are on the connector's own
 *    settings page, and Fishball's two settings entries are fishball-ui's, inside the framed page
 *    (1.34; the user, U-WIRE: the window adds none of its own).
 * 3. The window (U-DRAW; requirements 1.38 Q-U2, 1.41 Q-G3; R-UI-02): DSH's main area, the
 *    `main` slot where a session's conversation shows, opened by the Fishball row in the sidebar's
 *    panel list. It opens only the hosted child's page, through the instance's admission. A child
 *    that is not ready shows its state and a Retry link to the instance's own settings page
 *    (decided #77). With no usable instance (none, or only an external agent connected) it shows
 *    the hint to open the Fishball instance's own page (Q-G3).
 * 4. The kit the other parts are built from (`exports.kit`): the connector UI backend's snapshot
 *    stream and its POST helper, the style sheet and dictionary, and the seats (SEAT) where the
 *    attention part draws the fish's light and clears it when the window opens. The marks with
 *    Hand over / Take back (client.marks.js) and the light with the notify prompt
 *    (client.attention.js) are parts of their own. There are no cards (Q-U2) and no inline
 *    records (Q-G4).
 *
 * The mark is FishMark from the owner's fishball app (THIRD_PARTY_NOTICES), drawn plain on every
 * surface here (ICON-SET, the user 2026-11-18): the wrench is dsh-connector's own badge and shows
 * only on that package's icon (its Plugins card and settings page), and this package's own icon
 * (assets/connector-ui-icon.svg, the fish with a window badge) is DSH's to draw from the manifest.
 *
 * State comes from the connector's UI backend (its `events` route, server-sent snapshots; 1.34:
 * "connector当后端，embed UI当前端").
 */
window.__ModuleLoader__.load({
  // V3 R-EMBED: moved here from packages/dsh-connector/client.js (R-ARCH-04), then split by
  // U-SHELL. It is a package-local chunk of dsh-connector-ui's client (client.js starts it as a
  // sub-plugin), so it registers under that package with its chunk name.
  id: 'dsh-connector-ui',
  chunk: 'client.shell.js',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { Button, IconRefreshOutlineRegular, IconWarningOutlineRegular, StateDot, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /** The shell's sub-plugin name, beside the parts' `dsh-connector-ui: marks` and `: attention`. */
    const SHELL_NAME = 'dsh-connector-ui: shell'
    const NS = 'fishball'
    /** Client services read on demand (not injected: Fishball works without each of them). */
    const SERVICE = Object.freeze({ layout: 'layout' })
    /**
     * The Fishball window (R-UI-02) and its chrome.
     * `panelId` is one key shared by the `main` occupant and its `sidebar.panellist` row, as DSH's
     * Plugins ("plugins") and Tasks ("schedules") panels do. `panelOrder` puts the row first, before
     * Plugins (0) and Tasks (10): Fishball is the conversation you open most, so it sits where a
     * pinned session would. `pluginsPanelId` is DSH's own Plugins panel, which the Retry link
     * opens when DSH has no plugin navigation service. `warningIconPx` is the glyph of DSH's own empty/error state
     * (dsh-client-ui-schedule's list error, 24px). `stateTone` maps the frame's state to DSH's Tag
     * tones (the ones its plugin page uses). DSH's Tag styles `danger`, not `error`, on
     * 0.2.1-rc.5 and 0.2.2-rc.1 (dsh-web-frontend's `[data-tone=danger]`), so failed states keep `danger`.
     * The frame's address is only ever admit's one-time URL (CHILD_UI).
     */
    const EMBED_UI = Object.freeze({
      panelId: 'fishball', panelOrder: -10, pluginsPanelId: 'plugins', warningIconPx: 24, refreshIconPx: 14,
      stateTone: Object.freeze({ ready: 'info', failed: 'danger' }), neutralTone: 'neutral',
      /**
       * Clipboard write only, for every origin the frame lands on: admit's one-time URL at the
       * child's own loopback origin (design §4.1) and the child's redirect to its clean page, where
       * native copy actions would otherwise be refused. The wildcard is safe because `src` is only
       * ever the host half's admit URL, and the grant is write-only: no clipboard-read or any other
       * feature (Fishball's decision, 2026-11-10).
       */
      iframeAllow: 'clipboard-write *',
      /**
       * The framed page is an admission launch that the child redirects after redeeming its
       * ticket, so the frame sends no referrer onward.
       */
      iframeReferrerPolicy: 'no-referrer',
    })
    /**
     * DSH's session header (dsh-client-ui-conversation ConversationRoot .header/.titleRow/
     * .crumbCurrent, identical in 0.2.1-rc.5 and 0.2.2-rc.1), without its tab row: the Fishball
     * view has one page, so the header is one line of DSH's title-row height plus padding.
     */
    const DSH_SESSION_HEADER = Object.freeze({ minHeight: '52px', padding: '10px 28px', startPadding: '20px', gap: '8px', nameFont: '14px', nameLine: '20px' })
    /**
     * DSH's empty/error state (dsh-client-ui-schedule TaskManagerPage .empty), with the glyph in a
     * soft round well (DSH's neutral Tag fill) so a not-framed view has one clear focal point. The
     * column keeps to `maxWidth`, so a long hint wraps as a paragraph, not as one line.
     */
    const DSH_EMPTY_STATE = Object.freeze({ padding: '48px 20px', gap: '8px', font: '14px', maxWidth: '360px', wellPx: 56, wellGapPx: 8 })
    /**
     * The window's reads of the host half's child routes (the browser never calls the instance).
     * The open window re-reads the child's status once a second (`pollMs`), only while it is
     * mounted and the tab is visible, one read at a time.
     */
    const FRAME_UI = Object.freeze({
      read: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      pollMs: 1000,
      loading: 'loading',
      /** The instance's page the window frames: the hosted child's chat (its settings are the instance's own page). */
      page: Object.freeze({ chat: 'chat' }),
      /** DSH's pluginNavigation service, which opens a package's own settings page. */
      navigation: 'pluginNavigation',
      /**
       * The admission's language, K3 `AdmitLang` (child.d.ts; the host half's ADMIT.langs, which
       * this classic script cannot import). `byLocale` is DSH's text map for
       * ctx.locale.resolveText: DSH's locale id (lowercase, `en` required) to the `lang` value.
       * resolveText walks the active language's fallback chain exactly as this package's own `t`
       * does, so the page opens in the same language as embed-UI's words: a language pack that
       * falls back to `zh` frames `zh`, and any other language frames `en`.
       */
      lang: Object.freeze({ byLocale: Object.freeze({ en: 'en', zh: 'zh' }) }),
      /** The instance's package, whose own settings page the window's Retry link opens (decided #77). */
      instancePackage: 'dsh-instance',
    })
    /**
     * The V3 frame (U-SHELL; design §4.1, §4.2; R-UI-02, R-UI-03): the instance locator
     * `dshInstanceChild` as embed-UI's host half re-serves it. The host half's routes come from its
     * `services` answer (`routes`, page-relative; client.js reads it), so none is kept here.
     * - The frame's `src` is only ever `admit`'s one-time URL, asked for afresh for each frame
     *   document (first open, a language change, Refresh, or a not-ready state the 1 s status poll
     *   saw; a restart faster than the poll keeps the frame, which then reloads by Refresh); it is
     *   never stored or logged, and the address holds no token (the ticket is redeemed by the child
     *   into its own cookie, S4).
     * - `hostnameRefused` is K3's AdmitErrorCode: the page was not opened under a loopback name, so
     *   the view shows the refusal text and no frame (UIM-EP-02 row 4).
     * - A child that is not ready shows its state and code and a Retry **link** to the instance's
     *   own settings page, which holds Retry (R-UI-03 amended by 1.33, decided #77): embed-UI has no
     *   Retry of its own.
     */
    const CHILD_UI = Object.freeze({
      readyState: 'ready',
      hostnameRefused: 'hostname-refused',
      /** The host half's refusal without a usable locator (src/host/constants.js REFUSAL.unavailable). */
      instanceMissing: 'instance-missing',
    })
    /**
     * PROPOSED wording (W3 brief P-3): new copy with no text in the spec, except `hostnameRefused`,
     * whose English is R-UI-02's. The user reviews this object at the W3 merge; the dictionaries
     * below take it unchanged.
     */
    const PROPOSED_WORDING = Object.freeze({
      en: Object.freeze({
        hostnameRefused: 'Open DSH at 127.0.0.1 to use Fishball',
        admitFailed: 'The Fishball page could not be opened.',
      }),
      zh: Object.freeze({
        hostnameRefused: '请通过 127.0.0.1 打开 DSH 以使用 Fishball',
        admitFailed: '无法打开 Fishball 页面。',
      }),
    })
    /**
     * U-DRAW's words. The English of `noInstance` is decided item #76; "Handover to…", "online" /
     * "offline" and "Hand over to <name>" are R-UI-10's; "Managed by" is R-NAME-05's; the rest,
     * and every Chinese text, is PROPOSED (the zh review stays deferred, #76).
     */
    const DRAW_WORDING = Object.freeze({
      en: Object.freeze({
        noInstanceTitle: 'Fishball isn\'t running here',
        noInstance: 'No Fishball child instance is running here. Open your Fishball instance\'s own page.',
        notReady: 'Fishball isn\'t ready ({state}).',
        retryLink: 'Retry',
        handOverTo: 'Hand over to {name}', handOverMany: 'Handover to…', takeBack: 'Take back', managedBy: 'Managed by {name}',
        idPrefix: 'ID:', online: 'online', offline: 'offline',
        handOverNoteLabel: 'Note (optional)', handOverConfirm: 'Hand over', handingOver: 'Handing over…', cancel: 'Cancel', close: 'Close',
        takeBackTitle: 'Take back',
        'refusal.unknown-session': 'This session could not be found.',
        'refusal.conflict': 'This session is already managed.',
        'refusal.no-agent': 'That agent can no longer take this session.',
        'refusal.not-managed': 'This session is not managed.',
        'refusal.invalid-request': 'That request was not accepted.',
        refusalFailed: 'That did not work.',
        noticeLabel: 'Notice ({count} since you last looked): {message}. Click to dismiss.',
      }),
      zh: Object.freeze({
        noInstanceTitle: 'Fishball 不在这里运行',
        noInstance: '此处没有正在运行的 Fishball 子实例。请打开你的 Fishball 实例自己的页面。',
        notReady: 'Fishball 尚未就绪（{state}）。',
        retryLink: '重试',
        handOverTo: '交给 {name}', handOverMany: '交给…', takeBack: '收回', managedBy: '由 {name} 管理',
        idPrefix: 'ID:', online: '在线', offline: '离线',
        handOverNoteLabel: '备注（可选）', handOverConfirm: '交接', handingOver: '交接中…', cancel: '取消', close: '关闭',
        takeBackTitle: '收回',
        'refusal.unknown-session': '找不到此会话。',
        'refusal.conflict': '此会话已有人管理。',
        'refusal.no-agent': '该代理已无法接管此会话。',
        'refusal.not-managed': '此会话没有被管理。',
        'refusal.invalid-request': '请求未被接受。',
        refusalFailed: '操作未成功。',
        noticeLabel: '提示（自上次查看以来 {count} 条）：{message}。点击关闭。',
      }),
    })
    /**
     * Stands for a `{name}` that is a node, not a string (withName): a character no dictionary or
     * principal name holds.
     */
    const NAME_MARK = '\u0000'
    /**
     * The snapshot streams' reopen rule (eventStore): EventSource's `readyState` CLOSED, and the
     * wait before a new stream. 2 s: soon enough to follow a connector reload, slow enough not to
     * hammer a DSH whose connector is gone for good.
     */
    const STREAM = Object.freeze({ closed: 2, reopenMs: 2000 })
    const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' })
    /**
     * The fish mark's shared look, used by the shell's sheet and by the parts (kit.ROW_MARK): the
     * managed-row cell, the dot and the running flip. cellPx copies DSH's leading cell (the seat's
     * contract in dsh-client-ui-workspace slots.d.ts, rc.2: "the 16px cell before the title"); the
     * cell is not sized by its parent, so a percentage would collapse. Revisit if DSH resizes it.
     * The dot sits at the mark's top-right and marks the fish's light; its green comes from DSH's
     * state token, so light and dark themes both read.
     */
    const ROW_MARK = Object.freeze({
      cellPx: 16,
      dot: Object.freeze({ sizePx: 7, topPx: -1, rightPx: -1, lit: 'lit' }),
      /** The flipping fish while a row runs (design ⑥): a half-turn, a hold, then the other half. */
      flipAnimation: 'fb-flip',
      flipSeconds: 1.8,
      flipOrigin: '50% 50%',
      flip: Object.freeze([[0, 0], [45, 180], [55, 180], [100, 360]]),
    })
    /**
     * The shell's seats (U-SHELL's slot registry): places in the shell's own surfaces that a part
     * fills (`seats.register(seat, value)`), so the shell draws them without knowing the part, and a
     * part that never loads leaves the shell's fallback. One value per seat; the latest wins.
     * - mark: the sidebar mark component `({size})` the sidebar row draws;
     * - pageOpened: a function the window calls once each time it mounts.
     */
    const SEAT = Object.freeze({ mark: 'mark', pageOpened: 'pageOpened' })
    const SLOT = Object.freeze({
      headerActions: 'conversation.session.header.actions',
      /** DSH's right-aligned session utilities (open-in-app, the log export), laid out beside the title, never over it. */
      headerUtilities: 'conversation.session.header.utilities',
      sessionMenu: 'sidebar.workspaces.session.menu.item',
      overlay: 'shell.overlay',
      /**
       * DSH's central pane, keyed by panel id ("conversation" is the session), and the sidebar's
       * global-panel rows that select it (dsh-client-ui-layout, dsh-client-ui-sidebar; the same
       * contract in 0.2.1-rc.5 and 0.2.2-rc.1).
       */
      main: 'main',
      panelList: 'sidebar.panellist',
      /** DSH's 16px cell before a session row's title, mounted only while the row is idle (dsh-client-ui-workspace, rc.2). */
      rowLeading: 'sidebar.session.row.leading',
      /**
       * DSH's resting area after a session row's time label, mounted in every state (0.2.2). While a
       * row runs, the leading seat is replaced by DSH's spinner, so the Fishball running fish lives
       * here. rc.3 has no such seat; slots.inject waits quietly and the fish simply does not mount.
       */
      rowTrailing: 'sidebar.session.row.trailing',
    })
    /**
     * The one Fishball accent (§8.5): the app's magenta. It is declared once here and exposed
     * once as `--fb-accent` (the style sheet below); the important notice's ring and the Retry
     * link's fallback colour read it, and the mark's eye and the count pill use it directly. DSH mounts this plugin's surfaces in several slots, so the variable is
     * set on the document rather than on a single root element.
     */
    const FISHBALL_ACCENT = '#EC0A6E'
    /**
     * FishMark (fishball app, Surfaces.kt): body and eye on a 24-unit grid. In the sidebar the
     * body takes the text colour so it reads on light and dark themes; the eye keeps the
     * app's magenta, the one colour the mark spends.
     */
    const FISH_MARK = Object.freeze({
      viewBox: '0 0 24 24',
      body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
      eye: 'M14.6 7.4 h2 v2 h-2 Z',
      bodyColor: 'currentColor',
      eyeColor: FISHBALL_ACCENT,
    })
    /**
     * The font the unread count ends on. DSH sets <html lang> to its display language
     * (dsh-client-locale), and a bare `sans-serif` then picks a per-language face: PingFang SC in
     * Chinese, lighter and shaped differently. Named Latin faces first give every language the English face.
     * DSH's own --dsw-font-family is SF Pro on macOS, wider than the approved look.
     */
    const BRAND_LATIN_FONT = 'Helvetica,Arial,sans-serif'
    /**
     * The important animation (§13.6) and the count pill's look: a short tail wag, repeated every
     * cycle while the fish's light is important, pivoting near the tail's root (a keyframe list, so
     * a change of look edits data); and the pill the notify prompt counts in, in the one accent.
     */
    const UNREAD_BADGE = Object.freeze({
      /** The keyframe name of the tail wag (declared once in the style sheet below). */
      wagAnimation: 'fb-wag',
      fill: FISH_MARK.eyeColor, textColor: '#fff',
      minWidth: '16px', height: '16px', paddingX: '4px', radius: '8px',
      fontFamily: BRAND_LATIN_FONT, fontSize: '10px', fontWeight: 800,
      cycleSeconds: 2.2, wagOrigin: '70% 40%',
      /** Keyframe percentages of one cycle: rest, then wag back and forth, then rest. */
      wag: Object.freeze([[0, 0], [55, 0], [62, -14], [70, 12], [78, -9], [86, 5], [100, 0]]),
    })
    const STYLE_ID = 'fishball-style'
    const CLS = Object.freeze({ field: 'fb-field', note: 'fb-note', code: 'fb-code', mark: 'fb-mark', markBox: 'fb-mark-box', wag: 'fb-wag', muted: 'fb-muted', managedRow: 'fb-managed-row', managedRowDot: 'fb-managed-row-dot', flip: 'fb-flip', embed: 'fb-embed', embedBar: 'fb-embed-bar', embedTitle: 'fb-embed-title', embedName: 'fb-embed-name', embedState: 'fb-embed-state', embedStateWords: 'fb-embed-state-words', embedCode: 'fb-embed-code', headerControl: 'fb-header-control', ellipsis: 'fb-ellipsis', embedActions: 'fb-embed-actions', embedFrame: 'fb-embed-frame', embedError: 'fb-embed-error', embedGlyph: 'fb-embed-glyph', embedDetails: 'fb-embed-details', embedLead: 'fb-embed-lead', link: 'fb-link', light: 'fb-light', principal: 'fb-principal', managedBy: 'fb-managed-by', refusal: 'fb-refusal', notice: 'fb-notice', noticeText: 'fb-notice-text', noticeCount: 'fb-notice-count' })
    /**
     * The fish's prompt bubble (R-FN-01: "a bubble beside the sidebar fish"): it sits `gapPx` to
     * the right of the fish's mark, level with its top, and keeps to `maxWidthPx` wide and
     * `maxHeightPx` tall (a 4000-code-point message scrolls inside it). Without a visible mark (the
     * sidebar is closed) it rests in the window's bottom-left corner, `edgePx` in, where the
     * sidebar's foot is.
     */
    const NOTICE_BUBBLE = Object.freeze({
      gapPx: 8, edgePx: 16, maxWidthPx: 280, maxHeightPx: 160, layer: 1000,
      /** Its inside: DSH's menu-row padding and caption size, the text-to-count gap. */
      paddingYPx: 10, paddingXPx: 12, fontSize: '13px', lineHeight: 1.5, innerGapPx: 10,
      /** Its entrance (a short fade from the fish's side) and the keyframe that draws it. */
      enterAnimation: 'fb-notice-in', enterShiftPx: 4,
      /** Values of data-fishball-notice-place: beside the fish (with the tail) or in the corner. */
      place: Object.freeze({ mark: 'mark', corner: 'corner' }),
      /**
       * Its tail: a small square turned 45°, half outside the bubble's left edge, `tailTopPx` down,
       * so it points at the middle of the fish the bubble is level with (DSH's 16px panel icon);
       * none in the corner place, where there is no fish.
       */
      tailPx: 8, tailTopPx: 4,
    })
    /** The gap between a principal's light and its label (R-UI-10). */
    const PRINCIPAL_GAP_PX = 6
    /**
     * The session header's text beside DSH's own (UI-FIX-D, the 390 px retake):
     * - `maxWidthPx`: the widest a one-line label grows before its ellipsis, DSH's own crumb cap
     *   (ConversationRoot .crumb max-width, 0.2.1-rc.5 and 0.2.2-rc.1);
     * - `narrowRowPx`: the title row's width (DSH makes it an inline-size container) at or below
     *   which "Managed by <principal>" is dropped, DSH's own breakpoint for its agent-preset label
     *   in the same row (dsh-client-ui-agent-preset `@container (width<=540px)`);
     * - `controlShareCqi`: the share of that row a header control may take, in container-query
     *   units, so on a 390 px header a long "Hand over to <name>" still leaves DSH's own utilities
     *   and the sidebar toggle (all `flex:none`) inside the row: they take about two-thirds of it.
     */
    const HEADER_LABEL = Object.freeze({ maxWidthPx: 220, narrowRowPx: 540, controlShareCqi: 30 })
    /**
     * DSH's caption and body type and its tinted-box padding (the sizes its settings fields and
     * Tag use), for the parts this sheet draws beyond DSH's own components.
     */
    const TYPE = Object.freeze({ caption: '12px/18px var(--dsw-font-family)', body: 'var(--dsw-font-xs-13)', boxPadding: '10px 12px', boxGapPx: 12, barPx: 3, detailGap: '4px 12px' })
    /** The header's fish beside the title (FishMark, the window's one brand mark). */
    const HEADER_MARK_PX = 18
    /** The window's state line: DSH's StateDot sizes, and the tones of each state's dot. */
    const STATE_DOT = Object.freeze({ sizePx: 8, byState: Object.freeze({ ready: 'done', failed: 'error', stopped: 'idle', disabled: 'idle' }), pending: 'ongoing', pendingSizePx: 12 })

    const en = {
      ...PROPOSED_WORDING.en,
      ...DRAW_WORDING.en,
      viewTitle: 'Fishball', embedTitle: 'Fishball chat', embedRefresh: 'Refresh',
      embedState: 'State', embedCode: 'Code',
      frameNotLoaded: "Fishball didn't load", frameWaitReason: "This frame hasn't confirmed that Fishball loaded.", frameOpenAgain: 'Open Fishball again',
      // The child's lifecycle states the window shows (K3 child.d.ts); `ready` reads "running".
      'frameState.loading': 'checking',
      'frameState.disabled': 'disabled', 'frameState.waiting': 'waiting', 'frameState.starting': 'starting', 'frameState.ready': 'running',
      'frameState.stopping': 'stopping', 'frameState.stopped': 'stopped', 'frameState.failed': 'failed',
    }
    const zh = {
      ...PROPOSED_WORDING.zh,
      ...DRAW_WORDING.zh,
      viewTitle: 'Fishball', embedTitle: 'Fishball 聊天', embedRefresh: '刷新',
      embedState: '状态', embedCode: '代码',
      frameNotLoaded: 'Fishball 未能加载', frameWaitReason: '此页面尚未确认 Fishball 已加载。', frameOpenAgain: '重新打开 Fishball',
      'frameState.loading': '检查中',
      'frameState.disabled': '已禁用', 'frameState.waiting': '等待中', 'frameState.starting': '启动中', 'frameState.ready': '运行中',
      'frameState.stopping': '停止中', 'frameState.stopped': '已停止', 'frameState.failed': '失败',
    }

    const css = [
      `.${CLS.mark}{color:var(--dsw-alias-label-primary)}`,
      `.${CLS.markBox}{position:relative;display:inline-flex}`,
      `.${CLS.wag}{transform-origin:${UNREAD_BADGE.wagOrigin};animation:${UNREAD_BADGE.wagAnimation} ${UNREAD_BADGE.cycleSeconds}s ease-in-out infinite}`,
      `@keyframes ${UNREAD_BADGE.wagAnimation}{${UNREAD_BADGE.wag.map(([at, degrees]) => `${at}%{transform:rotate(${degrees}deg)}`).join('')}}`,
      // The running fish's flip (design ⑥): a half-turn to the mirror, a short hold, then back.
      `.${CLS.flip}{transform-origin:${ROW_MARK.flipOrigin};animation:${ROW_MARK.flipAnimation} ${ROW_MARK.flipSeconds}s ease-in-out infinite}`,
      `@keyframes ${ROW_MARK.flipAnimation}{${ROW_MARK.flip.map(([at, degrees]) => `${at}%{transform:rotateY(${degrees}deg)}`).join('')}}`,
      // Motion is the only thing that stops: the light's dot and the prompt stay.
      `@media (prefers-reduced-motion:reduce){.${CLS.wag},.${CLS.flip}{animation:none}}`,
      `.${CLS.code}{font-family:var(--ds-font-family-code);overflow-wrap:anywhere}`,
      `.${CLS.muted}{color:var(--dsw-alias-label-tertiary)}`,
      // The Fishball view (§7) fills DSH's main area as a session does: DSH's conversation root,
      // its header (border, padding, the leading clearance a hidden macOS sidebar leaves) and its
      // name style; the frame takes the rest.
      `.${CLS.embed}{display:flex;flex-direction:column;flex:1;width:100%;height:100%;min-width:0;min-height:0;background:var(--dsw-alias-bg-base)}`,
      `.${CLS.embedBar}{box-sizing:border-box;flex:none;display:flex;align-items:center;gap:${DSH_SESSION_HEADER.gap};min-height:${DSH_SESSION_HEADER.minHeight};padding:${DSH_SESSION_HEADER.padding};padding-inline-start:max(${DSH_SESSION_HEADER.startPadding}, var(--dsh-frame-leading-clearance,0px));border-bottom:.5px solid var(--dsw-alias-border-l3)}`,
      // The fish and the name read as one title, as a session's crumb does.
      // The title, the tag and Refresh keep their size; only the code gives way on a narrow header.
      `.${CLS.embedTitle}{display:inline-flex;flex:none;align-items:center;gap:${DSH_SESSION_HEADER.gap}}`,
      `.${CLS.embedName}{color:var(--dsw-alias-label-primary);font-size:${DSH_SESSION_HEADER.nameFont};line-height:${DSH_SESSION_HEADER.nameLine};font-weight:500;white-space:nowrap}`,
      // The state tag and its safe code sit together, as one item of the header line.
      `.${CLS.embedState}{display:inline-flex;flex:0 1 auto;align-items:center;gap:${DSH_SESSION_HEADER.gap};min-width:0}`,
      `.${CLS.embedState}>:first-child{flex:none}`,
      `.${CLS.embedStateWords}{display:inline-flex;align-items:center;gap:${PRINCIPAL_GAP_PX}px}`,
      // The header's code is one line that ends in an ellipsis (its `title` and the body's details
      // carry it whole): a code such as INVALID_MAIN_HOME broke into three lines at 390 px.
      `.${CLS.embedCode}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:normal}`,
      // The header is a window-drag area on macOS Desktop, as DSH's own; its buttons are not.
      `.${CLS.embedActions}{display:flex;flex:none;align-items:center;gap:${DSH_SESSION_HEADER.gap};margin-inline-start:auto;-webkit-app-region:no-drag}`,
      `.${CLS.embedFrame}{display:block;flex:1;width:100%;min-height:0;border:0;background:var(--dsw-alias-bg-base)}.${CLS.embedFrame}[hidden]{display:none}`,
      // Not ready, failed or still checking: DSH's empty/error state (dsh-client-ui-schedule .empty), centred in the view.
      `.${CLS.embedError}{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${DSH_EMPTY_STATE.gap};padding:${DSH_EMPTY_STATE.padding};text-align:center;color:var(--dsw-alias-label-tertiary);font-size:${DSH_EMPTY_STATE.font};line-height:1.6}`,
      `.${CLS.embedError}>*{max-width:${DSH_EMPTY_STATE.maxWidth}}`,
      `.${CLS.embedError} p{margin:0}`,
      // The glyph's round well: DSH's neutral fill, the caption colour inside.
      `.${CLS.embedGlyph}{display:inline-flex;align-items:center;justify-content:center;width:${DSH_EMPTY_STATE.wellPx}px;height:${DSH_EMPTY_STATE.wellPx}px;margin-bottom:${DSH_EMPTY_STATE.wellGapPx}px;border-radius:50%;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-caption)}`,
      // The state's message reads first, in the primary colour; the safe details follow, smaller.
      `.${CLS.embedLead}{color:var(--dsw-alias-label-primary)}`,
      `.${CLS.embedDetails}{display:flex;flex-wrap:wrap;justify-content:center;gap:${TYPE.detailGap};font:${TYPE.caption}}`,
      `.${CLS.field}{display:flex;flex-direction:column;gap:6px;margin-top:8px}`,
      // DSH's input colours (dsh-client-ui-primitives SettingsValueField): --dsw-alias-border-primary is not defined in dialogs.
      `.${CLS.note}{width:100%;box-sizing:border-box;padding:8px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;resize:vertical}`,
      `.${CLS.managedRow}{position:relative;display:inline-flex;align-items:center;justify-content:center;width:${ROW_MARK.cellPx}px;height:${ROW_MARK.cellPx}px;color:var(--dsw-alias-label-primary)}`,
      // The fish's light (§13.6): DSH's own success token, so light and dark themes both read.
      `.${CLS.managedRowDot}{position:absolute;top:${ROW_MARK.dot.topPx}px;right:${ROW_MARK.dot.rightPx}px;box-sizing:border-box;width:${ROW_MARK.dot.sizePx}px;height:${ROW_MARK.dot.sizePx}px;border-radius:50%;background:var(--dsw-alias-state-success-primary);pointer-events:none}`,
      // A principal's status light (R-UI-10): green online, red offline, DSH's state tokens; the
      // element's text alternative carries the same, so colour is not the only signal.
      `.${CLS.light}{display:inline-block;flex:none;width:${ROW_MARK.dot.sizePx}px;height:${ROW_MARK.dot.sizePx}px;border-radius:50%;background:var(--dsw-alias-state-error-primary)}`,
      `.${CLS.light}[data-fishball-online="true"]{background:var(--dsw-alias-state-success-primary)}`,
      `.${CLS.principal}{display:inline-flex;align-items:center;gap:${PRINCIPAL_GAP_PX}px;overflow-wrap:anywhere}`,
      // "Managed by <principal>" beside the session title: DSH's caption size, as metadata, one line
      // capped as DSH caps a crumb; a narrow title row drops it (HEADER_LABEL), as DSH drops its preset label.
      `.${CLS.managedBy}{display:inline-block;max-width:${HEADER_LABEL.maxWidthPx}px;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary);font:${TYPE.caption};white-space:nowrap}`,
      `@container (width<=${HEADER_LABEL.narrowRowPx}px){.${CLS.managedBy}{display:none}}`,
      // A header control's label: one line, capped as DSH caps a crumb, ending in an ellipsis.
      `.${CLS.headerControl}{max-width:min(${HEADER_LABEL.maxWidthPx}px, ${HEADER_LABEL.controlShareCqi}cqi);white-space:nowrap}`,
      `.${CLS.headerControl} .${CLS.principal}{min-width:0;overflow-wrap:normal}`,
      `.${CLS.ellipsis}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
      // A hand-over refusal inside its dialog: DSH's danger tint (its Tag's danger tone) with an error
      // bar at its start; the words keep the label colour, so they read at full contrast on the tint.
      `.${CLS.refusal}{margin-top:${TYPE.boxGapPx}px;padding:${TYPE.boxPadding};border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent);border-radius:var(--dsw-radius-sm);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-label-primary);font:${TYPE.body};border-inline-start:${TYPE.barPx}px solid var(--dsw-alias-state-error-primary)}`,
      // The Retry link (decided #77) reads as a link: DSH's accent label colour, underlined, no button chrome.
      `.${CLS.link}{padding:0;border:0;background:none;color:var(--dsw-alias-label-link,var(--fb-accent));font:inherit;text-decoration:underline;cursor:pointer}`,
      // The notify prompt (R-FN-01): DSH's menu material and radius, beside the fish (NOTICE_BUBBLE).
      // DSH's popover material: an opaque layer-2 surface with its prominent elevation (DSH's menu
      // fill is translucent and needs a backdrop blur this plain element cannot rely on), so the text
      // reads on any page behind it. The message scrolls inside the text, so the tail stays put.
      `.${CLS.notice}{position:fixed;z-index:${NOTICE_BUBBLE.layer};display:flex;align-items:flex-start;gap:${NOTICE_BUBBLE.innerGapPx}px;box-sizing:border-box;max-width:${NOTICE_BUBBLE.maxWidthPx}px;max-height:${NOTICE_BUBBLE.maxHeightPx}px;padding:${NOTICE_BUBBLE.paddingYPx}px ${NOTICE_BUBBLE.paddingXPx}px;border:0;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font:inherit;font-size:${NOTICE_BUBBLE.fontSize};line-height:${NOTICE_BUBBLE.lineHeight};text-align:start;cursor:pointer;animation:${NOTICE_BUBBLE.enterAnimation} var(--ds-transition-duration,.2s) var(--ds-ease-in-out,ease)}`,
      `.${CLS.notice}:hover{background:color-mix(in srgb, var(--dsw-alias-bg-layer-2) 92%, var(--dsw-alias-label-primary))}`,
      `.${CLS.notice}:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:2px}`,
      `.${CLS.notice}[data-fishball-notice-place="${NOTICE_BUBBLE.place.mark}"]::before{content:"";position:absolute;left:-${NOTICE_BUBBLE.tailPx / 2}px;top:${NOTICE_BUBBLE.tailTopPx}px;width:${NOTICE_BUBBLE.tailPx}px;height:${NOTICE_BUBBLE.tailPx}px;background:inherit;transform:rotate(45deg);box-shadow:-.5px .5px 0 0 var(--dsw-alias-border-l3)}`,
      // Important: the one accent as a ring around the bubble (§8.5).
      `.${CLS.notice}[data-fishball-notice-important="true"]{box-shadow:var(--dsw-elevation-prominent),0 0 0 1px color-mix(in srgb, var(--fb-accent) 55%, transparent)}`,
      `@keyframes ${NOTICE_BUBBLE.enterAnimation}{from{opacity:0;transform:translateX(-${NOTICE_BUBBLE.enterShiftPx}px)}to{opacity:1;transform:none}}`,
      `@media (prefers-reduced-motion:reduce){.${CLS.notice}{animation:none}}`,
      `.${CLS.noticeText}{max-height:${NOTICE_BUBBLE.maxHeightPx - 2 * NOTICE_BUBBLE.paddingYPx}px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${CLS.noticeCount}{flex:none;min-width:${UNREAD_BADGE.minWidth};height:${UNREAD_BADGE.height};padding:0 ${UNREAD_BADGE.paddingX};border-radius:${UNREAD_BADGE.radius};background:${UNREAD_BADGE.fill};color:${UNREAD_BADGE.textColor};font:${UNREAD_BADGE.fontWeight} ${UNREAD_BADGE.fontSize}/${UNREAD_BADGE.height} ${UNREAD_BADGE.fontFamily};text-align:center}`,
      // The one accent token (§8.5).
      `:root{--fb-accent:${FISHBALL_ACCENT}}`,
    ].join('')

    const apiUrl = (path) => new URL(path, document.baseURI).toString()

    /**
     * One shared EventSource of server-sent snapshots at `path`, open while any component follows
     * it. The latest snapshot is the only state, and it is the server's.
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
      const open = () => {
        if (source || reopen) return
        source = new EventSource(apiUrl(path))
        source.onmessage = (event) => {
          let next
          try { next = JSON.parse(event.data) } catch { return }
          snapshot = next
          notify()
        }
        source.onerror = () => {
          if (source?.readyState !== STREAM.closed) return
          source = undefined
          snapshot = initial
          notify()
          reopen = setTimeout(() => { reopen = undefined; if (listeners.size > 0) open() }, STREAM.reopenMs)
        }
      }
      return {
        subscribe(listener) {
          listeners.add(listener)
          open()
          return () => {
            listeners.delete(listener)
            if (listeners.size > 0) return
            source?.close()
            source = undefined
            clearTimeout(reopen)
            reopen = undefined
          }
        },
        get: () => snapshot,
      }
    }
    /**
     * The connector UI backend's snapshot before its first frame (dsh-connector src/ui/state.js
     * `snapshot()`): nothing managed, no target, the light off, no notice. Embed-UI keeps no state
     * of its own (1.34): every part draws the backend's latest snapshot.
     */
    const EMPTY_UI = Object.freeze({
      marks: Object.freeze([]), targets: Object.freeze([]),
      attention: Object.freeze({ count: 0, important: false }), notice: null, light: Object.freeze({ on: false, important: false }),
    })
    const uiStores = new Map()
    /**
     * The one store of the backend's `events` route `path` (the host half's `services` answer,
     * `ui.events`), shared by every part, so a page opens one stream however many parts draw.
     */
    function uiSnapshots(path) {
      if (!uiStores.has(path)) uiStores.set(path, eventStore(path, EMPTY_UI))
      return uiStores.get(path)
    }
    /**
     * The hook a part draws the backend's snapshot with, followed live (R-UI-05, R-UI-10: no
     * reload). @param ui - the host half's `ui` routes (availability).
     */
    const snapshotHook = (ui) => function useSnapshot() {
      const store = uiSnapshots(ui.events)
      return React.useSyncExternalStore(store.subscribe, store.get)
    }

    /** POST one command to the Host. @returns { ok, code, answer } (the Host's refusal code and the whole answer). */
    async function send(path, body) {
      try {
        const response = await fetch(apiUrl(path), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
        if (response.ok) return { ok: true, code: null, answer: await response.json().catch(() => ({})) }
        const answer = await response.json().catch(() => ({}))
        return { ok: false, code: typeof answer.code === 'string' ? answer.code : null, answer }
      } catch {
        return { ok: false, code: null, answer: null }
      }
    }

    /**
     * Fishball's fish: wags while anything is unread; flips while a row runs (the managed mark's
     * running variant). A moving mark never wags, so the running state has one animation.
     * The fish is plain everywhere it is drawn, the sidebar row and managed session rows included,
     * where it keeps the unread pill and the green and yellow dots (the user's answer to D0). The
     * wrench badge is dsh-connector's alone (ICON-SET): DSH draws it from that package's manifest
     * icon on its Plugins card and settings page, never here.
     */
    function FishballIcon({ size, unread, moving, decorative = false }) {
      const animation = moving ? CLS.flip : unread ? CLS.wag : null
      // `decorative`: a brand glyph in the window's chrome (its header, the hint's well). It carries
      // no `data-fishball-mark`, which names the fish that stands for the light (the sidebar's and
      // the managed rows'), so the hook keeps meaning exactly that fish.
      return h('svg', { width: size, height: size, viewBox: FISH_MARK.viewBox, className: [CLS.mark, animation].filter(Boolean).join(' '), 'aria-hidden': true, ...(decorative ? {} : { 'data-fishball-mark': true }) },
        h('path', { d: FISH_MARK.body, fill: FISH_MARK.bodyColor }),
        h('path', { d: FISH_MARK.eye, fill: FISH_MARK.eyeColor }))
    }

    /** The fish's light as a dot on its mark (§13.6): no timer, no animation of its own. */
    const attentionDot = (dot) => h('span', { className: CLS.managedRowDot, 'data-fishball-dot': dot, 'aria-hidden': true })

    /**
     * A principal as R-NAME-08 shows it: its name as plain text, or, for a nameless one, a bold
     * `ID:` and its id. React escapes both, so markup in a name is shown, never run (HAND-EP-02
     * row 8). `principalText` is the same as one string, for a text alternative.
     */
    const principalLabel = (t, principal) => (principal.name === null
      ? h(React.Fragment, null, h('strong', null, t('idPrefix')), ' ', principal.id)
      : principal.name)
    const principalText = (t, principal) => (principal.name === null ? t('idPrefix') + ' ' + principal.id : principal.name)
    /**
     * A dictionary text with `node` in place of its `{name}` (R-UI-10's "Hand over to <name>", whose
     * name may hold the bold prefix): the text is asked for with a marker and cut there, so every
     * language keeps its own word order.
     */
    function withName(t, key, node) {
      const [before, after = ''] = t(key, { name: NAME_MARK }).split(NAME_MARK)
      return h(React.Fragment, null, before, node, after)
    }
    /** A principal's status light (R-UI-10): green or red, with its words as the text alternative. */
    const principalLight = (t, online) => h('span', {
      className: CLS.light, role: 'img', 'data-fishball-online': String(online),
      'aria-label': t(online ? 'online' : 'offline'), title: t(online ? 'online' : 'offline'),
    })
    /** A principal with its light, as every Hand over control shows it. */
    const principalWithLight = (t, principal, content) => h('span', { className: CLS.principal }, principalLight(t, principal.online), content)

    /**
     * The seat registry (SEAT). `register` returns its disposer, so a part fills a seat inside its
     * own effect and the seat empties when the part stops; a disposer of a replaced value changes
     * nothing.
     */
    const seats = (() => {
      const stores = new Map(Object.values(SEAT).map((seat) => [seat, valueStore(undefined)]))
      return Object.freeze({
        register(seat, value) {
          const store = stores.get(seat)
          store.set(value)
          return () => { if (store.get() === value) store.set(undefined) }
        },
        // Kit API: a part may read a seat once outside React; the shell itself follows seats with `use`.
        get: (seat) => stores.get(seat).get(),
        use: (seat) => { const store = stores.get(seat); return React.useSyncExternalStore(store.subscribe, store.get) },
      })
    })()

    /** The sidebar mark before (or without) the attention part: Fishball's icon alone, with no latch (R-UI-09). */
    const PlainMark = ({ size }) => h(FishballIcon, { size, unread: false })
    /** The sidebar row's mark: the attention part's seat, else `Plain`. */
    function makeMark(Plain) {
      return function Mark(props) {
        return h(seats.use(SEAT.mark) ?? Plain, props)
      }
    }

    /**
     * One GET of a route of this page: the JSON answer when `valid(answer)` holds, else undefined
     * (unreachable, not JSON, or not the route's shape), so the caller keeps what it showed. A
     * refusal's body is read too, so a `valid` that accepts it can follow it (the window's
     * `instance-missing`).
     */
    async function readJson(path, valid, signal) {
      try {
        const response = await fetch(apiUrl(path), { ...FRAME_UI.read, signal })
        const value = await response.json()
        return value !== null && typeof value === 'object' && valid(value) ? value : undefined
      } catch { return undefined }
    }
    /**
     * The child status route's answers the window follows: its status, or the refusal that the
     * locator went away after the page loaded (the window then shows the hint, Q-G3).
     */
    const isChildAnswer = (value) => value.ok === true || value.code === CHILD_UI.instanceMissing

    /** Whether two answers show the same thing, so a steady poll re-renders nothing. */
    const sameAnswer = (a, b) => JSON.stringify(a) === JSON.stringify(b)

    /**
     * Re-reads `path` at once and then every FRAME_UI.pollMs while the caller is mounted and the
     * tab is visible, one read at a time, keeping the last valid answer.
     * @returns the latest valid answer; `initial` until the first.
     */
    function usePoll(path, valid, initial) {
      const [latest, setLatest] = React.useState(initial)
      React.useEffect(() => {
        const abort = new AbortController()
        let polling = false
        const poll = () => {
          if (polling || document.hidden) return
          polling = true
          void readJson(path, valid, abort.signal).then((next) => {
            if (next !== undefined && !abort.signal.aborted) setLatest((previous) => (sameAnswer(previous, next) ? previous : next))
          }).finally(() => { polling = false })
        }
        poll()
        const timer = setInterval(poll, FRAME_UI.pollMs)
        return () => { clearInterval(timer); abort.abort() }
      }, [])
      return latest
    }

    /**
     * The frame's state tag: DSH's StateDot (a spinner while it moves, green running, red failed,
     * grey at rest) and Tag with the state's words, and the safe code beside it when there is one.
     * The words carry the state, so the dot is never the only signal.
     */
    function FrameState({ state, code, t }) {
      const dot = STATE_DOT.byState[state]
      return h('span', { className: CLS.embedState, 'data-fishball-embed-state': state, ...(code ? { 'data-fishball-embed-code': code } : {}) },
        // DSH's Tag takes no data attributes, so the hooks sit on this wrapper.
        h(Tag, { tone: EMBED_UI.stateTone[state] ?? EMBED_UI.neutralTone },
          h('span', { className: CLS.embedStateWords },
            dot === undefined ? h(StateDot, { state: STATE_DOT.pending, size: STATE_DOT.pendingSizePx }) : h(StateDot, { state: dot, size: STATE_DOT.sizePx }),
            t('frameState.' + state))),
        code ? h('code', { className: [CLS.code, CLS.muted, CLS.embedCode].join(' '), title: code }, code) : null)
    }

    /**
     * The `lang` value for DSH's active language, followed live. resolveText walks the same
     * fallback chain as this package's own `t` (FRAME_UI.lang). The store's value is the string
     * itself, so a dictionary registration (which also notifies) re-renders nothing, and only a
     * real language change gives the frame a new address, which reloads it.
     */
    function frameLangStore(locale) {
      return {
        subscribe: (listener) => locale.subscribe(listener),
        get: () => locale.resolveText(FRAME_UI.lang.byLocale),
      }
    }

    /** DSH's own empty/error state, centred in the view (dsh-client-ui-schedule .empty). */
    const emptyState = (...children) => h('div', { className: CLS.embedError }, ...children)
    // Hosted Frame Readiness v1 (connector contract §1.5), separate from process readiness.
    const FRAME_READY = Object.freeze({ type: 'fishball:frame-ready', version: 1 })
    const FRAME_WAIT = Object.freeze({ event: 'message', timeoutMs: 15000, waiting: 'waiting', recovery: 'recovery', shown: 'shown' })
    function isPageReady(data) {
      return data !== null && typeof data === 'object' && !Array.isArray(data) && Reflect.ownKeys(data).length === Object.keys(FRAME_READY).length &&
        Object.entries(FRAME_READY).every(([key, value]) => Object.hasOwn(data, key) && data[key] === value)
    }

    /** Mounted once per admission. A timeout changes the explanation, not the listener or frame. */
    function AdmittedFrame({ t, src, onRetry }) {
      const frame = React.useRef(null)
      const [phase, setPhase] = React.useState(FRAME_WAIT.waiting)
      React.useLayoutEffect(() => {
        // Install before the browser can deliver a posted message, even on an already-warm child.
        const expectedOrigin = new URL(src).origin
        const timer = setTimeout(() => setPhase(FRAME_WAIT.recovery), FRAME_WAIT.timeoutMs)
        function onMessage(event) {
          const source = frame.current?.contentWindow
          if (!source || event.source !== source || event.origin !== expectedOrigin || !isPageReady(event.data)) return
          clearTimeout(timer)
          setPhase(FRAME_WAIT.shown)
        }
        window.addEventListener(FRAME_WAIT.event, onMessage)
        return () => { window.removeEventListener(FRAME_WAIT.event, onMessage); clearTimeout(timer) }
      }, [src])
      return h(React.Fragment, null,
        h('iframe', { ref: frame, hidden: phase !== FRAME_WAIT.shown, className: CLS.embedFrame, src, title: t('embedTitle'), allow: EMBED_UI.iframeAllow, referrerPolicy: EMBED_UI.iframeReferrerPolicy, 'data-fishball-embed-frame': true }),
        phase === FRAME_WAIT.waiting ? loadingState(t) : phase === FRAME_WAIT.recovery ? emptyState(warningGlyph(),
          h('p', { className: CLS.embedLead, role: 'alert' }, t('frameNotLoaded')),
          h('p', null, t('frameWaitReason')),
          h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: onRetry }, t('frameOpenAgain'))) : null)
    }
    /** The glyph that opens every not-framed state, in its round well; decorative, as the words say it. */
    const glyphWell = (glyph) => h('span', { className: CLS.embedGlyph, 'aria-hidden': true }, glyph)
    /** The view's "checking" state, before its first answer: DSH's spinner over the words. */
    const loadingState = (t) => emptyState(
      glyphWell(h(StateDot, { state: STATE_DOT.pending, size: EMBED_UI.warningIconPx })),
      h('p', { role: 'status' }, t('frameState.' + FRAME_UI.loading)))
    /** The warning glyph of a not-ready child or a refused admission. */
    const warningGlyph = () => glyphWell(h(IconWarningOutlineRegular, { size: EMBED_UI.warningIconPx }))
    /**
     * A not-ready child: "Fishball isn't ready (<state>)." as the lead line, then "State <state>"
     * and, when there is one, "Code <code>" as the safe details, side by side.
     */
    const stateDetails = (t, state, code) => [
      h('p', { key: 'lead', className: CLS.embedLead }, t('notReady', { state: t('frameState.' + state) })),
      h('div', { key: 'details', className: CLS.embedDetails },
        h('p', null, t('embedState'), ' ', h('code', { className: CLS.code }, state)),
        code ? h('p', null, t('embedCode'), ' ', h('code', { className: CLS.code }, code)) : null),
    ]

    /**
     * Tells the attention part the window opened, once per mount (not on every snapshot or iframe
     * refresh; a ref keeps a re-run effect from clearing twice): the backend then clears the latch
     * and the prompt (§13.6, R-FN-01). The hint is the window too, so it counts.
     * The seat is followed, not read once (review UI-06): the attention chunk loads on its own and
     * may register after the window mounted, and that open still clears. The open counts as
     * delivered only once a registered callback was called.
     */
    function useWindowOpened() {
      const opened = React.useRef(false)
      const pageOpened = seats.use(SEAT.pageOpened)
      React.useEffect(() => {
        if (opened.current || pageOpened === undefined) return
        opened.current = true
        pageOpened()
      }, [pageOpened])
    }

    /**
     * What the framing view does while mounted: the window's opening, and the language the frame
     * opens in, followed live. The window frames only the hosted child's Fishball page
     * (`FRAME_UI.page.chat`, Q-G3).
     * @returns the frame's `lang`.
     */
    function useFrameLang(frameLang) {
      useWindowOpened()
      return React.useSyncExternalStore(frameLang.subscribe, frameLang.get)
    }

    /**
     * The window's chrome: DSH's session header with the title, then the body. Every view draws
     * it, so the header cannot drift between them. It has no settings button: Fishball settings
     * and DSH settings are fishball-ui's entries inside the framed page (the user, U-WIRE).
     * Optional parts:
     * - `state` (and `code`): the state tag; the hint has none, as there is no child to describe;
     * - `onRefresh`: Refresh, enabled by `canRefresh`.
     */
    function FrameChrome({ t, page, state, code, canRefresh, onRefresh, body }) {
      return h('section', { className: CLS.embed, 'aria-label': t('viewTitle'), 'data-fishball-embed': true, 'data-fishball-embed-page': page },
        h('header', { className: CLS.embedBar, 'data-window-drag': true },
          h('span', { className: CLS.embedTitle },
            h(FishballIcon, { size: HEADER_MARK_PX, unread: false, decorative: true }),
            h('span', { className: CLS.embedName }, t('viewTitle'))),
          state === undefined ? null : h(FrameState, { state, code, t }),
          h('div', { className: CLS.embedActions },
            onRefresh === undefined ? null : h(Button, { type: 'button', size: 'sm', variant: 'ghost', icon: h(IconRefreshOutlineRegular, { size: EMBED_UI.refreshIconPx }), disabled: !canRefresh, onClick: onRefresh }, t('embedRefresh')))),
        body)
    }


    /**
     * The frame's one-time address for `{view, lang}` while the child is ready: asked of the admit
     * route `path` afresh whenever the view, the language, the generation (Refresh) or readiness changes,
     * because a ticket is single-use (UIM-UC-01 A1, A2). The answer is held only in this
     * component's state for that one frame document. `{refused}` carries the route's code.
     */
    function useAdmission(path, view, lang, ready, generation) {
      const attempt = React.useMemo(() => ({ path, view, lang, ready }), [path, view, lang, ready, generation])
      const [result, setResult] = React.useState(undefined)
      React.useEffect(() => {
        if (!attempt.ready) return undefined
        let live = true
        void send(attempt.path, { view: attempt.view, lang: attempt.lang }).then(({ ok, code, answer }) => {
          if (live) setResult({ attempt, admission: ok && typeof answer?.url === 'string' ? { url: answer.url } : { refused: code } })
        })
        return () => { live = false }
      }, [attempt])
      // Retire the previous frame on this render, not in a later effect: never mount its spent
      // admission again while the next one is being requested.
      return result?.attempt === attempt ? result.admission : undefined
    }

    /**
     * The Retry link of a child that is not ready (decided #77; R-UI-03 amended by 1.33): it opens
     * the instance's own settings page, where Retry is, through DSH's plugin navigation. A link,
     * not a button, because it takes the user to another page and starts nothing itself.
     */
    function retryLink(ctx, t) {
      const open = (event) => {
        event.preventDefault()
        const navigation = ctx.get(FRAME_UI.navigation)
        // Without DSH's plugin navigation, the Plugins panel, where the instance's row opens its page.
        if (navigation) navigation.openBundle(FRAME_UI.instancePackage)
        else ctx.get(SERVICE.layout)?.selectPanel(EMBED_UI.pluginsPanelId)
      }
      return h('p', { key: 'retry' }, h('a', { href: '#', className: CLS.link, 'data-fishball-retry-link': true, onClick: open }, t('retryLink')))
    }

    /**
     * The window over the instance locator (U-SHELL, U-DRAW; design §4.2; R-UI-02; Q-G3; decided
     * #77): the child's state and code outside the frame, and the frame's address from admit only.
     * A child that is not ready shows its state and the Retry link, no frame. A page opened under
     * any name but a loopback one gets `hostname-refused` and shows R-UI-02's text instead of a
     * frame. Only an admitted page's fixed document-ready marker can reveal that frame.
     */
    function makeChildView(ctx, t, route) {
      const frameLang = frameLangStore(ctx.locale)
      return function FishballChildView() {
        const status = usePoll(route.status, isChildAnswer, undefined)
        const page = FRAME_UI.page.chat
        const lang = useFrameLang(frameLang)
        const [generation, setGeneration] = React.useState(0)
        const reopen = () => setGeneration((value) => value + 1)
        const state = status?.status?.state ?? FRAME_UI.loading
        const code = status?.status?.code ?? null
        const ready = state === CHILD_UI.readyState
        const admission = useAdmission(route.admit, page, lang, ready, generation)
        // A hostname refusal stays until the page is opened under another name; any other refusal
        // can be asked again with Refresh, as a framed page can be reloaded.
        const hostnameRefused = admission?.refused === CHILD_UI.hostnameRefused
        if (status?.code === CHILD_UI.instanceMissing) return hintChrome(t)
        const body = status === undefined
          ? loadingState(t)
          : !ready
            ? emptyState(warningGlyph(), ...stateDetails(t, state, code), retryLink(ctx, t))
            : admission === undefined
              ? loadingState(t)
              : admission.refused !== undefined
                ? emptyState(warningGlyph(), hostnameRefused
                  ? h('p', { role: 'alert', 'data-fishball-hostname-refused': true }, t('hostnameRefused'))
                  : h('p', { role: 'alert', 'data-fishball-admit-refused': admission.refused ?? '' }, t('admitFailed')))
                : h(AdmittedFrame, { key: generation, t, src: admission.url, onRetry: reopen })
        return h(FrameChrome, {
          t, page, state, code,
          canRefresh: admission !== undefined && !hostnameRefused,
          onRefresh: reopen,
          body,
        })
      }
    }

    /**
     * The window with no usable instance (Q-G3: "当不存在子实例，包括只连接外部实例时提示用户当前没有子实例运行，
     * 需要转去外部实例的页面"; R-UI-08 amended by 1.41): the hint, and no frame, state or Retry. An
     * external agent connected to this connector has its own page, which embed-UI cannot know.
     */
    function makeHintView(t) {
      return function FishballHintView() {
        useWindowOpened()
        return hintChrome(t)
      }
    }
    /** The hint inside the window's chrome: no frame, no state, no Retry. */
    const hintChrome = (t) => h(FrameChrome, {
      t, page: FRAME_UI.page.chat,
      body: emptyState(
        glyphWell(h(FishballIcon, { size: EMBED_UI.warningIconPx, unread: false, decorative: true })),
        h('p', { className: CLS.embedLead }, t('noInstanceTitle')),
        h('p', { 'data-fishball-no-instance': true }, t('noInstance'))),
    })

    /**
     * The Fishball row in DSH's sidebar panel list: embed-UI's one Fishball entry (R-UI-11). DSH draws the row, its label and its selected highlight (`aria-current`
     * while the view is open, cleared when you open a session), exactly as for Plugins and Tasks;
     * the icon is the fish mark (the attention part's latch in it, when that part runs).
     */
    const registerSidebarEntry = (ctx, Icon, t) => ctx.slots.inject(SLOT.panelList, () => ctx.slots.register({ name: SLOT.panelList, id: EMBED_UI.panelId, order: EMBED_UI.panelOrder, locale: NS, label: () => t('viewTitle') }, Icon))

    /** One value components share and follow (dialog requests, the seats); set() notifies them. */
    function valueStore(initial) {
      let current = initial
      const listeners = new Set()
      return {
        get: () => current,
        set: (next) => { current = next; for (const listener of listeners) listener() },
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
      }
    }

    function mountStyles() {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    /**
     * What the parts share with the shell (client.marks.js, client.attention.js): the backend's one
     * snapshot stream and the POST helper, one style sheet and dictionary, the principal's label
     * and light, and the seats. A part is a factory of this kit and the host half's availability;
     * client.js starts each result as a sub-plugin of the row.
     */
    exports.kit = Object.freeze({
      NS, SLOT, CLS, ROW_MARK, NOTICE_BUBBLE, SEAT, seats,
      snapshotHook, send, valueStore, FishballIcon, attentionDot, principalLabel, principalText, withName, principalWithLight,
    })
    /**
     * The shell as a client plugin for what is usable now (readAvailability).
     * @param available - the host half's answer (client.js readAvailability): its flags, `routes`
     *   and the backend's `ui` routes.
     */
    exports.shellPlugin = (available) => ({ name: SHELL_NAME, inject: ['slots', 'locale'], apply: (ctx) => apply(ctx, available) })
    function apply(ctx, available) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'fishball: dictionaries')
      ctx.effect(mountStyles, 'fishball: styles')
      // The Fishball view in DSH's main area, as Plugins and Tasks register theirs (§7). The key is
      // registered for the plugin's life, as theirs are.
      // The window and its sidebar fish by availability (UIM-EP-01): the hosted child's window, or
      // the hint without one (Q-G3, QD4). client.js starts the shell only with the connector's
      // backend (Q-U1).
      const View = available.page ? makeChildView(ctx, t, available.routes) : makeHintView(t)
      const Mark = makeMark(PlainMark)
      ctx.effect(() => ctx.slots.inject(SLOT.main, () => ctx.slots.register({ name: SLOT.main, key: EMBED_UI.panelId, locale: NS }, View)), 'fishball: main view')
      ctx.effect(() => registerSidebarEntry(ctx, Mark, t), 'fishball: sidebar row')
    }
    return module.exports
  },
})