/**
 * fishball-embed-ui, the shell part (V3 U-SHELL split of the V2 connector client, DESIGN §10):
 * 1. The one Fishball entry (R-UI-11): the fish row in DSH's sidebar panel list. DSH's own brand
 *    mark and name are not overridden (no sidebar.brand.* slot), so V2's brand override, its
 *    click takeover and the Sidebar entry preference are gone.
 * 2. The connector's Plugins card (§0.7, D24): DSH's form of the connector's active limits
 *    (src/config.js; C2: the only place they change), and "Open instance
 *    settings" while the attached instance registered `ui.settings`. The instance's own status,
 *    model, plugins and settings are the instance's pages, not this card.
 * 3. The Fishball view (slim §7) inside the connector's frame (§0.5 "The frame", D27): the
 *    attached instance's `ui.chat` (or its `ui.settings`, from the card) framed in DSH's main area,
 *    the `main` slot where a session's conversation shows, opened by the Fishball row in the sidebar's
 *    panel list. The frame shows the instance's state, Fishball's unread count and
 *    Connector settings; with no instance it shows an empty state and no iframe.
 * 4. The kit the other parts are built from (`exports.kit`): the one state stream, POST helper,
 *    style sheet and dictionary, and the seats (SEAT) where the attention part draws the fish's
 *    latch in the sidebar row and the frame. The marks (client.marks.js) and the
 *    ask_fishball row with the card records (client.records.js) are parts of their own.
 * The in-process Fishball's own surfaces (its chat dock, pile, welcome card, model gate, the
 * Plugins page's Fishball tab and install dialog, the Messenger look) were removed with it.
 *
 * The mark is FishMark from the owner's fishball app (THIRD_PARTY_NOTICES); the connector's own
 * icon is FishMark with a wrench badge (assets/connector-icon.svg, D22).
 *
 * State comes from GET /api/fishball/events (server-sent snapshots).
 */
window.__ModuleLoader__.load({
  // V3 R-EMBED: moved here unchanged from packages/connector/client.js (R-ARCH-03: the connector
  // has no browser client; R-ARCH-04), then split by U-SHELL. It is a package-local chunk of
  // fishball-embed-ui's client (client.js starts it as a sub-plugin), so it registers under that
  // package with its chunk name. Its plugin name, settings namespace and slot keys stay the connector's, because it
  // still draws and configures the connector's row.
  id: 'fishball-embed-ui',
  chunk: 'client.shell.js',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { Button, FISH_LOGO_PATH, FISH_LOGO_VIEWBOX, IconWarningOutlineRegular, SettingsForm, SettingsFormModel, SettingsValueField, Tag, settingsNumberField } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const PACKAGE_NAME = 'fishball-connector'
    /** Host row id; also the settings namespace configForms serves (cordis.patch.yml, design §0.2 D22). */
    const ENTRY_ID = 'fishball-connector'
    const NS = 'fishball'
    /** Client services read on demand (not injected: Fishball works without each of them). */
    const SERVICE = Object.freeze({ layout: 'layout' })
    const SUMMARY_VIEW = 'summary'
    /** Host statuses (src/constants.js STATUS) the page compares against. */
    const STATUS = Object.freeze({ starting: 'starting', live: 'live' })
    /** Fishball's own feature plugins in the snapshot's `features` (src/builtins.js FEATURE_KEY; revision 10c). */
    /** Whether a feature runs; a Host without the field (older) shows everything, as before. */
    const API = Object.freeze({ events: 'api/fishball/events', send: 'api/fishball/send', managed: 'api/fishball/managed', requestsAnswer: 'api/fishball/requests/answer', grantsRevoke: 'api/fishball/grants/revoke', attentionRead: '/api/fishball/connector/attention/read' })
    /**
     * The Fishball view (§7) and the connector's frame around it (design §0.5 "The frame", D27).
     * `panelId` is one key shared by the `main` occupant and its `sidebar.panellist` row, as DSH's
     * Plugins ("plugins") and Tasks ("schedules") panels do. `panelOrder` puts the row first, before
     * Plugins (0) and Tasks (10): Fishball is the conversation you open most, so it sits where a
     * pinned session would. `pluginsPanelId` is DSH's own Plugins panel, which the empty state
     * opens at its list (conn-OQ-31). `warningIconPx` is the glyph of DSH's own empty/error state
     * (dsh-client-ui-schedule's list error, 24px). `stateTone` maps the frame's state to DSH's Tag
     * tones (the ones its plugin page uses). DSH's Tag styles `danger`, not `error`, on
     * 0.2.1-rc.5 and 0.2.2-rc.1 (dsh-web-frontend's `[data-tone=danger]`), so failed states keep `danger`.
     * The framed path is the attached instance's own `ui.chat` or `ui.settings` as it registered
     * it (the contract already refused a path with a scheme, a host or a token, contract §1.2),
     * plus contract 1.1's `lang` parameter (FRAME_UI.lang); nothing else is appended or rewritten.
     */
    const EMBED_UI = Object.freeze({
      panelId: 'fishball', panelOrder: -10, pluginsPanelId: 'plugins', warningIconPx: 24,
      stateTone: Object.freeze({ ready: 'info', attached: 'info', failed: 'danger', 'connection-interrupted': 'danger' }), neutralTone: 'neutral',
      /**
       * Clipboard write only, for every origin the frame lands on. A bare feature means the src
       * origin, which is the main origin's launch path; the instance's launch then redirects the
       * frame to its own child origin (PG-ORIGIN), where native copy actions would otherwise be
       * refused. The wildcard is safe here because src is only an instance-registered relative
       * path on the main origin (contract 1.2 refuses absolute or token-bearing paths). Its
       * authenticated launch redirects only to the exact owned child, and the grant is write-only:
       * no clipboard-read or any other feature (Fishball's decision, 2026-11-10).
       */
      iframeAllow: 'clipboard-write *',
      /**
       * The framed page is an admission launch: the instance may redirect it to another origin on
       * this host (PG-ORIGIN), so the frame sends no referrer onward (docs/planning/v2-final-scope.md §4.3 (4)).
       */
      iframeReferrerPolicy: 'no-referrer',
    })
    /**
     * DSH's session header (dsh-client-ui-conversation ConversationRoot .header/.titleRow/
     * .crumbCurrent, identical in 0.2.1-rc.5 and 0.2.2-rc.1), without its tab row: the Fishball
     * view has one page, so the header is one line of DSH's title-row height plus padding.
     */
    const DSH_SESSION_HEADER = Object.freeze({ minHeight: '52px', padding: '10px 28px', startPadding: '20px', gap: '8px', nameFont: '14px', nameLine: '20px' })
    /** DSH's empty/error state (dsh-client-ui-schedule TaskManagerPage .empty, .emptyAction). */
    const DSH_EMPTY_STATE = Object.freeze({ padding: '48px 20px', gap: '8px', font: '14px', actionGap: '8px' })
    /**
     * The frame's instance data (src/connector-service.js view(), served by the connector's own
     * routes; the browser never calls an instance's routes). An attach or a detach arrives at once
     * in the state stream's `instance` field (conn-OQ-26). `status()` has no event in contract v1,
     * so the open view also re-reads the route once a second (conn-OQ-25), only while it is
     * mounted and the tab is visible, one read at a time.
     * `ready` and `attached` (an instance without `status`) are the states whose page is framed;
     * `unattached`, `attached` and `connection-interrupted` are the connector's display states, not
     * contract STATUS values.
     */
    const FRAME_UI = Object.freeze({
      instancePath: 'api/fishball/connector/instance',
      retryPath: 'api/fishball/connector/instance/retry',
      read: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      pollMs: 1000,
      framedStates: Object.freeze(['ready', 'attached']),
      loading: 'loading',
      /**
       * No instance at all. An instance whose channel ended (a killed child) is not attached either,
       * but keeps its own state, code and Retry (src/connector-service.js `kept`), so the view tells
       * them apart by this state rather than by `attached`.
       */
      unattached: 'unattached',
      /** The connector closed the channel itself (src/connector-service.js FRAME_STATE.interrupted). */
      interrupted: 'connection-interrupted',
      /** The frame's Retry refusal when the answer carried no code (contract STATUS_CODES.unavailable). */
      retryFailed: 'NATIVE_UNAVAILABLE',
      /** Which of the instance's pages the view frames: its chat, or its settings from the Plugins card. */
      page: Object.freeze({ chat: 'chat', settings: 'settings' }),
      /** DSH's pluginNavigation service and the row its Connector settings button opens (DSH's form of it). */
      navigation: 'pluginNavigation',
      /**
       * Contract 1.1's language parameter (keep in step with contract/contract.js UI_LANG; this
       * bundle has no build step, so it cannot import the contract). `byLocale` is DSH's text map
       * for ctx.locale.resolveText: DSH's locale id (lowercase, `en` required) to the `lang` value.
       * resolveText walks the active language's fallback chain exactly as the connector's own
       * `t` does, so the page opens in the same language as the connector's words: a language pack
       * that falls back to `zh` frames `zh`, and any other language frames `en`.
       */
      lang: Object.freeze({ parameter: 'lang', byLocale: Object.freeze({ en: 'en', zh: 'zh' }) }),
      /** The URL marks the framed address is cut at, so its path, other parameters and fragment stay verbatim. */
      url: Object.freeze({ fragment: '#', query: '?', separator: '&', assign: '=' }),
    })
    /**
     * The V3 frame (U-SHELL; design §4.1, §4.2; R-UI-02, R-UI-03): the instance locator
     * `fishballChild` as embed-UI's host half re-serves it. Keep `route` in step with
     * src/host/constants.js ROUTE (this chunk is a classic script and cannot import it); the paths
     * are relative to DSH's page, as V2's are.
     * - The frame's `src` is only ever `admit`'s one-time URL, asked for afresh for each frame
     *   document (first open, a language change, Refresh, the child turning ready again); it is
     *   never stored or logged, and the address holds no token (the ticket is redeemed by the child
     *   into its own cookie, S4).
     * - `hostnameRefused` is K3's AdmitErrorCode: the page was not opened under a loopback name, so
     *   the view shows the refusal text and no frame (UIM-EP-02 row 4).
     * - `retryStates`/`retryCodes`: where K3 `retry()` acts (decided 1 = A: a `failed` child, or
     *   `token-revoked`), so the view offers Retry only there.
     */
    const CHILD_UI = Object.freeze({
      route: Object.freeze({
        services: 'api/fishball-embed-ui/services',
        status: 'api/fishball-embed-ui/child/status',
        retry: 'api/fishball-embed-ui/child/retry',
        admit: 'api/fishball-embed-ui/child/admit',
        modelsCheck: 'api/fishball-embed-ui/child/models/check',
        modelsAdd: 'api/fishball-embed-ui/child/models/add',
      }),
      readyState: 'ready',
      hostnameRefused: 'hostname-refused',
      retryStates: Object.freeze(['failed']),
      retryCodes: Object.freeze(['token-revoked']),
      /** What the host half reports usable (src/host/services.js availability); all false when unreadable. */
      none: Object.freeze({ page: false, connector: false, legacy: false }),
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
    /** Brand icon choices (src/constants.js BRAND_STYLE). */
    const BRAND_STYLE = Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' })
    const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' })
    /**
     * The fish mark's shared look, used by the shell's sheet and by the parts (kit.ROW_MARK): the
     * managed-row cell, the dot and the running flip. cellPx copies DSH's leading cell (the seat's
     * contract in dsh-client-ui-workspace slots.d.ts, rc.2: "the 16px cell before the title"); the
     * cell is not sized by its parent, so a percentage would collapse. Revisit if DSH resizes it.
     * The dots sit at the mark's top-right; green/yellow come from DSH's state tokens, so light and
     * dark themes both read.
     */
    const ROW_MARK = Object.freeze({
      cellPx: 16,
      dot: Object.freeze({ sizePx: 7, topPx: -1, rightPx: -1, unread: 'unread', action: 'action' }),
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
     * - frameBadge: a component `({t})` in the frame's header;
     * - pageOpened: a function the view calls once each time it mounts.
     */
    const SEAT = Object.freeze({ mark: 'mark', frameBadge: 'frameBadge', pageOpened: 'pageOpened' })
    const SLOT = Object.freeze({
      bundleConfig: 'plugins.bundle.config',
      headerActions: 'conversation.session.header.actions',
      sessionMenu: 'sidebar.workspaces.session.menu.item',
      overlay: 'shell.overlay',
      /**
       * DSH's central pane, keyed by panel id ("conversation" is the session), and the sidebar's
       * global-panel rows that select it (dsh-client-ui-layout, dsh-client-ui-sidebar; the same
       * contract in 0.2.1-rc.5 and 0.2.2-rc.1).
       */
      main: 'main',
      panelList: 'sidebar.panellist',
      toolview: 'tool.call.toolview',
      chatNode: 'conversation.chat.node',
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
     * The limit fields, in the order the Host declares them (src/config.js LIMITS, the
     * conn-OQ-20 set). The form model needs its fields before the first state frame arrives, so
     * the browser keeps this list; the Host schema still decides validity on save.
     */
    const LIMIT_FIELDS = Object.freeze(['maxQueuedInputs', 'maxActiveWatches', 'maxPendingApprovals', 'argumentExcerptBytes', 'maxMessageBytes', 'auditEntriesKept', 'requestUserMessageBytes', 'rationaleChars', 'watchesShown', 'readSessionMessages', 'readSessionBytes', 'forwardExcerptBytes', 'userMessagesListed', 'userMessageExcerptChars'])
    /**
     * The one Fishball accent (§8.5): the app's magenta. It is declared once here and exposed
     * once as `--fb-accent` (the style sheet below); the ring, the switches and the brand's
     * badge all read it. DSH mounts this plugin's surfaces in several slots, so the variable is
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
     * The connector's fixed icon (D22, conn-OQ-37, the user's "Fishball鱼的logo加一个扳手角标"):
     * FishMark with a wrench badge at its bottom right, on the same 24-unit grid. The wrench is an
     * open-ended head (an arc around `head` with its jaw toward the top right) and a handle toward
     * the bottom left, drawn as strokes in the text colour so it reads in light and dark. It sits
     * in the corner FishMark leaves empty (right of the tail, below the body's slanted edge), so it
     * needs no knock-out. assets/connector-icon.svg draws the same paths on the launcher tile.
     */
    const WRENCH_BADGE = Object.freeze({
      head: 'M22.93 17.48 A2 2 0 1 1 21.52 16.07',
      handle: 'M19.59 19.41 L16.4 22.6',
      strokeWidth: 1.6,
      lineCap: 'round',
      color: 'currentColor',
    })
    /**
     * The §8.5 button style: DSH's Button with its normal (secondary) background and text plus
     * one class whose only rule is the magenta ring. The old filled magenta constants
     * (FISHBALL_COLOUR) are gone; the ring mixes the accent with the current surface, so light
     * and dark themes both work and DSH keeps its own hover, active and focus-visible states.
     * 0.2.2-rc.1's Button has no `secondary` variant class; the base variant is the normal
     * transparent background and label colour, so this is the intended look either way.
     */
    const ACCENT_BUTTON = Object.freeze({ variant: 'secondary', className: 'fb-outline' })
    /**
     * The font the unread count ends on. DSH sets <html lang> to its display language
     * (dsh-client-locale), and a bare `sans-serif` then picks a per-language face: PingFang SC in
     * Chinese, lighter and shaped differently. Named Latin faces first give every language the English face.
     * DSH's own --dsw-font-family is SF Pro on macOS, wider than the approved look.
     */
    const BRAND_LATIN_FONT = 'Helvetica,Arial,sans-serif'
    /**
     * Unread replies on the mark: a count pill on its top-right corner and a short tail wag,
     * repeated every WAG cycle while anything is unread (the pill pops with the wag and rests
     * between). The pill takes the brand's one accent and a ring in the sidebar's label colour
     * so it separates from the mark on light and dark themes, as the Deepseek Harness tag does.
     * The pill shows the count up to `max`, then "${max}+", so it stays narrow in the sidebar.
     * The wag pivots near the tail's root; it is a keyframe list, so a change of look edits data.
     * The pill overhangs the mark by 7px above and 9px to the right.
     */
    const UNREAD_BADGE = Object.freeze({
      max: 99,
      /** Keyframe names of the tail wag and the pill's pop (declared once in the style sheet below). */
      wagAnimation: 'fb-wag', popAnimation: 'fb-pop',
      fill: FISH_MARK.eyeColor, textColor: '#fff',
      ring: '0 0 0 2px var(--dsw-alias-label-primary-inverted)',
      minWidth: '16px', height: '16px', paddingX: '4px', radius: '8px',
      fontFamily: BRAND_LATIN_FONT, fontSize: '10px', fontWeight: 800, top: '-7px', right: '-9px',
      cycleSeconds: 2.2, wagOrigin: '70% 40%',
      /** Keyframe percentages of one cycle: rest, then wag back and forth, then rest. */
      wag: Object.freeze([[0, 0], [55, 0], [62, -14], [70, 12], [78, -9], [86, 5], [100, 0]]),
      /** The pill's pop, over the same stretch of the cycle as the wag. */
      pop: Object.freeze([[0, 1], [58, 1], [66, 1.35], [74, 0.95], [82, 1.1], [100, 1]]),
    })
    /**
     * DSH's own orca (the brand icon of DSH's build) and its swim, which the stock new-session
     * window plays when you hover the orca: the body morphs through a tail-up and a tail-down
     * shape (SMIL on `d`) while the whole mark sways a little (CSS). The two shapes and the
     * timings are copied from dsh-client-ui-conversation (HeroShell: HERO_SWIM_UP_PATH,
     * HERO_SWIM_DOWN_PATH, 1.6 s, the sway keyframes). They are not exported, so they cannot be
     * imported; the resting shape itself comes from the primitives (FISH_LOGO_PATH).
     * With DeepSeek's icon chosen the swim replaces the tail wag: it runs once per unread cycle
     * (UNREAD_BADGE.cycleSeconds), then rests, so both icons repeat at the same pace.
     */
    const ORCA_SWIM = Object.freeze({
      up: "M22.403 0.567C22.145 0.477 22.068 0.718 21.939 0.85C21.895 0.893 21.86 0.947 21.824 0.997C21.515 1.421 21.13 1.721 20.591 1.77C19.829 1.867 19.221 2.244 18.712 2.958C18.535 2.227 18.116 1.839 17.516 1.626C17.203 1.506 16.887 1.379 16.663 1.064C16.508 0.839 16.462 0.581 16.383 0.329C16.332 0.176 16.283 0.02 16.121 -0.002C15.944 -0.029 15.875 0.133 15.805 0.269C15.52 0.822 15.408 1.43 15.42 2.046C15.449 3.432 16.031 4.532 17.202 5.274C17.337 5.356 17.374 5.445 17.335 5.582C17.261 5.862 17.169 6.134 17.086 6.413C17.032 6.59 16.952 6.63 16.764 6.558C16.118 6.301 15.562 5.909 15.074 5.433C14.248 4.633 13.5 3.751 12.568 3.06C12.349 2.898 12.13 2.748 11.903 2.605C10.952 1.682 12.028 0.923 12.277 0.833C12.537 0.739 12.367 0.416 11.526 0.42C10.684 0.424 9.914 0.706 8.933 1.081C8.789 1.138 8.638 1.179 8.484 1.213C7.593 1.044 6.668 1.006 5.702 1.115C3.883 1.318 2.43 2.178 1.362 3.646C0.079 5.41 -0.223 7.415 0.147 9.506C0.535 11.71 1.66 13.535 3.389 14.962C5.181 16.441 7.246 17.166 9.601 17.027C11.032 16.944 12.624 16.753 14.421 15.232C14.874 15.458 15.35 15.548 16.138 15.615C16.746 15.672 17.331 15.585 17.784 15.491C18.493 15.341 18.444 14.684 18.188 14.564C16.108 13.595 16.565 13.989 16.15 13.67C17.206 12.42 18.82 10.198 19.363 7.086C19.421 6.709 19.484 6.171 19.469 5.866C19.458 5.681 19.493 5.604 19.681 5.556C20.199 5.412 20.691 5.172 21.125 4.806C22.366 3.824 22.758 2.554 22.708 1.1C22.7 0.878 22.649 0.654 22.403 0.567ZM11.175 14.451C9.159 12.726 8.182 12.088 7.778 12.067C7.401 12.047 7.469 12.505 7.552 12.807C7.639 13.103 7.752 13.313 7.91 13.581C8.02 13.758 8.095 14.01 7.801 14.16C7.152 14.487 6.023 13.806 5.97 13.772C4.657 12.85 3.559 11.766 2.785 10.369C2.037 9.025 1.603 7.583 1.532 6.044C1.513 5.672 1.622 5.541 1.992 5.473C2.479 5.383 2.981 5.364 3.468 5.436C5.525 5.736 7.276 6.675 8.744 8.323C9.582 9.299 10.216 10.425 10.869 11.496C11.563 12.592 12.31 13.603 13.262 14.414C13.598 14.696 13.866 14.91 14.123 15.068C13.349 15.154 12.058 15.167 11.175 14.452L11.175 14.451ZM12.141 8.26C12.141 8.095 12.273 7.963 12.439 7.963C12.476 7.963 12.511 7.971 12.541 7.982C12.582 7.997 12.62 8.019 12.65 8.053C12.704 8.106 12.733 8.181 12.733 8.26C12.733 8.425 12.601 8.556 12.435 8.556C12.27 8.556 12.141 8.425 12.141 8.26ZM15.142 9.799C14.949 9.878 14.757 9.945 14.572 9.953C14.284 9.968 13.972 9.851 13.802 9.709C13.537 9.487 13.348 9.363 13.27 8.977C13.236 8.812 13.255 8.556 13.284 8.41C13.352 8.094 13.277 7.892 13.055 7.708C12.873 7.558 12.643 7.516 12.39 7.516C12.296 7.516 12.209 7.475 12.145 7.441C12.039 7.389 11.952 7.257 12.035 7.096C12.062 7.043 12.19 6.916 12.22 6.893C12.563 6.698 12.96 6.762 13.326 6.908C13.665 7.047 13.922 7.302 14.292 7.663C14.669 8.098 14.738 8.218 14.953 8.545C15.123 8.801 15.277 9.063 15.383 9.364C15.447 9.551 15.364 9.705 15.142 9.799Z",
      down: "M23.271 2.216C23.039 2.071 22.91 2.287 22.755 2.388C22.703 2.42 22.656 2.464 22.61 2.505C22.214 2.848 21.771 3.054 21.225 2.956C20.412 2.784 19.68 2.919 19.005 3.435C18.92 2.663 18.493 2.157 17.808 1.798C17.446 1.621 17.08 1.449 16.83 1.111C16.656 0.872 16.611 0.612 16.524 0.354C16.469 0.198 16.414 0.039 16.223 0.009C16.017 -0.024 15.936 0.137 15.856 0.271C15.539 0.822 15.418 1.43 15.429 2.046C15.454 3.432 16.041 4.538 17.196 5.36C17.325 5.456 17.356 5.547 17.312 5.674C17.229 5.936 17.134 6.191 17.051 6.454C16.999 6.623 16.921 6.659 16.738 6.58C16.107 6.306 15.56 5.909 15.074 5.433C14.248 4.633 13.5 3.751 12.568 3.06C12.349 2.898 12.13 2.748 11.903 2.605C10.952 1.682 12.028 0.923 12.277 0.833C12.537 0.739 12.367 0.416 11.526 0.42C10.684 0.424 9.914 0.706 8.933 1.081C8.789 1.138 8.638 1.179 8.484 1.213C7.593 1.044 6.668 1.006 5.702 1.115C3.883 1.318 2.43 2.178 1.362 3.646C0.079 5.41 -0.223 7.415 0.147 9.506C0.535 11.71 1.66 13.535 3.389 14.962C5.181 16.441 7.246 17.166 9.601 17.027C11.032 16.944 12.624 16.753 14.421 15.232C14.874 15.458 15.35 15.548 16.138 15.615C16.746 15.672 17.331 15.585 17.784 15.491C18.493 15.341 18.444 14.684 18.188 14.564C16.108 13.595 16.565 13.989 16.15 13.67C17.206 12.42 18.82 10.198 19.278 7.246C19.318 6.948 19.375 6.534 19.371 6.293C19.371 6.145 19.411 6.092 19.597 6.098C20.113 6.109 20.619 6.051 21.096 5.891C22.503 5.375 23.169 4.232 23.448 2.804C23.49 2.586 23.491 2.356 23.271 2.216ZM11.175 14.49C9.159 13.005 8.182 12.567 7.778 12.621C7.401 12.673 7.469 13.087 7.552 13.354C7.639 13.619 7.752 13.797 7.91 14.024C8.02 14.175 8.095 14.406 7.801 14.609C7.152 15.063 6.023 14.63 5.97 14.609C4.657 13.941 3.559 12.965 2.785 11.569C2.037 10.225 1.603 8.783 1.532 7.244C1.513 6.872 1.622 6.741 1.992 6.673C2.479 6.583 2.981 6.564 3.468 6.636C5.525 6.936 7.276 7.843 8.744 9.163C9.582 9.888 10.216 10.783 10.869 11.679C11.563 12.659 12.31 13.617 13.262 14.415C13.598 14.696 13.866 14.91 14.123 15.068C13.349 15.155 12.058 15.177 11.175 14.491L11.175 14.49ZM12.141 8.26C12.141 8.095 12.273 7.963 12.439 7.963C12.476 7.963 12.511 7.971 12.541 7.982C12.582 7.997 12.62 8.019 12.65 8.053C12.704 8.106 12.733 8.181 12.733 8.26C12.733 8.425 12.601 8.556 12.435 8.556C12.27 8.556 12.141 8.425 12.141 8.26ZM15.142 9.799C14.949 9.878 14.757 9.945 14.572 9.953C14.284 9.968 13.972 9.851 13.802 9.709C13.537 9.487 13.348 9.363 13.27 8.977C13.236 8.812 13.255 8.556 13.284 8.41C13.352 8.094 13.277 7.892 13.055 7.708C12.873 7.558 12.643 7.516 12.39 7.516C12.296 7.516 12.209 7.475 12.145 7.441C12.039 7.389 11.952 7.257 12.035 7.096C12.062 7.043 12.19 6.916 12.22 6.893C12.563 6.698 12.96 6.762 13.326 6.908C13.665 7.047 13.922 7.302 14.292 7.663C14.669 8.098 14.738 8.218 14.953 8.545C15.123 8.801 15.277 9.063 15.383 9.364C15.447 9.551 15.364 9.705 15.142 9.799Z",
      seconds: 1.6,
      /** Rest, up, rest, down, rest: the keyTimes of one swim, as fractions of the swim. */
      keyTimes: Object.freeze([0, 0.35, 0.55, 0.75, 1]),
      spline: '0.45 0 0.55 1',
      hold: '0 0 1 1',
      origin: '50% 60%',
      /** Sway keyframes of one swim: [percent of the swim, transform]. */
      sway: Object.freeze([[0, 'none'], [35, 'rotate(-4deg) translate(-.4px,-.9px)'], [70, 'rotate(1.6deg) translate(.3px,.2px)'], [100, 'none']]),
    })
    /** The share of an unread cycle the swim takes; the rest of the cycle the orca is still. */
    const SWIM_SHARE = ORCA_SWIM.seconds / UNREAD_BADGE.cycleSeconds
    /** Only animate for people who have not asked for less motion (DSH's hero checks the same query). */
    const MOTION_QUERY = '(prefers-reduced-motion: no-preference)'
    const STYLE_ID = 'fishball-style'
    const CLS = Object.freeze({ cardHead: 'fb-card-head', title: 'fb-title', pre: 'fb-pre', askRow: 'fb-ask-row', field: 'fb-field', note: 'fb-note', section: 'fb-section', row: 'fb-row', code: 'fb-code',  mark: 'fb-mark', markBox: 'fb-mark-box', swim: 'fb-swim', badge: 'fb-badge', wag: 'fb-wag', muted: 'fb-muted', recordBody: 'fb-record-body', managedRow: 'fb-managed-row', managedRowDot: 'fb-managed-row-dot', flip: 'fb-flip', embed: 'fb-embed', embedBar: 'fb-embed-bar', embedName: 'fb-embed-name', embedState: 'fb-embed-state', embedActions: 'fb-embed-actions', embedFrame: 'fb-embed-frame', embedError: 'fb-embed-error', embedGlyph: 'fb-embed-glyph' })

    const en = {
      ...PROPOSED_WORDING.en,
      unreadMany: '{max}+',
      limits: 'Safety limits',
      viewTitle: 'Fishball', embedTitle: 'Fishball chat', embedRefresh: 'Refresh',
      embedUnavailable: '{name} is not running.', embedRetry: 'Retry',
      embedState: 'State', embedCode: 'Code',
      // The connector's frame (design §0.5 "The frame", D27). `ready` reads "running"; `attached`
      // (no status from the instance) and `unattached` (no instance) are the connector's own states.
      'frameState.loading': 'checking', 'frameState.unattached': 'unattached', 'frameState.attached': 'attached',
      'frameState.disabled': 'disabled', 'frameState.waiting': 'waiting', 'frameState.starting': 'starting', 'frameState.ready': 'running',
      'frameState.stopping': 'stopping', 'frameState.stopped': 'stopped', 'frameState.failed': 'failed',
      'frameState.connection-interrupted': 'connection interrupted', frameInterrupted: 'The connection to {name} was interrupted.',
      frameUnread: '{count} unread', frameConnectorSettings: 'Connector settings',
      frameNoInstance: 'No Fishball instance is attached', frameOpenPlugins: 'Open Plugins',
      frameNoChat: '{name} is attached and has no chat page',
      frameRetrying: 'Retrying…', frameRetryFailed: 'Retry did not work.',
      instanceTitle: 'Fishball instance', instanceHint: '{name} is attached. Its own settings page opens in the Fishball view.',
      instanceOpenSettings: 'Open instance settings',
      handOver: 'Hand over to Fishball',
      handOverTitle: 'Hand over "{title}" to Fishball',
      handOverNoteLabel: 'Note for Fishball (optional)',
      handOverNotePlaceholder: 'For example: watch it and tell me when it is done, or approve builds and tests.',
      handOverHint: 'Fishball reads this session\'s last answer and your note. Handing over makes Fishball look after this session.',
      handOverConfirm: 'Hand over',
      cancel: 'Cancel',
      close: 'Close',
      handingOver: 'Handing over…',
      'handOverError.queue-full': 'Fishball\'s queue is full. Try again later.',
      'handOverError.too-large': 'The note is too long.',
      'handOverError.from-fishball': 'This is Fishball\'s own session.',
      'handOverError.unknown-session': 'This session could not be read.',
      'handOverError.unavailable': 'Fishball is not running.',
      handOverFailed: 'That did not work.',
      takeBack: 'Take back from Fishball',
      manageTitle: 'Managed by Fishball',
      // The banner's words. Same text as manageTitle (the refusal dialog's title) today, but a separate meaning.
      managedBanner: 'Managed by Fishball',
      managedRowUnread: 'Managed by Fishball, unread input from this session',
      managedRowNeedsYou: 'Managed by Fishball, needs your action',
      managedRowRunning: 'Managed by Fishball, working',
      manageFailed: 'That did not work.',
      'field.maxQueuedInputs': 'Queued inputs not yet read',
      'field.maxActiveWatches': 'Active "tell me when finished" watches',
      'field.maxPendingApprovals': 'Permission requests open at once (waiting for Fishball or in your pile)',
      'field.argumentExcerptBytes': 'Bytes of a request\'s command Fishball sees',
      'field.maxMessageBytes': 'Bytes in one message',
      'field.auditEntriesKept': 'Entries kept in each audit list',
      'field.requestUserMessageBytes': 'Bytes of your latest message a permission request shows Fishball',
      'field.rationaleChars': 'Characters of Fishball\'s reason kept in the approval audit',
      'field.watchesShown': 'Watches kept in the state snapshot and by list_watches',
      'field.readSessionMessages': 'Messages read_session returns',
      'field.readSessionBytes': 'Bytes read_session returns',
      'field.forwardExcerptBytes': 'Bytes of a session\'s last answer in a forward or watch notice',
      'field.userMessagesListed': 'Your messages list_user_messages shows a managed session',
      'field.userMessageExcerptChars': 'Characters of each message list_user_messages shows',
      cardReason: 'Reason',
      cardFishballNote: 'Fishball',
      askRowTitle: 'Ask Fishball',
      askRowReply: 'Reply to Fishball',
      askRowWaitingFishball: 'Waiting for Fishball',
      askRowWaitingYou: 'Waiting for you',
      'askResult.allowed': 'Allowed once',
      'askResult.rejected': 'Rejected',
      'askResult.question': 'Fishball asks a question',
      'askResult.unavailable': 'Fishball cannot answer now',
      'askResult.over-capacity': 'Too many requests waiting',
      'askResult.no-longer-managed': 'No longer managed by Fishball',
      'askResult.not-user-message': 'Not a message you typed',
      'askResult.too-large': 'Too large to send',
      'askResult.expired': 'Request not open',
      'askResult.invalid-request': 'Invalid request',
      'askResult.empty': 'Empty reply',
      'askResult.cancelled': 'Cancelled',
      reset: 'Reset to default',
      overridden: 'Custom',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The values were not accepted. Use whole numbers: at least 1, at least 0 for the hourly caps, and at least 2 for the reply cap share.',
      invalid: 'Enter a whole number.',
      unavailable: 'Fishball is not loaded, so its limits cannot be changed right now.',
      readOnly: 'This deployment stores settings read-only.',
      // The rebuilt settings page (§9): the isolated child's status, model, plugins and settings.
      'record.question': 'Question', 'record.plan-review': 'Plan review', 'record.permission': 'Permission request',
      'record.by.user': 'You', 'record.by.fishball': 'Fishball', 'record.place.pile': 'on the card', 'record.place.session': 'in the session',
      'record.outcome.allowed': 'Allowed once', 'record.outcome.granted': 'Allowed and granted', 'record.outcome.rejected': 'Rejected',
      'record.outcome.answered': 'Answered', 'record.outcome.skipped': 'Skipped', 'record.outcome.closed': 'Closed',
      'record.from': 'From', 'record.answer': 'Answer', 'record.tool': 'Tool', 'record.arguments': 'Arguments', 'record.reason': 'Reason', 'record.note': 'Note', 'record.closed': 'Why it closed', 'record.own': 'Fishball asked you',
    }
    const zh = {
      ...PROPOSED_WORDING.zh,
      unreadMany: '{max}+',
      limits: '安全限制',
      viewTitle: 'Fishball', embedTitle: 'Fishball 聊天', embedRefresh: '刷新',
      embedUnavailable: '{name} 未在运行。', embedRetry: '重试',
      embedState: '状态', embedCode: '代码',
      'frameState.loading': '检查中', 'frameState.unattached': '未连接', 'frameState.attached': '已连接',
      'frameState.disabled': '已禁用', 'frameState.waiting': '等待中', 'frameState.starting': '启动中', 'frameState.ready': '运行中',
      'frameState.stopping': '停止中', 'frameState.stopped': '已停止', 'frameState.failed': '失败',
      'frameState.connection-interrupted': '连接中断', frameInterrupted: '与 {name} 的连接中断。',
      frameUnread: '{count} 条未读', frameConnectorSettings: 'Connector 设置',
      frameNoInstance: '没有已连接的 Fishball 实例', frameOpenPlugins: '打开插件',
      frameNoChat: '{name} 已连接，但没有聊天页面',
      frameRetrying: '正在重试…', frameRetryFailed: '重试未成功。',
      instanceTitle: 'Fishball 实例', instanceHint: '{name} 已连接。它自己的设置页面会在 Fishball 视图中打开。',
      instanceOpenSettings: '打开 Fishball 实例设置',
      handOver: '交给 Fishball 管理',
      handOverTitle: '把“{title}”交给 Fishball 管理',
      handOverNoteLabel: '给 Fishball 的备注（可选）',
      handOverNotePlaceholder: '例如：盯着它，完成时告诉我；或者批准构建和测试。',
      handOverHint: 'Fishball 会读取此会话的最后一条回复和你的备注。交接后由 Fishball 照看此会话。',
      handOverConfirm: '交给 Fishball',
      cancel: '取消',
      close: '关闭',
      handingOver: '交接中…',
      'handOverError.queue-full': 'Fishball 的队列已满，请稍后再试。',
      'handOverError.too-large': '备注太长。',
      'handOverError.from-fishball': '这是 Fishball 自己的会话。',
      'handOverError.unknown-session': '无法读取此会话。',
      'handOverError.unavailable': 'Fishball 未在运行。',
      handOverFailed: '操作未成功。',
      takeBack: '从 Fishball 收回',
      manageTitle: '由 Fishball 管理',
      managedBanner: '由 Fishball 管理',
      managedRowUnread: '由 Fishball 管理，此会话有未读输入',
      managedRowNeedsYou: '由 Fishball 管理，需要你处理',
      managedRowRunning: '由 Fishball 管理，正在工作',
      manageFailed: '操作未成功。',
      'field.maxQueuedInputs': '尚未读取的排队输入',
      'field.maxActiveWatches': '进行中的“完成时通知我”',
      'field.maxPendingApprovals': '同时打开的权限请求（等待 Fishball 或在你的待处理区）',
      'field.argumentExcerptBytes': 'Fishball 可见的请求命令字节数',
      'field.maxMessageBytes': '单条消息字节数',
      'field.auditEntriesKept': '每个审计列表保留的条目',
      'field.requestUserMessageBytes': '权限请求向 Fishball 显示的你最近消息字节数',
      'field.rationaleChars': '审批记录中保留的 Fishball 理由字符数',
      'field.watchesShown': '状态快照与 list_watches 中保留的关注数',
      'field.readSessionMessages': 'read_session 返回的消息数',
      'field.readSessionBytes': 'read_session 返回的字节数',
      'field.forwardExcerptBytes': '转发或关注通知中会话最后回答的字节数',
      'field.userMessagesListed': 'list_user_messages 向受管会话列出的你的消息条数',
      'field.userMessageExcerptChars': 'list_user_messages 每条消息摘录的字符数',
      cardReason: '理由',
      cardFishballNote: 'Fishball',
      askRowTitle: '询问 Fishball',
      askRowReply: '回复 Fishball',
      askRowWaitingFishball: '等待 Fishball',
      askRowWaitingYou: '等你处理',
      'askResult.allowed': '已允许一次',
      'askResult.rejected': '已拒绝',
      'askResult.question': 'Fishball 提了一个问题',
      'askResult.unavailable': 'Fishball 暂时无法回答',
      'askResult.over-capacity': '等待中的请求太多',
      'askResult.no-longer-managed': '已不再由 Fishball 管理',
      'askResult.not-user-message': '不是你输入的消息',
      'askResult.too-large': '太大，无法发送',
      'askResult.expired': '请求未打开',
      'askResult.invalid-request': '请求无效',
      'askResult.empty': '回复为空',
      'askResult.cancelled': '已取消',
      reset: '恢复默认',
      overridden: '已自定义',
      save: '保存',
      saving: '保存中…',
      saveFailed: '这些值未被接受。请使用整数：至少为 1，每小时上限至少为 0，回复上限比例至少为 2。',
      invalid: '请输入整数。',
      unavailable: 'Fishball 当前未加载，暂时无法修改限制。',
      readOnly: '本部署的设置为只读。',
      'record.question': '问题', 'record.plan-review': '计划审阅', 'record.permission': '权限请求',
      'record.by.user': '你', 'record.by.fishball': 'Fishball', 'record.place.pile': '在卡片上', 'record.place.session': '在会话中',
      'record.outcome.allowed': '已允许一次', 'record.outcome.granted': '已允许并授权', 'record.outcome.rejected': '已拒绝',
      'record.outcome.answered': '已回答', 'record.outcome.skipped': '已跳过', 'record.outcome.closed': '已关闭',
      'record.from': '来自', 'record.answer': '回答', 'record.tool': '工具', 'record.arguments': '参数', 'record.reason': '理由', 'record.note': '备注', 'record.closed': '关闭原因', 'record.own': 'Fishball 问你',
    }

    const css = [
      `.${CLS.section}{display:flex;flex-direction:column;gap:12px;margin:0 0 24px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13)}`,
      `.${CLS.mark}{color:var(--dsw-alias-label-primary)}`,
      `.${CLS.markBox}{position:relative;display:inline-flex}`,
      `.${CLS.badge}{position:absolute;top:${UNREAD_BADGE.top};right:${UNREAD_BADGE.right};box-sizing:border-box;min-width:${UNREAD_BADGE.minWidth};height:${UNREAD_BADGE.height};padding:0 ${UNREAD_BADGE.paddingX};border-radius:${UNREAD_BADGE.radius};background:${UNREAD_BADGE.fill};color:${UNREAD_BADGE.textColor};box-shadow:${UNREAD_BADGE.ring};font:${UNREAD_BADGE.fontWeight} ${UNREAD_BADGE.fontSize}/${UNREAD_BADGE.height} ${UNREAD_BADGE.fontFamily};text-align:center;white-space:nowrap;pointer-events:none;animation:${UNREAD_BADGE.popAnimation} ${UNREAD_BADGE.cycleSeconds}s ease-in-out infinite}`,
      `.${CLS.wag}{transform-origin:${UNREAD_BADGE.wagOrigin};animation:${UNREAD_BADGE.wagAnimation} ${UNREAD_BADGE.cycleSeconds}s ease-in-out infinite}`,
      `@keyframes ${UNREAD_BADGE.wagAnimation}{${UNREAD_BADGE.wag.map(([at, degrees]) => `${at}%{transform:rotate(${degrees}deg)}`).join('')}}`,
      `@keyframes ${UNREAD_BADGE.popAnimation}{${UNREAD_BADGE.pop.map(([at, scale]) => `${at}%{transform:scale(${scale})}`).join('')}}`,
      `.${CLS.swim}{transform-origin:${ORCA_SWIM.origin};overflow:visible;animation:fb-swim ${UNREAD_BADGE.cycleSeconds}s ease-in-out infinite}`,
      `@keyframes fb-swim{${[...ORCA_SWIM.sway.map(([at, transform]) => [at * SWIM_SHARE, transform]), [100, 'none']].map(([at, transform]) => `${at}%{transform:${transform}}`).join('')}}`,
      // The running fish's flip (design ⑥): a half-turn to the mirror, a short hold, then back.
      `.${CLS.flip}{transform-origin:${ROW_MARK.flipOrigin};animation:${ROW_MARK.flipAnimation} ${ROW_MARK.flipSeconds}s ease-in-out infinite}`,
      `@keyframes ${ROW_MARK.flipAnimation}{${ROW_MARK.flip.map(([at, degrees]) => `${at}%{transform:rotateY(${degrees}deg)}`).join('')}}`,
      // Motion is the only thing that stops: the pill, its count and the dots stay.
      `@media (prefers-reduced-motion:reduce){.${CLS.badge},.${CLS.wag},.${CLS.swim},.${CLS.flip}{animation:none}}`,
      `.${CLS.row}{display:flex;gap:12px;align-items:baseline}`,
      `.${CLS.code}{font-family:var(--ds-font-family-code);overflow-wrap:anywhere}`,
      `.${CLS.muted}{color:var(--dsw-alias-label-tertiary)}`,
      // The Fishball view (§7) fills DSH's main area as a session does: DSH's conversation root,
      // its header (border, padding, the leading clearance a hidden macOS sidebar leaves) and its
      // name style; the frame takes the rest.
      `.${CLS.embed}{display:flex;flex-direction:column;flex:1;width:100%;height:100%;min-width:0;min-height:0;background:var(--dsw-alias-bg-base)}`,
      `.${CLS.embedBar}{box-sizing:border-box;flex:none;display:flex;align-items:center;gap:${DSH_SESSION_HEADER.gap};min-height:${DSH_SESSION_HEADER.minHeight};padding:${DSH_SESSION_HEADER.padding};padding-inline-start:max(${DSH_SESSION_HEADER.startPadding}, var(--dsh-frame-leading-clearance,0px));border-bottom:.5px solid var(--dsw-alias-border-l3)}`,
      `.${CLS.embedName}{color:var(--dsw-alias-label-primary);font-size:${DSH_SESSION_HEADER.nameFont};line-height:${DSH_SESSION_HEADER.nameLine};font-weight:500;white-space:nowrap}`,
      // The state tag and its safe code sit together, as one item of the header line.
      `.${CLS.embedState}{display:inline-flex;align-items:center;gap:${DSH_SESSION_HEADER.gap}}`,
      // The header is a window-drag area on macOS Desktop, as DSH's own; its buttons are not.
      `.${CLS.embedActions}{display:flex;align-items:center;gap:${DSH_SESSION_HEADER.gap};margin-inline-start:auto;-webkit-app-region:no-drag}`,
      `.${CLS.embedFrame}{display:block;flex:1;width:100%;min-height:0;border:0;background:var(--dsw-alias-bg-base)}`,
      // Not ready, failed or still checking: DSH's empty/error state (dsh-client-ui-schedule .empty), centred in the view.
      `.${CLS.embedError}{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${DSH_EMPTY_STATE.gap};padding:${DSH_EMPTY_STATE.padding};text-align:center;color:var(--dsw-alias-label-tertiary);font-size:${DSH_EMPTY_STATE.font};line-height:1.6}`,
      `.${CLS.embedError} p{margin:0}`,
      `.${CLS.embedGlyph}{color:var(--dsw-alias-label-caption)}`,
      `.${CLS.embedError} .${ACCENT_BUTTON.className}{margin-top:${DSH_EMPTY_STATE.actionGap}}`,
      `.${CLS.field}{display:flex;flex-direction:column;gap:6px;margin-top:8px}`,
      // DSH's input colours (dsh-client-ui-primitives SettingsValueField): --dsw-alias-border-primary is not defined in dialogs.
      `.${CLS.note}{width:100%;box-sizing:border-box;padding:8px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;resize:vertical}`,
      `.${CLS.cardHead}{display:flex;flex-wrap:wrap;align-items:center;gap:8px}`,
      `.${CLS.title}{color:var(--dsw-alias-label-primary);font-weight:500;overflow-wrap:anywhere}`,
      `.${CLS.pre}{margin:0;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);font-family:var(--ds-font-family-code);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${CLS.askRow}{display:flex;flex-direction:column;gap:6px;padding:6px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}`,
      `.${CLS.managedRow}{position:relative;display:inline-flex;align-items:center;justify-content:center;width:${ROW_MARK.cellPx}px;height:${ROW_MARK.cellPx}px;color:var(--dsw-alias-label-primary)}`,
      // The dots' two meanings get DSH's own state tokens; yellow is checked first in the component.
      `.${CLS.managedRowDot}{position:absolute;top:${ROW_MARK.dot.topPx}px;right:${ROW_MARK.dot.rightPx}px;box-sizing:border-box;width:${ROW_MARK.dot.sizePx}px;height:${ROW_MARK.dot.sizePx}px;border-radius:50%;background:var(--dsw-alias-state-success-primary);pointer-events:none}`,
      `.${CLS.managedRowDot}[data-fishball-dot="${ROW_MARK.dot.action}"]{background:var(--dsw-alias-state-warn-primary)}`,
      // The one accent token and the one ring (§8.5). The ring mixes the accent with whatever
      // surface is under it, so it reads on light and dark; DSH's own variant supplies hover,
      // active and focus-visible.
      `:root{--fb-accent:${FISHBALL_ACCENT}}`,
      `.${ACCENT_BUTTON.className}{box-shadow:0 0 0 1px color-mix(in srgb, var(--fb-accent) 55%, transparent)}`,
    ].join('')

    const apiUrl = (path) => new URL(path, document.baseURI).toString()

    /** One shared EventSource for all components; reconnects by itself. */
    const stateSource = (() => {
      let snapshot = { status: STATUS.starting, sessionId: null, error: null, limits: {} }
      const listeners = new Set()
      const publish = (next) => {
        snapshot = next
        for (const listener of listeners) listener()
      }
      let source
      const open = () => {
        if (source) return
        source = new EventSource(apiUrl(API.events))
        source.onmessage = (event) => {
          let next
          try { next = JSON.parse(event.data) } catch { return }
          publish(next)
        }
      }
      return {
        subscribe(listener) {
          listeners.add(listener)
          open()
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0 && source) { source.close(); source = undefined }
          }
        },
        get: () => snapshot,
        publish,
      }
    })()
    const useFishball = () => React.useSyncExternalStore(stateSource.subscribe, stateSource.get)

    /** POST one command to the Host. @returns { ok, code, path, answer } (the Host's refusal code, an invalid setting's path, and the whole answer). */
    async function send(path, body) {
      try {
        const response = await fetch(apiUrl(path), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
        if (response.ok) return { ok: true, code: null, answer: await response.json().catch(() => ({})) }
        const answer = await response.json().catch(() => ({}))
        return { ok: false, code: typeof answer.code === 'string' ? answer.code : null, path: Array.isArray(answer.path) ? answer.path : null, answer }
      } catch {
        return { ok: false, code: null, path: null, answer: null }
      }
    }

    /** One Fishball-accent button (§8.5): DSH's Button with the shared magenta ring. */
    const accentButton = (props, ...children) => h(Button, {
      type: 'button', ...props, variant: ACCENT_BUTTON.variant,
      className: [ACCENT_BUTTON.className, props.className].filter(Boolean).join(' '),
    }, ...children)

    /** Which brand icon you chose; Fishball's own until the Host says otherwise. */
    const brandStyleOf = (state) => state.preferences?.brandStyle ?? BRAND_STYLE.fishball

    /** The wrench badge's two strokes (WRENCH_BADGE). */
    const wrenchBadge = () => h('g', { fill: 'none', stroke: WRENCH_BADGE.color, strokeWidth: WRENCH_BADGE.strokeWidth, strokeLinecap: WRENCH_BADGE.lineCap, 'data-fishball-wrench': true },
      h('path', { d: WRENCH_BADGE.head }),
      h('path', { d: WRENCH_BADGE.handle }))

    /**
     * Fishball's fish: wags while anything is unread; flips while a row runs (the managed mark's
     * running variant). A moving mark never wags, so the running state has one animation.
     * `badge` adds the wrench: the connector's one icon (D22), on the brand, its sidebar row and
     * managed session rows, where it keeps the unread pill and the green and yellow dots (the
     * user's answer to D0: the icon keeps both). The package icon on the Plugins card is the same
     * drawing (assets/connector-icon.svg).
     */
    function FishballIcon({ size, unread, moving, badge }) {
      const animation = moving ? CLS.flip : unread ? CLS.wag : null
      return h('svg', { width: size, height: size, viewBox: FISH_MARK.viewBox, className: [CLS.mark, animation].filter(Boolean).join(' '), 'aria-hidden': true, 'data-fishball-mark': true },
        h('path', { d: FISH_MARK.body, fill: FISH_MARK.bodyColor }),
        h('path', { d: FISH_MARK.eye, fill: FISH_MARK.eyeColor }),
        badge ? wrenchBadge() : null)
    }

    /**
     * The swim as SMIL: DSH's morph through the tail-up and tail-down shapes, squeezed into the
     * first part of the unread cycle with the orca still for the rest (a final rest-to-rest
     * stretch), so it repeats at the pace of the fish's wag. Not drawn for reduced motion.
     */
    const swimAnimation = () => h('animate', {
      attributeName: 'd',
      values: [FISH_LOGO_PATH, ORCA_SWIM.up, FISH_LOGO_PATH, ORCA_SWIM.down, FISH_LOGO_PATH, FISH_LOGO_PATH].join(';'),
      keyTimes: [...ORCA_SWIM.keyTimes.map((at) => at * SWIM_SHARE), 1].join(';'),
      calcMode: 'spline',
      // One spline per stretch between values: the swim's four, then a hold for the still part.
      keySplines: [...ORCA_SWIM.keyTimes.slice(1).map(() => ORCA_SWIM.spline), ORCA_SWIM.hold].join(';'),
      dur: `${UNREAD_BADGE.cycleSeconds}s`,
      repeatCount: 'indefinite',
    })

    /**
     * DSH's orca: the stock mark, swimming while anything is unread or a managed row runs. The
     * running variant reuses the same 0.2.2 swim; reduced motion leaves the mark still.
     */
    function OrcaIcon({ size, unread, moving }) {
      const animates = unread || moving
      const swims = animates && window.matchMedia(MOTION_QUERY).matches
      return h('svg', {
        width: size, height: size * FISH_LOGO_VIEWBOX.height / FISH_LOGO_VIEWBOX.width, viewBox: `0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`,
        fill: 'none', className: animates ? CLS.swim : undefined, 'aria-hidden': true, 'data-fishball-orca': true,
      }, h('path', { d: FISH_LOGO_PATH, fill: 'currentColor' }, swims ? swimAnimation() : null))
    }

    const BRAND_ICON = Object.freeze({ [BRAND_STYLE.fishball]: FishballIcon, [BRAND_STYLE.deepseek]: OrcaIcon })
    /** The icon the Sidebar icon setting chose: the brand mark and the managed-session marks share it. */
    const brandIconOf = (state) => BRAND_ICON[brandStyleOf(state)] ?? FishballIcon

    /** Connector-owned attention latch: count is 0 or 1; no producer unread state. */
    const unreadCount = (state) => state.unread?.count ?? 0
    /** Reuse the existing row dot; attention adds no timer or separate animation. */
    const attentionDot = (dot) => h('span', { className: CLS.managedRowDot, 'data-fishball-dot': dot, 'aria-hidden': true })

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
        get: (seat) => stores.get(seat).get(),
        use: (seat) => { const store = stores.get(seat); return React.useSyncExternalStore(store.subscribe, store.get) },
      })
    })()

    /** The sidebar mark before (or without) the attention part: the chosen icon alone, with no latch. */
    function PlainMark({ size }) {
      const Icon = brandIconOf(useFishball())
      return h(Icon, { size, unread: false, badge: true })
    }
    /** The sidebar row's mark: the attention part's seat, else the plain one. */
    function Mark(props) {
      return h(seats.use(SEAT.mark) ?? PlainMark, props)
    }
    /** The frame header's badge seat (the attention part's unread count); nothing while empty. */
    function FrameBadge(props) {
      const Badge = seats.use(SEAT.frameBadge)
      return Badge === undefined ? null : h(Badge, props)
    }

    /**
     * Which of the attached instance's pages the view frames. The Plugins card's "Open instance
     * settings" asks for `settings` (conn-OQ-24); the view puts it back to `chat` when it unmounts,
     * so the next visit from the row frames the chat again. An instance whose
     * `ui.settings` went away meanwhile shows its chat, the view's default.
     */
    const framedPage = valueStore(FRAME_UI.page.chat)

    /** One read of the connector's own instance route; a failed read keeps what the view showed. */
    async function readInstance(signal) {
      try {
        const response = await fetch(apiUrl(FRAME_UI.instancePath), { ...FRAME_UI.read, signal })
        if (!response.ok) return undefined
        const value = await response.json()
        return value !== null && typeof value === 'object' && typeof value.attached === 'boolean' ? value : undefined
      } catch { return undefined }
    }

    /** Whether two instance views show the same thing, so a steady poll re-renders nothing. */
    const sameInstance = (a, b) => JSON.stringify(a) === JSON.stringify(b)

    /**
     * The instance the frame shows: the state stream's `instance` (an attach or a detach shows at
     * once, conn-OQ-26) and the once-a-second read of its route (status() has no event, conn-OQ-25),
     * whichever arrived last.
     */
    function useFrameInstance() {
      const streamed = useFishball().instance
      const [latest, setLatest] = React.useState(streamed)
      React.useEffect(() => { if (streamed !== undefined) setLatest((previous) => (sameInstance(previous, streamed) ? previous : streamed)) }, [streamed])
      React.useEffect(() => {
        const abort = new AbortController()
        let polling = false
        const poll = () => {
          if (polling || document.hidden) return
          polling = true
          void readInstance(abort.signal).then((next) => {
            if (next !== undefined && !abort.signal.aborted) setLatest((previous) => (sameInstance(previous, next) ? previous : next))
          }).finally(() => { polling = false })
        }
        poll()
        const timer = setInterval(poll, FRAME_UI.pollMs)
        return () => { clearInterval(timer); abort.abort() }
      }, [])
      return latest
    }

    /** The frame's state tag: the state, and the safe code beside it when there is one. */
    function FrameState({ state, code, t }) {
      return h('span', { className: CLS.embedState, 'data-fishball-embed-state': state, ...(code ? { 'data-fishball-embed-code': code } : {}) },
        // DSH's Tag takes no data attributes, so the hooks sit on this wrapper.
        h(Tag, { tone: EMBED_UI.stateTone[state] ?? EMBED_UI.neutralTone }, t('frameState.' + state)),
        code ? h('code', { className: CLS.code }, code) : null)
    }

    /** Split text at the first mark: what is before it, and what follows it (null without the mark). */
    function splitAt(text, mark) {
      const at = text.indexOf(mark)
      return at === -1 ? { head: text, tail: null } : { head: text.slice(0, at), tail: text.slice(at + mark.length) }
    }

    /**
     * The address the frame loads (contract 1.1, §1.2): the registered path with one `lang`
     * parameter at the end of its query, before its fragment. Every `lang` the path already has is
     * dropped, so the page's "first `lang`" is always this one; a parameter's name is compared
     * after URL decoding, as the page reads it. The rest is cut by string, not rebuilt through
     * URLSearchParams, so the other parameters and the fragment keep their exact spelling.
     */
    function framedUrl(path, lang) {
      const { parameter } = FRAME_UI.lang
      const { fragment, query, separator, assign } = FRAME_UI.url
      const address = splitAt(path, fragment)
      const parts = splitAt(address.head, query)
      const kept = (parts.tail?.split(separator) ?? []).filter((pair) => pair.length > 0 && !new URLSearchParams(pair).has(parameter))
      const hash = address.tail === null ? '' : fragment + address.tail
      return parts.head + query + [...kept, parameter + assign + encodeURIComponent(lang)].join(separator) + hash
    }

    /**
     * The `lang` value for DSH's active language, followed live. resolveText walks the same
     * fallback chain as the connector's own `t` (FRAME_UI.lang). The store's value is the string
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

    /** One GET of the host half's route; undefined for an answer that is not `{ok: true, ...}`. */
    async function readRoute(path, signal) {
      try {
        const response = await fetch(apiUrl(path), { ...FRAME_UI.read, signal })
        const value = await response.json()
        return value?.ok === true ? value : undefined
      } catch { return undefined }
    }

    /**
     * What the host half reports usable (src/host/services.js): read once when the shell starts.
     * The row registers by it (UIM-EP-01); a service that comes or goes later shows after a reload,
     * as V2's instance card did. An unreadable answer is "nothing", so the shell then registers
     * nothing that needs a service.
     */
    const readAvailability = async () => (await readRoute(CHILD_UI.route.services)) ?? CHILD_UI.none

    /**
     * The child's status and target, re-read at the V2 frame's cadence (FRAME_UI.pollMs) while the
     * view is mounted and the tab is visible, one read at a time. undefined until the first answer.
     */
    function useChildStatus() {
      const [status, setStatus] = React.useState(undefined)
      React.useEffect(() => {
        const abort = new AbortController()
        let polling = false
        const poll = () => {
          if (polling || document.hidden) return
          polling = true
          void readRoute(CHILD_UI.route.status, abort.signal).then((next) => {
            if (next !== undefined && !abort.signal.aborted) setStatus((previous) => (sameInstance(previous, next) ? previous : next))
          }).finally(() => { polling = false })
        }
        poll()
        const timer = setInterval(poll, FRAME_UI.pollMs)
        return () => { clearInterval(timer); abort.abort() }
      }, [])
      return [status, setStatus]
    }

    /**
     * The frame's one-time address for `{view, lang}` while the child is ready: asked of the admit
     * route afresh whenever the view, the language, the generation (Refresh) or readiness changes,
     * because a ticket is single-use (UIM-UC-01 A1, A2). The answer is held only in this
     * component's state for that one frame document. `{refused}` carries the route's code.
     */
    function useAdmission(view, lang, ready, generation) {
      const [admission, setAdmission] = React.useState(undefined)
      React.useEffect(() => {
        setAdmission(undefined)
        if (!ready) return undefined
        let live = true
        void send(CHILD_UI.route.admit, { view, lang }).then(({ ok, code, answer }) => {
          if (!live) return
          setAdmission(ok && typeof answer?.url === 'string' ? { url: answer.url } : { refused: code })
        })
        return () => { live = false }
      }, [view, lang, ready, generation])
      return admission
    }

    /**
     * The Fishball view over the instance locator (U-SHELL; design §4.2; R-UI-02, R-UI-03): the
     * same main slot, header and empty states as the V2 view below, with the child's status, its
     * code and Retry outside the frame, and the frame's address from admit only. A page opened
     * under any name but a loopback one gets `hostname-refused` and shows R-UI-02's text instead
     * of a frame. Nothing crosses the iframe (no `message` listener), as in V2.
     */
    function makeChildView(ctx, t) {
      const frameLang = frameLangStore(ctx.locale)
      return function FishballChildView() {
        const [status, setStatus] = useChildStatus()
        const page = React.useSyncExternalStore(framedPage.subscribe, framedPage.get)
        const lang = React.useSyncExternalStore(frameLang.subscribe, frameLang.get)
        const [generation, setGeneration] = React.useState(0)
        const [retrying, setRetrying] = React.useState(false)
        React.useEffect(() => { seats.get(SEAT.pageOpened)?.() }, [])
        React.useEffect(() => () => framedPage.set(FRAME_UI.page.chat), [])
        const state = status?.status?.state ?? FRAME_UI.loading
        const code = status?.status?.code ?? null
        const ready = state === CHILD_UI.readyState
        const admission = useAdmission(page, lang, ready, generation)
        const canRetry = CHILD_UI.retryStates.includes(state) || CHILD_UI.retryCodes.includes(code)
        const retry = async () => {
          setRetrying(true)
          const { ok, answer } = await send(CHILD_UI.route.retry, {})
          setRetrying(false)
          if (ok && answer?.ok === true) setStatus(answer)
        }
        const body = status === undefined
          ? emptyState(h('p', { role: 'status' }, t('frameState.' + FRAME_UI.loading)))
          : !ready
            ? emptyState(
              h(IconWarningOutlineRegular, { size: EMBED_UI.warningIconPx, className: CLS.embedGlyph }),
              h('p', null, t('embedState'), ' ', h('code', { className: CLS.code }, state)),
              code ? h('p', null, t('embedCode'), ' ', h('code', { className: CLS.code }, code)) : null)
            : admission === undefined
              ? emptyState(h('p', { role: 'status' }, t('frameState.' + FRAME_UI.loading)))
              : admission.refused !== undefined
                ? emptyState(
                  h(IconWarningOutlineRegular, { size: EMBED_UI.warningIconPx, className: CLS.embedGlyph }),
                  admission.refused === CHILD_UI.hostnameRefused
                    ? h('p', { role: 'alert', 'data-fishball-hostname-refused': true }, t('hostnameRefused'))
                    : h('p', { role: 'alert', 'data-fishball-admit-refused': admission.refused ?? '' }, t('admitFailed')))
                : h('iframe', { key: `${generation}:${admission.url}`, className: CLS.embedFrame, src: admission.url, title: t('embedTitle'), allow: EMBED_UI.iframeAllow, referrerPolicy: EMBED_UI.iframeReferrerPolicy, 'data-fishball-embed-frame': true })
        return h('section', { className: CLS.embed, 'aria-label': t('viewTitle'), 'data-fishball-embed': true, 'data-fishball-embed-page': page },
          h('header', { className: CLS.embedBar, 'data-window-drag': true },
            h('span', { className: CLS.embedName }, t('viewTitle')),
            h(FrameState, { state, code, t }),
            h(FrameBadge, { t }),
            h('div', { className: CLS.embedActions },
              canRetry ? accentButton({ size: 'sm', disabled: retrying, 'data-fishball-frame-retry': true, onClick: () => void retry() }, retrying ? t('frameRetrying') : t('embedRetry')) : null,
              h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: admission?.url === undefined, onClick: () => setGeneration((value) => value + 1) }, t('embedRefresh')))),
          body)
      }
    }

    /**
     * The Fishball view (§7) inside the connector's frame (design §0.5 "The frame", D27): DSH's
     * main area where a session's conversation shows (the `main` slot, keyed by EMBED_UI.panelId).
     * DSH swaps it out when you open a session and back in when you select Fishball, so it has no
     * Close. The frame is the same around the instance's chat and its settings page: the title,
     * the state tag, the unread count, Connector settings (always, so DSH's form of
     * fishball-connector is reachable in every state), Refresh and Retry (failed and the instance gave
     * retry). There is no "Open in a tab" (the user's decision, 2026-11-07). The content is the
     * instance's own page, framed at its registered path plus `lang` (framedUrl). The iframe's key holds that address, so a language change remounts it: a reload.
     * The key also holds the attachment's `attachCount`: a restarted instance attaches anew, and
     * its page may be a launch that admits the browser to that generation only (PG-ORIGIN), so a
     * new attachment always loads the registered path afresh instead of keeping an old document.
     * The page can end at another origin, so the view never reads the frame's document.
     * Nothing crosses the iframe: the view installs no `message` listener and acts on no
     * postMessage from the page (D27; the contract's former open-settings message is dropped).
     * Everything it shows comes from the connector's own state and routes.
     * W3 fallback (U-SHELL): shown only without a usable `fishballChild` while the V2 connector
     * service is there; it leaves with the V2 path in W4b (C-WIRE).
     */
    function makeFishballView(ctx, t) {
      const frameLang = frameLangStore(ctx.locale)
      return function FishballView() {
        const instance = useFrameInstance()
        const page = React.useSyncExternalStore(framedPage.subscribe, framedPage.get)
        const lang = React.useSyncExternalStore(frameLang.subscribe, frameLang.get)
        const [generation, setGeneration] = React.useState(0)
        const [retrying, setRetrying] = React.useState(false)
        const [retryCode, setRetryCode] = React.useState(null)
        // Once per mount of the view, not on every snapshot or iframe refresh (the attention part's clear).
        React.useEffect(() => { seats.get(SEAT.pageOpened)?.() }, [])
        React.useEffect(() => () => framedPage.set(FRAME_UI.page.chat), [])
        const state = instance?.state ?? FRAME_UI.loading
        const ui = instance?.ui ?? {}
        const path = (page === FRAME_UI.page.settings ? ui.settings : undefined) ?? ui.chat
        const framed = instance?.attached === true && path !== undefined && FRAME_UI.framedStates.includes(state)
        const src = path === undefined ? undefined : framedUrl(path, lang)
        const retry = async () => {
          setRetrying(true)
          setRetryCode(null)
          // The route takes no body; send() is the one POST helper (it reads the refusal's code).
          const { ok, code } = await send(FRAME_UI.retryPath, {})
          setRetrying(false)
          if (!ok) setRetryCode(code ?? FRAME_UI.retryFailed)
        }
        const openConnectorSettings = () => ctx.get(FRAME_UI.navigation)?.openBundle(PACKAGE_NAME)
        const openPlugins = () => {
          const navigation = ctx.get(FRAME_UI.navigation)
          if (navigation) navigation.openList()
          else ctx.get(SERVICE.layout)?.selectPanel(EMBED_UI.pluginsPanelId)
        }
        const body = instance === undefined
          ? emptyState(h('p', { role: 'status' }, t('frameState.' + FRAME_UI.loading)))
          : state === FRAME_UI.unattached
            ? emptyState(
              h(IconWarningOutlineRegular, { size: EMBED_UI.warningIconPx, className: CLS.embedGlyph }),
              h('p', { 'data-fishball-embed-empty': true }, t('frameNoInstance')),
              accentButton({ onClick: openPlugins }, t('frameOpenPlugins')))
            // "is attached and has no chat page" fits only a live attachment; one whose channel ended
            // shows its state below, whatever pages it registered.
            : instance.attached && ui.chat === undefined
              ? emptyState(h('p', { 'data-fishball-embed-no-chat': true }, t('frameNoChat', { name: instance.name })))
              : framed
                // allow: clipboard-write for the child's own origin too, see EMBED_UI.iframeAllow.
                ? h('iframe', { key: `${instance.attachCount}:${generation}:${src}`, className: CLS.embedFrame, src, title: t('embedTitle'), allow: EMBED_UI.iframeAllow, referrerPolicy: EMBED_UI.iframeReferrerPolicy, 'data-fishball-embed-frame': true })
                : emptyState(
                  h(IconWarningOutlineRegular, { size: EMBED_UI.warningIconPx, className: CLS.embedGlyph }),
                  // An interrupted channel says so: the instance may still be running (B1).
                  h('p', { role: 'alert' }, t(state === FRAME_UI.interrupted ? 'frameInterrupted' : 'embedUnavailable', { name: instance.name })),
                  h('p', null, t('embedState'), ' ', h('code', { className: CLS.code }, state)),
                  instance.code ? h('p', null, t('embedCode'), ' ', h('code', { className: CLS.code }, instance.code)) : null)
        return h('section', { className: CLS.embed, 'aria-label': t('viewTitle'), 'data-fishball-embed': true, 'data-fishball-embed-page': page },
          h('header', { className: CLS.embedBar, 'data-window-drag': true },
            h('span', { className: CLS.embedName }, t('viewTitle')),
            h(FrameState, { state, code: instance?.code ?? null, t }),
            h(FrameBadge, { t }),
            h('div', { className: CLS.embedActions },
              retryCode ? h('span', { role: 'alert', 'data-fishball-retry-error': retryCode }, t('frameRetryFailed'), ' ', h('code', { className: CLS.code }, retryCode)) : null,
              instance?.canRetry ? accentButton({ size: 'sm', disabled: retrying, 'data-fishball-frame-retry': true, onClick: () => void retry() }, retrying ? t('frameRetrying') : t('embedRetry')) : null,
              h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: !framed, onClick: () => setGeneration((value) => value + 1) }, t('embedRefresh')),
              h(Button, { type: 'button', size: 'sm', variant: 'ghost', 'data-fishball-connector-settings': true, onClick: openConnectorSettings }, t('frameConnectorSettings')))),
          body)
      }
    }

    /** Open the Fishball view in DSH's main area, as selecting a session would; nothing when DSH has no layout service. */
    function openFishballView(ctx) {
      ctx.get(SERVICE.layout)?.selectPanel(EMBED_UI.panelId)
    }

    /**
     * The connector Plugins card's "Open instance settings" (conn-OQ-24): shown only while the
     * attached instance registered `ui.settings`, it opens that page framed in the Fishball view.
     */
    function InstanceSettingsEntry({ ctx, t }) {
      const instance = useFishball().instance
      if (instance?.attached !== true || instance.ui?.settings === undefined) return null
      const open = () => { framedPage.set(FRAME_UI.page.settings); openFishballView(ctx) }
      return h('div', { className: CLS.section, 'data-fishball-instance-settings': true },
        h('h3', null, t('instanceTitle')),
        h('p', { className: CLS.muted }, t('instanceHint', { name: instance.name })),
        h('div', { className: CLS.row }, accentButton({ size: 'sm', onClick: open }, t('instanceOpenSettings'))))
    }

    /**
     * The Fishball row in DSH's sidebar panel list: embed-UI's one Fishball entry (R-UI-11). It no
     * longer follows V2's Sidebar entry preference, because the brand it could fall back to is no
     * longer overridden. DSH draws the row, its label and its selected highlight (`aria-current`
     * while the view is open, cleared when you open a session), exactly as for Plugins and Tasks;
     * the icon is the fish mark (the attention part's latch in it, when that part runs).
     */
    const registerSidebarEntry = (ctx, Icon, t) => ctx.slots.inject(SLOT.panelList, () => ctx.slots.register({ name: SLOT.panelList, id: EMBED_UI.panelId, order: EMBED_UI.panelOrder, locale: NS, label: () => t('viewTitle') }, Icon))

    /** One value components share and follow (dialog requests, the tab's open page); set() notifies them. */
    function valueStore(initial) {
      let current = initial
      const listeners = new Set()
      return {
        get: () => current,
        set: (next) => { current = next; for (const listener of listeners) listener() },
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
      }
    }

    /** Only active limits are edited; legacy stored mode/deadline values remain untouched. */
    function limitsSection(scope) {
      const form = new SettingsFormModel(scope, LIMIT_FIELDS.map((field) => settingsNumberField(field)))
      const store = form.bind(() => ({ ...form.shell(), fields: Object.fromEntries(LIMIT_FIELDS.map((field) => [field, form.field(field)])) }))
      return { store, actions: form.actions(), dispose: () => form.dispose() }
    }

    /**
     * The connector's Plugins card (the `plugins.bundle.config` slot of fishball-connector): its
     * limits form, edited only here (D24), and "Open instance settings" below them
     * while the attached instance registered `ui.settings` (conn-OQ-24). The isolated child's
     * status, model, plugins, settings and model sync are no longer here: they belong to the
     * instance's own pages and its own Plugins card (design §0.7, D23, D26).
     */
    function makeSettingsPage(ctx, section, t) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballSettings(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        const baseId = React.useId()
        if (props.view === SUMMARY_VIEW) return null
        const disabled = !state.writable || state.saving
        return h(React.Fragment, null,
          h('h3', null, t('limits')),
          h(SettingsForm, {
            labels: { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') },
            state,
            onSave: section.actions.save,
            onDiscard: section.actions.discard,
          }, LIMIT_FIELDS.map((field) => {
            const value = state.fields[field]
            return h(SettingsValueField, {
              key: field,
              id: `${baseId}-${field}`,
              label: t('field.' + field),
              text: value.text,
              overridden: value.overridden,
              invalid: value.invalid,
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('invalid'),
              disabled,
              numeric: true,
              onEdit: (text) => section.actions.edit(field, text),
              onReset: () => section.actions.resetField(field),
            })
          })),
          h(InstanceSettingsEntry, { ctx, t }))
      }
    }

    function mountStyles() {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    // The plugin manager (DESIGN §10d): the Fishball tab of DSH's Plugins page, and a tag and a
    // switch on DSH's own page for each plugin. Every change goes to Fishball's side only.

    /**
     * What the parts share with the shell (client.marks.js, client.attention.js, client.records.js):
     * one state stream, one POST helper, one style sheet and dictionary, and the seats. A part is a
     * factory of this kit; client.js starts each result as a sub-plugin of the row.
     */
    exports.kit = Object.freeze({
      NS, SLOT, API, STATUS, CLS, EMBED_UI, ROW_MARK, UNREAD_BADGE, SEAT, seats,
      useFishball, send, valueStore, brandIconOf, attentionDot, unreadCount, CHILD_UI,
    })
    exports.readAvailability = readAvailability
    /**
     * The shell as a client plugin for what is usable now (readAvailability). The connector's
     * Plugins card follows its own row's settings namespace (configForms.whileServed), as in V2.
     * @param available - `{page, connector, legacy}` from the host half.
     */
    exports.shellPlugin = (available) => ({ name: PACKAGE_NAME, inject: ['slots', 'locale', 'configForms'], apply: (ctx) => apply(ctx, available) })
    function apply(ctx, available) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'fishball: dictionaries')
      ctx.effect(mountStyles, 'fishball: styles')
      // The Fishball view in DSH's main area, as Plugins and Tasks register theirs (§7). The key is
      // registered for the plugin's life, as theirs are.
      // The page and its sidebar entry by availability (UIM-EP-01): the locator's view, else (W3
      // only) the V2 connector frame, else none. With a connector but no page, the fish row stays
      // (R-UI-08: "its fish has no page to open"), so it registers the view's slot only with a page.
      const View = available.page ? makeChildView(ctx, t) : available.legacy ? makeFishballView(ctx, t) : undefined
      if (View !== undefined) ctx.effect(() => ctx.slots.inject(SLOT.main, () => ctx.slots.register({ name: SLOT.main, key: EMBED_UI.panelId, locale: NS }, View)), 'fishball: main view')
      if (View !== undefined || available.connector) ctx.effect(() => registerSidebarEntry(ctx, Mark, t), 'fishball: sidebar row')
      ctx.effect(() => {
        const section = limitsSection(ctx.configForms.get(ENTRY_ID))
        const Settings = makeSettingsPage(ctx, section, t)
        const stopServing = ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject(SLOT.bundleConfig, () => ctx.slots.register({ name: SLOT.bundleConfig, key: PACKAGE_NAME, locale: NS }, Settings)))
        return () => { stopServing(); section.dispose() }
      }, 'fishball: settings page')
    }
    return module.exports
  },
})