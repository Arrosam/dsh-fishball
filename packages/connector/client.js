/**
 * Fishball browser half (DESIGN §10).
 *
 * 1. Brand: fills sidebar.brand.mark / sidebar.brand.name at slot priority -1 (a single
 *    slot renders its LOWEST priority; the shipped brand uses 0 — spike S14). The name
 *    occupant takes over its enclosing button's click (capture phase, so it runs before
 *    the shell's New Session handler) and opens the Fishball view (item 3). On macOS Desktop
 *    the brand row is a drag region without a button; there Fishball opens from its
 *    sidebar row.
 * 2. The connector's Plugins card (§0.7, D24): DSH's form of the connector's settings (its limits
 *    and the question mode, src/config.js; C2: the only place they change), and "Open instance
 *    settings" while the attached instance registered `ui.settings`. The instance's own status,
 *    model, plugins and settings are the instance's pages, not this card.
 * 3. The Fishball view (slim §7) inside the connector's frame (§0.5 "The frame", D27): the
 *    attached instance's `ui.chat` (or its `ui.settings`, from the card) framed in DSH's main area,
 *    the `main` slot where a session's conversation shows, opened by the brand and by a Fishball row
 *    in the sidebar's panel list. The frame shows the instance's state, Fishball's unread count and
 *    Connector settings; with no instance it shows an empty state and no iframe.
 * 4. The body's marks on ordinary sessions (§8.2, §8.3): Hand over / Take back in the header and
 *    row menu, the managed-session fish and dots on the row, and the ask_fishball row with your
 *    Allow once / Reject once the request is yours.
 * The in-process Fishball's own surfaces (its chat dock, pile, welcome card, model gate, the
 * Plugins page's Fishball tab and install dialog, the Messenger look) were removed with it.
 *
 * The mark is FishMark from the owner's fishball app (THIRD_PARTY_NOTICES); the connector's own
 * icon is FishMark with a wrench badge (assets/connector-icon.svg, D22).
 *
 * State comes from GET /api/fishball/events (server-sent snapshots). The card record's view is the
 * package-local chunk client.records.js.
 */
window.__ModuleLoader__.load({
  // DSH's client module system registers a bundle under its package name (dsh-client-modules).
  id: 'fishball-connector',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { BrandWordmark, Button, FISH_LOGO_PATH, FISH_LOGO_VIEWBOX, IconWarningOutlineRegular, Input, MenuItemButton, Modal, SettingsForm, SettingsFormModel, SettingsValueField, Tag, settingsNumberField, settingsTextField } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const PACKAGE_NAME = 'fishball-connector'
    /** Host row id; also the settings namespace configForms serves (cordis.patch.yml, design §0.2 D22). */
    const ENTRY_ID = 'fishball-connector'
    const NS = 'fishball'
    const BRAND_PRIORITY = -1
    /** Client services read on demand (not injected: Fishball works without each of them). */
    const SERVICE = Object.freeze({ layout: 'layout' })
    const SUMMARY_VIEW = 'summary'
    /** Host statuses (src/constants.js STATUS) the page compares against. */
    const STATUS = Object.freeze({ starting: 'starting', live: 'live' })
    /** Fishball's own feature plugins in the snapshot's `features` (src/builtins.js FEATURE_KEY; revision 10c). */
    /** Whether a feature runs; a Host without the field (older) shows everything, as before. */
    const API = Object.freeze({ events: 'api/fishball/events', send: 'api/fishball/send', managed: 'api/fishball/managed', requestsAnswer: 'api/fishball/requests/answer', grantsRevoke: 'api/fishball/grants/revoke' })
    /**
     * The one hand-over entry (§8.3): the session header and the session-row menu share it. Menu
     * order: after DSH's own pin/rename/fork/archive, before the id; header order: just before
     * Fishball's own settings action. The Take back refusal keeps its own overlay id, because the
     * dialog and that notice are registered in the same slot.
     */
    const HAND_OVER = Object.freeze({ id: 'fishball-hand-over', noticeId: 'fishball-hand-over-notice', menuOrder: 422, headerOrder: 4.5 })
    /** Hand-over refusals with their own text (keep in step with src/constants.js INTAKE_ERROR). */
    const HAND_OVER_ERRORS = new Set(['queue-full', 'too-large', 'from-fishball', 'unknown-session', 'unavailable'])
    /** Take back refusals with their own text (src/constants.js MANAGED_ERROR). */
    const MANAGE_ERRORS = new Set(['unknown-session', 'is-fishball', 'unavailable'])
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
      iframeAllow: 'clipboard-write',
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
    /** Brand icon choices (src/constants.js BRAND_STYLE). */
    const BRAND_STYLE = Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' })
    /** Where the sidebar opens the Fishball view (src/constants.js SIDEBAR_ENTRY): its own row, or the brand only. */
    const SIDEBAR_ENTRY = Object.freeze({ panel: 'panel', brand: 'brand' })
    const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' })
    const SLOT = Object.freeze({
      mark: 'sidebar.brand.mark',
      name: 'sidebar.brand.name',
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
     * Your pile as a list of rows with a detail view (DESIGN §10e, rev11-pile-list). The reveal's
     * length and easing are presentation, not settings (the manager's decision): short, so a switch
     * never holds up a click; under prefers-reduced-motion: reduce every switch is instant.
     */
    const PILE_LIST = Object.freeze({
      revealMs: 180,
      easing: 'cubic-bezier(.2,0,0,1)',
      /** A reveal's states, drawn as data-fishball-reveal. */
      reveal: Object.freeze({ hidden: 'hidden', opening: 'opening', open: 'open', closing: 'closing' }),
      /** A shell tool's command argument, as prefix grants read it (keep in step with src/constants.js GRANT.commandArgument). */
      commandArgument: Object.freeze({ bash: 'command', pwsh: 'command', terminal_send: 'text' }),
      escapeKey: 'Escape',
      /** The pile's scrolling box: a click on it (its scroll bar) is not a click outside the detail. */
      scrollArea: '[data-fishball-pile]',
      /** One card's whole box in the list (its li): a click inside it is not outside its detail. */
      cardBox: '[data-fishball-card]',
      rowGapPx: 8,
    })
    /**
     * The managed mark in a sidebar row. cellPx copies DSH's leading cell (the seat's contract in
     * dsh-client-ui-workspace slots.d.ts, rc.2: "the 16px cell before the title"); the cell is not
     * sized by its parent, so a percentage would collapse. Revisit if DSH resizes it.
     *
     * Idle: a still fish in the leading seat. Running: DSH replaces that seat with its own spinner,
     * so the same fish moves to the trailing seat and animates (0.2.2's always-mounted seat). The
     * dots sit at the mark's top-right; needs-action is checked first, so it wins when both apply.
     * Green/yellow come from DSH's state tokens, so light and dark themes both read.
     */
    const MANAGED_ROW = Object.freeze({
      id: 'fishball-managed',
      iconPx: 14,
      cellPx: 16,
      dot: Object.freeze({ sizePx: 7, topPx: -1, rightPx: -1, unread: 'unread', action: 'action' }),
      /** The flipping fish while a row runs (design ⑥): a half-turn, a hold, then the other half. */
      flipAnimation: 'fb-flip',
      flipSeconds: 1.8,
      flipOrigin: '50% 50%',
      flip: Object.freeze([[0, 0], [45, 180], [55, 180], [100, 360]]),
      /** Values of data-fishball-row-state, so a running mark is distinguishable from an idle one. */
      state: Object.freeze({ idle: 'idle', running: 'running' }),
    })
    /**
     * The Host state one managed row's dots read. Both are per session, never Fishball-wide:
     * - green: an open intake row whose source identity is this session (a message_fishball from
     *   it that Fishball has not read). The prefix is src/messaging.js SOURCE_ID.session; the open
     *   statuses are INTAKE_STATUS pending/accepted (src/constants.js).
     * - yellow: a card or question in state.pile whose sessionId is this session.
     * Fishball's own chat unread count stays on the top-left brand mark, where the design keeps it.
     */
    const ROW_STATE = Object.freeze({
      unreadSource: 'session/',
      unreadStatuses: new Set(['pending', 'accepted']),
    })
    /** The ask_fishball row (S37): DSH has no view for this tool, so this entry draws the whole row. */
    const ASK_ROW = Object.freeze({ tool: 'ask_fishball', phaseStart: 'start', phaseResult: 'result' })
    /** ask_fishball's answer codes with their own words (keep in step with src/constants.js ASK_RESULT, ASK_ERROR). */
    const ASK_CODES = new Set(['allowed', 'rejected', 'question', 'unavailable', 'over-capacity', 'no-longer-managed', 'not-user-message', 'too-large', 'expired', 'invalid-request', 'empty', 'cancelled'])
    /** Your answer on a card (src/constants.js CARD_DECISION) and refusals with their own text. */
    const CARD_DECISION = Object.freeze({ allow: 'allow', reject: 'reject' })
    const CARD_ERRORS = new Set(['expired', 'too-large', 'unavailable'])
    // The attribute Fishball keeps on DSH's brand button (rev11-ui-fixes R5).
    const BRAND_LABEL_ATTR = 'aria-label'
    // ask_fishball's reason_from for Fishball's own reason (rev11-ui-fixes R3); a row from before the fix has none.
    const REASON_FROM_FISHBALL = 'fishball'
    /**
     * Questions and plan reviews (rev11g, §7a.10; src/constants.js QUESTION_KIND, QUESTION_MODE):
     * the mode is a field of DSH's form of the row (src/config.js QUESTION_MODE_SETTING). You answer
     * them in their own session (DSH's question card); the pile that had a question form is gone
     * (docs/slim-native-design.md §12).
     */
    const QUESTION_VIEW = Object.freeze({ question: 'question', planReview: 'plan-review', field: 'questionMode', modes: Object.freeze(['auto', 'fishball', 'user']) })
    const GRANT_ERRORS = new Set(['unknown', 'ended', 'unavailable'])
    const JSON_INDENT = 2
    /**
     * The limit fields, in the order the Host declares them (src/config.js LIMITS, the
     * conn-OQ-20 set). The form model needs its fields before the first state frame arrives, so
     * the browser keeps this list; the Host schema still decides validity on save.
     */
    const LIMIT_FIELDS = Object.freeze(['maxQueuedInputs', 'maxActiveWatches', 'maxPendingApprovals', 'approvalAnswerSeconds', 'argumentExcerptBytes', 'maxMessageBytes', 'auditEntriesKept', 'requestUserMessageBytes', 'rationaleChars', 'watchesShown', 'readSessionMessages', 'readSessionBytes', 'forwardExcerptBytes', 'userMessagesListed', 'userMessageExcerptChars'])
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
     * The font the brand's text ends on (the tag, the unread count, the word logo's fallback).
     * DSH sets <html lang> to its display language (dsh-client-locale), and a bare `sans-serif`
     * then picks a per-language face: PingFang SC in Chinese, lighter and shaped differently,
     * so the tag changed look. Named Latin faces first give every language the English face.
     * DSH's own --dsw-font-family is SF Pro on macOS, wider than the approved look.
     */
    const BRAND_LATIN_FONT = 'Helvetica,Arial,sans-serif'
    /**
     * The word logo from the fishball repo. The repo ships no image for it: it is the string
     * `wordmark` ("FISHBALL", strings.xml) set in the display face at weight 900 with -0.5px
     * tracking (docs/preview/designs.html `.brand .wm`, Theme.kt displaySmall). The face is
     * the repo's stack and is not downloaded here, so a machine without Archivo falls back to
     * the next family, as the app's own dummy does. It ends on BRAND_LATIN_FONT instead of
     * the repo's bare `sans-serif`, so Windows (no Helvetica Neue) keeps one face in every language.
     */
    const WORDMARK = Object.freeze({
      fontFamily: `"Archivo","Helvetica Neue",${BRAND_LATIN_FONT}`,
      fontWeight: 900,
      letterSpacing: '-0.5px',
      lineHeight: 1,
      /** Lifts the word so the tag below can cover its bottom edge without hiding the letters. */
      lift: '-2px',
    })
    /**
     * The "Deepseek Harness" tag: a flat sticker overlapping the word logo's bottom-right corner
     * (design 8 of the owner's pick, untilted at the owner's request), with a hard magenta drop
     * shadow. A negative `right` pushes it past the word's right edge so its left end no longer
     * covers the mark; the brand button has free room to the right of the word (it grows to the
     * sidebar toggle), so nothing is cut off. It covers the foot of the last letters on purpose:
     * the small plain text it replaced could not be read at sidebar size. Flat, it sits low (the
     * owner picked -9px) so it touches only the letters' feet; at -2px it hid their lower half.
     * Its bottom and shadow hang below the shell's brand box (dsh-client-ui-sidebar `.brand`,
     * 24px high, overflow hidden), so releaseClip() opens it while the brand is shown. The fill
     * and text swap the sidebar's own label colours so the
     * sticker reads on light and dark themes; the ring is the sidebar ground and separates the
     * sticker from the letters it covers; the shadow is the mark's eye magenta
     * (FISH_MARK.eyeColor), the one colour the brand spends.
     */
    const BRAND_TAG = Object.freeze({
      fontFamily: BRAND_LATIN_FONT, fontSize: '9px', lineHeight: '11px', fontWeight: 800, paddingX: '4px', radius: '1px',
      right: '-16px', bottom: '-9px',
      fill: 'var(--dsw-alias-label-primary)', textColor: 'var(--dsw-alias-label-primary-inverted)',
      ring: '0 0 0 1.5px var(--dsw-alias-label-primary-inverted)', shadow: '2px 2px 0 1.5px ' + FISH_MARK.eyeColor,
    })
    /**
     * How many ancestors above the brand name releaseClip() searches for the clipping box. The
     * shell nests it brandName > brandIdentity > brand (a button, or a span on macOS Desktop), so
     * 4 leaves one spare level. The bound keeps a shell change from making this open a distant
     * container (the sidebar or the app root) that was meant to clip.
     */
    const CLIP_SEARCH_DEPTH = 4
    /**
     * Unread replies on the mark: a count pill on its top-right corner and a short tail wag,
     * repeated every WAG cycle while anything is unread (the pill pops with the wag and rests
     * between). The pill takes the brand's one accent and a ring in the sidebar's label colour
     * so it separates from the mark on light and dark themes, as the Deepseek Harness tag does.
     * The pill shows the count up to `max`, then "${max}+", so it stays narrow in the sidebar.
     * The wag pivots near the tail's root; it is a keyframe list, so a change of look edits data.
     * The pill overhangs the mark by 7px above and 9px to the right. The shell clips the brand
     * button (overflow:hidden, exactly the mark's 24px high), so it shows only because
     * releaseClip() opens that box while the brand is shown; if a DSH update changes that markup the
     * pill is cut. Check it in the expanded sidebar, the collapsed rail and the Windows titlebar.
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
    const CLS = Object.freeze({ cardHead: 'fb-card-head', title: 'fb-title', pre: 'fb-pre', actions: 'fb-actions', askRow: 'fb-ask-row', field: 'fb-field', note: 'fb-note', entries: 'fb-entries', section: 'fb-section', row: 'fb-row', label: 'fb-label', code: 'fb-code', name: 'fb-name', tag: 'fb-tag', mark: 'fb-mark', markBox: 'fb-mark-box', swim: 'fb-swim', badge: 'fb-badge', wag: 'fb-wag', grow: 'fb-grow', muted: 'fb-muted', recordBody: 'fb-record-body', managedRow: 'fb-managed-row', managedRowDot: 'fb-managed-row-dot', flip: 'fb-flip', reveal: 'fb-reveal', revealInner: 'fb-reveal-inner', embed: 'fb-embed', embedBar: 'fb-embed-bar', embedName: 'fb-embed-name', embedState: 'fb-embed-state', embedActions: 'fb-embed-actions', embedFrame: 'fb-embed-frame', embedError: 'fb-embed-error', embedGlyph: 'fb-embed-glyph' })

    const en = {
      brandName: 'FISHBALL',
      brandTag: 'Deepseek Harness',
      brandLabel: 'Open Fishball',
      brandLabelUnread: 'Open Fishball, {count} unread',
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
      'field.approvalAnswerSeconds': 'Seconds Fishball has to answer a request',
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
      questionMode: 'Questions in managed sessions',
      questionModeHint: 'Who answers the questions and plan reviews of sessions Fishball manages. Your own sessions\' questions always stay with you.',
      'questionMode.auto': 'Auto',
      'questionMode.fishball': 'Fishball',
      'questionMode.user': 'You',
      'questionModeHint.auto': 'Fishball answers only when your own words cover it; otherwise the question stays in its session for you to answer on its own question card, not in your pile.',
      'questionModeHint.fishball': 'Fishball answers on its own judgement and sends you only what it cannot decide.',
      'questionModeHint.user': 'Every question stays in its session for you to answer on its own question card, not in your pile; Fishball may add a note.',
      cardReason: 'Reason',
      cardFishballNote: 'Fishball',
      allowOnce: 'Allow once',
      reject: 'Reject',
      rejectNote: 'Note to the agent (optional)',
      rejectSend: 'Reject',
      'cardError.expired': 'This request was already answered or has ended.',
      'cardError.too-large': 'The note is too long.',
      'cardError.unavailable': 'Fishball is not running.',
      cardFailed: 'That did not work.',
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
      'grantError.unknown': 'This grant does not exist.',
      'grantError.ended': 'This grant has already ended.',
      'grantError.unavailable': 'Fishball is not running.',
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
      brandName: 'FISHBALL',
      brandTag: 'Deepseek Harness',
      brandLabel: '打开 Fishball',
      brandLabelUnread: '打开 Fishball，{count} 条未读',
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
      'field.approvalAnswerSeconds': 'Fishball 回答请求的秒数',
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
      questionMode: '受管会话中的问题',
      questionModeHint: '由谁回答 Fishball 管理的会话中的问题和计划审阅。你自己的会话中的问题始终由你回答。',
      'questionMode.auto': '自动',
      'questionMode.fishball': 'Fishball',
      'questionMode.user': '你',
      'questionModeHint.auto': '只有在你自己的话涵盖时 Fishball 才回答；否则问题留在它所在的会话中，由你在该会话自己的问题卡片上回答，不会进入你的待处理区。',
      'questionModeHint.fishball': 'Fishball 按自己的判断回答，只把它无法决定的交给你。',
      'questionModeHint.user': '每个问题都留在它所在的会话中，由你在该会话自己的问题卡片上回答，不会进入你的待处理区；Fishball 可以附上备注。',
      cardReason: '理由',
      cardFishballNote: 'Fishball',
      allowOnce: '允许一次',
      reject: '拒绝',
      rejectNote: '给代理的说明（可选）',
      rejectSend: '拒绝',
      'cardError.expired': '这个请求已被处理或已结束。',
      'cardError.too-large': '说明太长。',
      'cardError.unavailable': 'Fishball 未在运行。',
      cardFailed: '操作未成功。',
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
      'grantError.unknown': '这个许可不存在。',
      'grantError.ended': '这个许可已经结束。',
      'grantError.unavailable': 'Fishball 未在运行。',
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
      `.${CLS.flip}{transform-origin:${MANAGED_ROW.flipOrigin};animation:${MANAGED_ROW.flipAnimation} ${MANAGED_ROW.flipSeconds}s ease-in-out infinite}`,
      `@keyframes ${MANAGED_ROW.flipAnimation}{${MANAGED_ROW.flip.map(([at, degrees]) => `${at}%{transform:rotateY(${degrees}deg)}`).join('')}}`,
      // Motion is the only thing that stops: the pill, its count and the dots stay.
      `@media (prefers-reduced-motion:reduce){.${CLS.badge},.${CLS.wag},.${CLS.swim},.${CLS.flip}{animation:none}}`,
      `.${CLS.row}{display:flex;gap:12px;align-items:baseline}`,
      `.${CLS.label}{min-width:120px;color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.code}{font-family:var(--ds-font-family-code);overflow-wrap:anywhere}`,
      `.${CLS.name}{position:relative;display:inline-block;font-family:${WORDMARK.fontFamily};font-weight:${WORDMARK.fontWeight};letter-spacing:${WORDMARK.letterSpacing};line-height:${WORDMARK.lineHeight};top:${WORDMARK.lift}}`,
      // Overlaid on the corner, so it takes no layout space and cannot push the sidebar controls.
      `.${CLS.tag}{position:absolute;right:${BRAND_TAG.right};bottom:${BRAND_TAG.bottom};padding:0 ${BRAND_TAG.paddingX};border-radius:${BRAND_TAG.radius};background:${BRAND_TAG.fill};color:${BRAND_TAG.textColor};font:${BRAND_TAG.fontWeight} ${BRAND_TAG.fontSize}/${BRAND_TAG.lineHeight} ${BRAND_TAG.fontFamily};box-shadow:${BRAND_TAG.ring},${BRAND_TAG.shadow};white-space:nowrap;pointer-events:none}`,
      `.${CLS.grow}{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}`,
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
      `.${CLS.entries}{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}`,
      // The pile and the ask_fishball row (revision 11, S37's fixture look), in DSH's theme tokens
      // so they follow light and dark. The pile's height comes from pileMaxHeightVh, set inline.
      `.${CLS.entries}>:first-child>.${CLS.revealInner}>.${CLS.card}{border-top:0}`,
      // The reveal (rev11-pile-list): a one-row grid from 0fr to 1fr, so the box's height moves and the
      // entries around it reflow with it. Its content is clipped only while it moves, so focus rings
      // and the pinned titles work once it is open.
      `.${CLS.reveal}{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows ${PILE_LIST.revealMs}ms ${PILE_LIST.easing},opacity ${PILE_LIST.revealMs}ms ${PILE_LIST.easing}}`,
      `.${CLS.reveal}[data-fishball-reveal="${PILE_LIST.reveal.hidden}"],.${CLS.reveal}[data-fishball-reveal="${PILE_LIST.reveal.closing}"]{grid-template-rows:0fr;opacity:0}`,
      `.${CLS.revealInner}{min-width:0;min-height:0}`,
      `.${CLS.reveal}:not([data-fishball-reveal="${PILE_LIST.reveal.open}"])>.${CLS.revealInner}{overflow:hidden}`,
      `@media (prefers-reduced-motion: reduce){.${CLS.reveal}{transition:none}}`,
      `.${CLS.cardHead}{display:flex;flex-wrap:wrap;align-items:center;gap:8px}`,
      `.${CLS.title}{color:var(--dsw-alias-label-primary);font-weight:500;overflow-wrap:anywhere}`,
      `.${CLS.pre}{margin:0;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);font-family:var(--ds-font-family-code);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${CLS.actions}{display:flex;flex-wrap:wrap;align-items:center;gap:8px}`,
      `.${CLS.askRow}{display:flex;flex-direction:column;gap:6px;padding:6px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}`,
      `.${CLS.managedRow}{position:relative;display:inline-flex;align-items:center;justify-content:center;width:${MANAGED_ROW.cellPx}px;height:${MANAGED_ROW.cellPx}px;color:var(--dsw-alias-label-primary)}`,
      // The dots' two meanings get DSH's own state tokens; yellow is checked first in the component.
      `.${CLS.managedRowDot}{position:absolute;top:${MANAGED_ROW.dot.topPx}px;right:${MANAGED_ROW.dot.rightPx}px;box-sizing:border-box;width:${MANAGED_ROW.dot.sizePx}px;height:${MANAGED_ROW.dot.sizePx}px;border-radius:50%;background:var(--dsw-alias-state-success-primary);pointer-events:none}`,
      `.${CLS.managedRowDot}[data-fishball-dot="${MANAGED_ROW.dot.action}"]{background:var(--dsw-alias-state-warn-primary)}`,
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

    /** Unread replies from the Host snapshot: a whole number, 0 until the first frame arrives. */
    const unreadCount = (state) => state.unread?.count ?? 0
    /** The unread count in words, capped so the pill stays narrow. */
    const unreadText = (t, count) => count > UNREAD_BADGE.max ? t('unreadMany', { max: UNREAD_BADGE.max }) : String(count)
    /**
     * Whether this row's session has a card or question waiting for you: the Host's one pile,
     * filtered by the card's own sessionId. A card from Fishball's own session has no managed row,
     * so it lights no dot; the mark never borrows another session's card.
     */
    const needsAction = (state, sessionId) => (Array.isArray(state.pile) ? state.pile : []).some((card) => card?.sessionId === sessionId)
    /**
     * Whether Fishball has unread input from this row's session: an open intake row whose source
     * identity is this session. The snapshot lists at most INTAKE.rowsShown items (src/constants.js), so a very old
     * open item may be missing from the dot; the dot is a hint, not a queue count.
     */
    const unreadInput = (state, sessionId) => (Array.isArray(state.intake?.items) ? state.intake.items : []).some((item) => item?.sourceIdentity === ROW_STATE.unreadSource + sessionId && ROW_STATE.unreadStatuses.has(item.status))

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

    function makeMark(t) {
      return function Mark({ size }) {
        const state = useFishball()
        const count = unreadCount(state)
        const Icon = brandIconOf(state)
        return h('span', { className: CLS.markBox, 'data-fishball-unread': count },
          h(Icon, { size, unread: count > 0, badge: true }),
          count > 0 ? h('span', { className: CLS.badge, 'data-fishball-badge': true }, unreadText(t, count)) : null)
      }
    }

    /**
     * Lets the tag overhang the shell's brand box: opens the nearest clipping ancestor of the
     * brand name and returns a function that puts back its inline overflow. The row above it is
     * 60px tall (40px with the Windows titlebar), so the few pixels of overhang stay visible.
     */
    function releaseClip(node) {
      let box = node?.parentElement
      for (let depth = 1; box && depth < CLIP_SEARCH_DEPTH && getComputedStyle(box).overflowX === 'visible'; depth += 1) box = box.parentElement
      if (!box || getComputedStyle(box).overflowX === 'visible') return undefined
      const previous = box.style.overflow
      box.style.overflow = 'visible'
      return () => { box.style.overflow = previous }
    }

    function makeBrandName(ctx, t) {
      return function FishballBrandName() {
        const ref = React.useRef(null)
        // Subscribed for the unread count and the chosen brand icon; the click opens the Fishball view.
        const state = useFishball()
        const count = unreadCount(state)
        const deepseek = brandStyleOf(state) === BRAND_STYLE.deepseek
        React.useEffect(() => releaseClip(ref.current), [])
        React.useEffect(() => {
          const button = ref.current?.closest('button')
          if (!button) return undefined
          let previous = button.getAttribute(BRAND_LABEL_ATTR)
          // DSH renders its own label on this button and sets it again whenever it re-renders (after
          // its language loads on a fresh page, or changes): put Fishball's back each time, worded
          // anew so it follows the current language (rev11-ui-fixes R5). Equal labels are left
          // alone, so this cannot loop.
          const keepLabel = () => {
            const label = count > 0 ? t('brandLabelUnread', { count }) : t('brandLabel')
            const current = button.getAttribute(BRAND_LABEL_ATTR)
            if (current === label) return
            // DSH's newest label (e.g. in a new language) is the one to give back when Fishball's goes.
            previous = current
            button.setAttribute(BRAND_LABEL_ATTR, label)
          }
          keepLabel()
          const labelWatch = new MutationObserver(keepLabel)
          labelWatch.observe(button, { attributes: true, attributeFilter: [BRAND_LABEL_ATTR] })
          const onClick = (event) => {
            // The brand opens the Fishball view in the main area (§7), with or without its sidebar row.
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            openFishballView(ctx)
          }
          button.addEventListener('click', onClick, true)
          return () => {
            labelWatch.disconnect()
            button.removeEventListener('click', onClick, true)
            if (previous === null) button.removeAttribute(BRAND_LABEL_ATTR)
            else button.setAttribute(BRAND_LABEL_ATTR, previous)
          }
        }, [count])
        // DeepSeek's word logo is the stock one, without Fishball's tag or its lifted word.
        if (deepseek) return h('span', { ref, 'data-fishball-name': BRAND_STYLE.deepseek }, h(BrandWordmark, { includeMark: false }))
        return h('span', { ref, className: CLS.name, 'data-fishball-name': true },
          t('brandName'),
          h('span', { className: CLS.tag, 'data-fishball-tag': true }, t('brandTag')))
      }
    }

    /**
     * Which of the attached instance's pages the view frames. The Plugins card's "Open instance
     * settings" asks for `settings` (conn-OQ-24); the view puts it back to `chat` when it unmounts,
     * so the next visit from the row or the brand frames the chat again. An instance whose
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

    /** Fishball's unread count in the frame: the brand mark's own count and cap, absent at 0. */
    function FrameUnread({ t }) {
      const count = unreadCount(useFishball())
      if (count === 0) return null
      return h('span', { 'data-fishball-frame-unread': count, 'aria-label': t('frameUnread', { count }) },
        h(Tag, { tone: EMBED_UI.neutralTone }, unreadText(t, count)))
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

    /**
     * The Fishball view (§7) inside the connector's frame (design §0.5 "The frame", D27): DSH's
     * main area where a session's conversation shows (the `main` slot, keyed by EMBED_UI.panelId).
     * DSH swaps it out when you open a session and back in when you select Fishball, so it has no
     * Close. The frame is the same around the instance's chat and its settings page: the title,
     * the state tag, the unread count, Connector settings (always, so DSH's form of
     * fishball-connector is reachable in every state), Refresh and Retry (failed and the instance gave
     * retry). There is no "Open in a tab" (the user's decision, 2026-11-07). The content is the
     * instance's own page, framed at its registered path plus `lang` (framedUrl). The iframe's key holds that address, so a language change remounts it: a reload.
     * Nothing crosses the iframe: the view installs no `message` listener and acts on no
     * postMessage from the page (D27; the contract's former open-settings message is dropped).
     * Everything it shows comes from the connector's own state and routes.
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
                ? h('iframe', { key: `${generation}:${src}`, className: CLS.embedFrame, src, title: t('embedTitle'), allow: EMBED_UI.iframeAllow, 'data-fishball-embed-frame': true })
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
            h(FrameUnread, { t }),
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

    /** Which sidebar entry you chose; the panel row until the Host says otherwise. */
    const sidebarEntryOf = (state) => state.preferences?.sidebarEntry ?? SIDEBAR_ENTRY.panel

    /**
     * The Fishball row in DSH's sidebar panel list, while you keep it (Settings → Sidebar entry).
     * DSH draws the row, its label and its selected highlight (`aria-current` while the view is
     * open, cleared when you open a session), exactly as for Plugins and Tasks; the icon is the
     * brand mark with its unread count.
     */
    function followSidebarEntry(ctx, Icon, t) {
      let dispose
      const update = () => {
        const wanted = sidebarEntryOf(stateSource.get()) === SIDEBAR_ENTRY.panel
        if (wanted === (dispose !== undefined)) return
        if (!wanted) { dispose(); dispose = undefined; return }
        dispose = ctx.slots.inject(SLOT.panelList, () => ctx.slots.register({ name: SLOT.panelList, id: EMBED_UI.panelId, order: EMBED_UI.panelOrder, locale: NS, label: () => t('viewTitle') }, Icon))
      }
      update()
      const unsubscribe = stateSource.subscribe(update)
      return () => { unsubscribe(); dispose?.(); dispose = undefined }
    }

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

    /**
     * The hand-over dialog's request (§8.3): one store shared by the session-row menu entry and
     * the header action; the dialog lives in the shell overlay so it outlives the menu.
     */
    const handOverRequest = (() => {
      const store = valueStore(null)
      return { ...store, open: (sessionId, title) => store.set({ sessionId, title }), close: () => store.set(null) }
    })()
    const useHandOverRequest = () => React.useSyncExternalStore(handOverRequest.subscribe, handOverRequest.get)
    /** Any session but Fishball's own id (which names no main session). */
    const isOtherSession = (state, sessionId) => Boolean(sessionId) && sessionId !== state.sessionId
    /** Whether a session can be handed over: the body is up, and it is not Fishball's own session. */
    const canHandOver = (state, sessionId) => state.status === STATUS.live && isOtherSession(state, sessionId)

    function makeHandOverDialog(t) {
      return function FishballHandOverDialog() {
        const request = useHandOverRequest()
        if (request === null) return null
        return h(HandOverForm, { key: request.sessionId, request, t })
      }
    }

    /** One hand-over's dialog: the note and in-flight state die with it. */
    function HandOverForm({ request, t }) {
      const [note, setNote] = React.useState('')
      const [handingOver, setHandingOver] = React.useState(false)
      const [problem, setProblem] = React.useState(null)
      const close = () => { if (!handingOver) handOverRequest.close() }
      const confirm = async () => {
        setHandingOver(true)
        // The send route forwards the note as the user's words and makes the session managed.
        const { ok, code } = await send(API.send, { sessionId: request.sessionId, note })
        setHandingOver(false)
        if (ok) handOverRequest.close()
        else setProblem(HAND_OVER_ERRORS.has(code) ? 'handOverError.' + code : 'handOverFailed')
      }
      return h(Modal, {
        open: true,
        onClose: close,
        closeLabel: t('close'),
        title: request.title ? t('handOverTitle', { title: request.title }) : t('handOver'),
        footer: h(React.Fragment, null,
          h(Button, { type: 'button', variant: 'outline', disabled: handingOver, onClick: close }, t('cancel')),
          h(Button, { type: 'button', variant: 'primary', disabled: handingOver, onClick: confirm }, handingOver ? t('handingOver') : t('handOverConfirm'))),
      },
        h('p', { className: CLS.muted }, t('handOverHint')),
        h('label', { className: CLS.field },
          h('span', null, t('handOverNoteLabel')),
          h('textarea', { className: CLS.note, value: note, rows: 4, placeholder: t('handOverNotePlaceholder'), 'data-modal-autofocus': true, disabled: handingOver, onChange: (event) => { setNote(event.target.value); setProblem(null) } })),
        problem ? h('div', { role: 'alert' }, t(problem)) : null)
    }

    /**
     * A request from a menu entry or header action and its refusal, in one store outside the menu:
     * a menu entry unmounts when the menu closes, so the refusal is shown by the overlay
     * (makeRequestNotice), not by the entry.
     * @param path - the Host route. @param errors - refusal codes with their own text under `errorPrefix`.
     * @param failedKey - the text of any other failure.
     */
    function requestNotice(path, errors, errorPrefix, failedKey) {
      const store = valueStore(null)
      return {
        get: store.get,
        subscribe: store.subscribe,
        async request(body) {
          const { ok, code } = await send(path, body)
          store.set(ok ? null : errors.has(code) ? errorPrefix + code : failedKey)
        },
        dismiss: () => store.set(null),
      }
    }
    /** The refusal of a notice's last request, as a dialog in the shell overlay. */
    function makeRequestNotice(t, notice, titleKey) {
      return function FishballRequestNotice() {
        const problem = React.useSyncExternalStore(notice.subscribe, notice.get)
        if (problem === null) return null
        return h(Modal, {
          open: true,
          onClose: notice.dismiss,
          closeLabel: t('close'),
          title: t(titleKey),
          footer: h(Button, { type: 'button', variant: 'primary', onClick: notice.dismiss }, t('close')),
        }, h('div', { role: 'alert' }, t(problem)))
      }
    }

    /** Take back (§8.3) and its refusal. */
    const manageNotice = requestNotice(API.managed, MANAGE_ERRORS, 'manageError.', 'manageFailed')
    const isManagedSession = (state, sessionId) => (state.managed ?? []).some((entry) => entry.sessionId === sessionId)
    /** Offered where the hand-over can run, once the Host lists managed sessions. */
    const canManage = (state, sessionId) => Array.isArray(state.managed) && canHandOver(state, sessionId)
    /**
     * The one entry's text and action: Hand over opens the note dialog; Take back takes the
     * session back at once, with no note (§8.3 keeps it a single click).
     */
    const handOverChoice = (state, sessionId, title) => isManagedSession(state, sessionId)
      ? { label: 'takeBack', run: () => void manageNotice.request({ sessionId, managed: false }) }
      : { label: 'handOver', run: () => handOverRequest.open(sessionId, title) }

    function makeHandOverMenuItem(t) {
      return function FishballHandOverMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
        const state = useFishball()
        const [, setMenuOpen] = useMenuOpenState()
        if (!canManage(state, sessionId)) return null
        const choice = handOverChoice(state, sessionId, displayTitle)
        return h(MenuItemButton, { onSelect: () => { setMenuOpen(false); void choice.run() } }, t(choice.label))
      }
    }

    /** Hand over / Take back, shared by the session header and the managed banner so they cannot drift. */
    const handOverButton = (t, state, sessionId) => {
      const choice = handOverChoice(state, sessionId, '')
      return h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => void choice.run() }, t(choice.label))
    }

    function makeHandOverHeaderAction(t) {
      return function FishballHandOverHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!canManage(state, sessionId)) return null
        return handOverButton(t, state, sessionId)
      }
    }

    /**
     * Whether a session shows the managed-session marks (item 30): it is managed, and Take back is
     * offered (canManage: the body is up, never Fishball's own session). The
     * user's answers hide both the banner and the sidebar icon whenever Take back would be hidden.
     */
    const showsManagedMarks = (state, sessionId) => canManage(state, sessionId) && isManagedSession(state, sessionId)

    /**
     * One managed row's mark, shared by the idle leading seat and the running trailing seat: the
     * Sidebar icon setting's fish, a green dot when this session has unread input for Fishball, or
     * a yellow dot when this session has a card or question waiting. Both dots are per row; yellow
     * wins when both apply. The fish is still while idle and moves while the row runs; the dots and
     * the accessible label carry the state, so reduced motion loses no information.
     */
    function ManagedMark({ state, sessionId, t, running }) {
      const needsYou = needsAction(state, sessionId)
      const hasUnread = unreadInput(state, sessionId)
      const dot = needsYou ? MANAGED_ROW.dot.action : hasUnread ? MANAGED_ROW.dot.unread : null
      const label = needsYou
        ? t('managedRowNeedsYou')
        : hasUnread
          ? t('managedRowUnread')
          : running ? t('managedRowRunning') : t('managedBanner')
      const Icon = brandIconOf(state)
      return h('span', {
        className: CLS.managedRow, role: 'img', 'aria-label': label, title: label,
        'data-fishball-managed-row': sessionId,
        'data-fishball-row-state': running ? MANAGED_ROW.state.running : MANAGED_ROW.state.idle,
      },
        h(Icon, { size: MANAGED_ROW.iconPx, unread: false, moving: running, badge: true }),
        dot === null ? null : h('span', { className: CLS.managedRowDot, 'data-fishball-dot': dot, 'aria-hidden': true }))
    }

    /**
     * The idle mark in a DSH session row's leading cell (DESIGN §10e item 30). DSH mounts this
     * seat only while the row is idle; its own spinner takes the cell otherwise, so the running
     * variant below uses the trailing seat. The seat gives only the row's sessionId, so the managed
     * list comes from the state stream every Fishball entry shares.
     */
    function makeManagedRowMark(t) {
      return function FishballManagedRowMark({ sessionId }) {
        const state = useFishball()
        if (!showsManagedMarks(state, sessionId)) return null
        return h(ManagedMark, { state, sessionId, t, running: false })
      }
    }

    /**
     * The running mark in a DSH session row's trailing seat (0.2.2's always-mounted seat). DSH's
     * own spinner stays in the leading cell; only the Fishball fish moves here, and only while this
     * row runs. An idle row renders nothing here, so it never shows two fish. rc.3 has no trailing
     * seat: slots.inject waits for the declaration and this entry never mounts (no error).
     */
    function makeManagedRowRunningMark(t) {
      return function FishballManagedRowRunningMark({ sessionId, useSessionStatus }) {
        const state = useFishball()
        if (!showsManagedMarks(state, sessionId)) return null
        // A child owns the hook, so an unmanaged row never subscribes to DSH's status source.
        return h(ManagedRowRunningMark, { state, sessionId, t, useSessionStatus })
      }
    }

    /** The running half of the trailing entry: hooks are unconditional, the null return is not. */
    function ManagedRowRunningMark({ state, sessionId, t, useSessionStatus }) {
      // The seat is always mounted, so the row's running state comes from DSH's global status
      // source; a selector keeps this mark from re-rendering on every other row's status change.
      const running = useSessionStatus((statuses) => statuses.get(sessionId)?.running === true)
      if (!running) return null
      return h(ManagedMark, { state, sessionId, t, running: true })
    }

    /** POST your answer on a card. @returns null when accepted, else the refusal's text. */
    async function answerCard(requestId, decision, note, t) {
      const { ok, code } = await send(API.requestsAnswer, { requestId, decision, ...(note ? { note } : {}) })
      if (ok) return null
      return t(CARD_ERRORS.has(code) ? 'cardError.' + code : 'cardFailed')
    }

    /**
     * One answer in flight at a time, shared by the pile's rows, its detail and the session's row:
     * busy while it runs, then the refusal's text, or null and onDone() once it was taken.
     */
    function useSubmit() {
      const [busy, setBusy] = React.useState(false)
      const [problem, setProblem] = React.useState(null)
      const run = async (submit, onDone) => {
        setBusy(true)
        const refusal = await submit()
        setBusy(false)
        setProblem(refusal)
        if (refusal === null) onDone?.()
      }
      return { busy, problem, run }
    }

    /** A small button on a card; every card control is one of these, disabled while an answer is in flight. */
    const cardButton = (t, busy, key, variant, onClick, label) => h(Button, { key, type: 'button', size: 'sm', variant, disabled: busy, onClick }, t(label))
    const problemLine = (problem) => (problem ? h('div', { role: 'alert' }, problem) : null)

    /** How long a reveal takes now: none when you asked for less motion (DESIGN §10e animation). */
    const revealMs = () => (window.matchMedia(MOTION_QUERY).matches ? PILE_LIST.revealMs : 0)

    /**
     * Shows or hides its children with a short open/close (DESIGN §10e animation, rev11-pile-list).
     * The box grows from no height to its own (a grid row from 0fr to 1fr) while it fades in, so the
     * entries around it reflow smoothly with it; closing runs the other way, and once closed nothing
     * is drawn, not even the box. A box mounted shown opens, so new entries arrive the same way.
     * The state is drawn as data-fishball-reveal (hidden, opening, open, closing); while not shown
     * the box is inert, so a closing entry can't be clicked or focused.
     */
    function Reveal({ shown, as = 'div', className, children, ...rest }) {
      const S = PILE_LIST.reveal
      const ref = React.useRef(null)
      const [state, setState] = React.useState(S.hidden)
      React.useLayoutEffect(() => {
        if (ref.current) ref.current.inert = !shown
        const target = shown ? S.open : S.hidden
        if (state === target) return undefined
        const ms = revealMs()
        if (ms === 0) {
          setState(target)
          return undefined
        }
        const moving = shown ? S.opening : S.closing
        if (state !== moving) {
          // Lay the current size out before the change, so the browser has a size to move from.
          void ref.current?.offsetHeight
          setState(moving)
          return undefined
        }
        const timer = setTimeout(() => setState(target), ms)
        return () => clearTimeout(timer)
      }, [shown, state])
      if (state === S.hidden && !shown) return null
      return h(as, { ref, className: className ? `${CLS.reveal} ${className}` : CLS.reveal, 'data-fishball-reveal': state, 'aria-hidden': shown ? undefined : true, ...rest },
        h('div', { className: CLS.revealInner }, children))
    }

    /**
     * Allow once / Reject on one card, the same in your pile's detail and on the session's running
     * row (item 15). Both read the card from the Host's snapshot, so an answer in either place clears
     * both. Reject first opens an optional note to the agent (DESIGN §10e).
     * @param onDone - optional, called once your answer was taken (the pile's detail goes back to its list).
     */
    function CardAnswer({ requestId, t, onDone }) {
      const id = React.useId()
      const { busy, problem, run } = useSubmit()
      const [rejecting, setRejecting] = React.useState(false)
      const [note, setNote] = React.useState('')
      const answer = (decision) => run(() => answerCard(requestId, decision, decision === CARD_DECISION.reject ? note.trim() : '', t), onDone)
      const button = (key, variant, onClick, label) => cardButton(t, busy, key, variant, onClick, label)
      return h('div', { className: CLS.grow, 'data-fishball-card-answer': requestId },
        h(Reveal, { shown: rejecting }, h('div', { className: CLS.field },
          h('label', { htmlFor: id, className: CLS.muted }, t('rejectNote')),
          h(Input, { id, value: note, onChange: (event) => setNote(event.target.value) }))),
        h('div', { className: CLS.actions },
          button('allow', 'primary', () => void answer(CARD_DECISION.allow), 'allowOnce'),
          rejecting ? button('send', 'secondary', () => void answer(CARD_DECISION.reject), 'rejectSend') : button('reject', 'secondary', () => setRejecting(true), 'reject'),
          rejecting ? button('cancel', 'ghost', () => { setRejecting(false); setNote('') }, 'cancel') : null),
        problemLine(problem))
    }

    /** A labelled line of text from another session or from Fishball (plain text, never markup: §10c framing rule). */
    const labelled = (label, text) => h('div', null, h('span', { className: CLS.muted }, label + ': '), text)

    /**
     * Who answers managed sessions' questions (item 25, §10e): Auto, Fishball or You. It is a field
     * of DSH's staged form of the row (C2), so a choice is staged like a limit and saved with the
     * form's Save; the row's schema refuses anything outside QUESTION_VIEW.modes.
     */
    function QuestionMode({ value, disabled, onChoose, t }) {
      const mode = value.text
      return h('div', { 'data-fishball-question-mode': mode },
        h('h4', null, t('questionMode')),
        h('p', { className: CLS.muted }, t('questionModeHint')),
        h('div', { className: CLS.actions, role: 'radiogroup', 'aria-label': t('questionMode') }, QUESTION_VIEW.modes.map((option) => h(Button, {
          key: option, type: 'button', size: 'sm', variant: option === mode ? 'primary' : 'secondary', role: 'radio', 'aria-checked': option === mode, disabled,
          onClick: () => { if (option !== mode) onChoose(option) },
        }, t('questionMode.' + option)))),
        QUESTION_VIEW.modes.includes(mode) ? h('p', { className: CLS.muted }, t('questionModeHint.' + mode)) : null)
    }

    /** POST your Revoke. @returns null when accepted, else the refusal's text. */
    async function revokeGrant(grantId, t) {
      const { ok, code } = await send(API.grantsRevoke, { grantId })
      if (ok) return null
      return t(GRANT_ERRORS.has(code) ? 'grantError.' + code : 'cardFailed')
    }

    /** An ask_fishball call's arguments: a started block keeps them in argsRaw, a settled one on its call (S37). */
    function askArguments(block) {
      try {
        const value = JSON.parse(block?.argsRaw ?? block?.call?.argsRaw ?? '{}')
        return value !== null && typeof value === 'object' ? value : {}
      } catch { return {} }
    }

    /** A settled call's answer: the JSON ask_fishball returned ({ value }), or its text ({ text }), e.g. an aborted call. */
    function askResult(block) {
      const content = block?.content ?? block?.result?.content
      const text = Array.isArray(content) ? content.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('') : ''
      try {
        const value = JSON.parse(text)
        if (value !== null && typeof value === 'object' && typeof value.code === 'string') return { value }
      } catch { /* not ask_fishball's JSON: shown as text */ }
      return { text }
    }

    /**
     * The running ask_fishball row in the asking session (DESIGN §10e, S37). DSH has no view for this
     * tool, so this entry is the whole row: what is asked, whether it waits for Fishball or for you,
     * and Allow once / Reject once the request is your card (Reading: not while Fishball decides).
     */
    /**
     * The card record's definition and view live in the package-local chunk client.records.js (the
     * connector's `./records` export, design §0.2), so the instance's chat can register the same
     * module (I7). The chunk loads once, after the page's first render; a record that arrives
     * meanwhile is matched when the definition registers, as DSH replays the session's records.
     */
    const RECORDS_CHUNK = './client.records.js'

    function makeAskRow(t) {
      return function FishballAskRow({ callId, phase, block }) {
        const state = useFishball()
        const args = askArguments(block)
        const card = phase === ASK_ROW.phaseStart ? (state.pile ?? []).find((entry) => entry.callId === callId) : undefined
        const replying = typeof args.request_id === 'string'
        const result = phase === ASK_ROW.phaseResult ? askResult(block) : null
        const code = result?.value?.code
        return h('div', { className: CLS.askRow, 'data-fishball-ask-row': callId, 'data-fishball-phase': phase },
          h('div', { className: CLS.cardHead },
            h('span', { className: CLS.title }, t(replying ? 'askRowReply' : 'askRowTitle')),
            typeof args.tool === 'string' ? h('span', { className: CLS.code }, args.tool) : null,
            phase === ASK_ROW.phaseStart ? h(Tag, { tone: card ? 'danger' : 'info' }, t(card ? 'askRowWaitingYou' : 'askRowWaitingFishball')) : null,
            code !== undefined ? h(Tag, { tone: 'neutral' }, ASK_CODES.has(code) ? t('askResult.' + code) : code) : null),
          args.arguments !== undefined ? h('pre', { className: CLS.pre }, JSON.stringify(args.arguments, null, JSON_INDENT)) : null,
          typeof args.why === 'string' && args.why ? labelled(t('cardReason'), args.why) : null,
          replying && typeof args.reply === 'string' ? h('div', null, args.reply) : null,
          // Fishball's reject reason carries the pile card's Fishball label; your own Reject note, and a
          // row from before reason_from, keep Reason (rev11-ui-fixes R3).
          typeof result?.value?.reason === 'string' ? labelled(t(result.value.reason_from === REASON_FROM_FISHBALL ? 'cardFishballNote' : 'cardReason'), result.value.reason) : null,
          typeof result?.value?.question === 'string' ? labelled(t('cardFishballNote'), result.value.question) : null,
          result?.text ? h('div', { className: CLS.muted }, result.text) : null,
          card ? h(CardAnswer, { requestId: card.requestId, t }) : null)
      }
    }

    /** Every field of DSH's form of the row: the limits, then the question mode (src/config.js). */
    const FORM_FIELDS = Object.freeze([...LIMIT_FIELDS, QUESTION_VIEW.field])

    /**
     * DSH's staged form over the row's live config; Save writes through ctx.settings. The field set
     * is LIMIT_FIELDS as it stands: C2 (feat/c2) owns it and trims it to conn-OQ-20's set with
     * questionMode as a form field, so C3 leaves it, the question-mode buttons and the brand/sidebar
     * switches as they are; on a merge, C2's side of these lines wins.
     */
    function limitsSection(scope) {
      const form = new SettingsFormModel(scope, [...LIMIT_FIELDS.map((field) => settingsNumberField(field)), settingsTextField(QUESTION_VIEW.field)])
      const store = form.bind(() => ({ ...form.shell(), fields: Object.fromEntries(FORM_FIELDS.map((field) => [field, form.field(field)])) }))
      return { store, actions: form.actions(), dispose: () => form.dispose() }
    }

    /**
     * The connector's Plugins card (the `plugins.bundle.config` slot of fishball-connector): its
     * limits form and question mode, edited only here (D24), and "Open instance settings" below them
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
          }, h('div', { key: QUESTION_VIEW.field, className: CLS.section }, h(QuestionMode, {
            value: state.fields[QUESTION_VIEW.field], disabled, t,
            onChoose: (mode) => section.actions.edit(QUESTION_VIEW.field, mode),
          })), LIMIT_FIELDS.map((field) => {
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

    exports.name = PACKAGE_NAME
    exports.inject = ['slots', 'locale', 'configForms']
    exports.apply = function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'fishball: dictionaries')
      ctx.effect(mountStyles, 'fishball: styles')
      const BrandName = makeBrandName(ctx, t)
      ctx.effect(() => ctx.slots.inject(SLOT.mark, () => ctx.slots.inject(SLOT.name, function* () {
        yield ctx.slots.register({ name: SLOT.mark, priority: BRAND_PRIORITY }, makeMark(t))
        yield ctx.slots.register({ name: SLOT.name, priority: BRAND_PRIORITY }, BrandName)
      })), 'fishball: brand')
      // Hand over / Take back on an ordinary session's header and row menu (§8.3).
      ctx.effect(() => ctx.slots.inject(SLOT.headerActions, () => ctx.slots.register({ name: SLOT.headerActions, id: HAND_OVER.id, order: HAND_OVER.headerOrder, locale: NS }, makeHandOverHeaderAction(t))), 'fishball: hand-over header action')
      ctx.effect(() => ctx.slots.inject(SLOT.sessionMenu, function* () {
        yield ctx.slots.register({ name: SLOT.sessionMenu, id: HAND_OVER.id, order: HAND_OVER.menuOrder, locale: NS }, makeHandOverMenuItem(t))
      }), 'fishball: session menu')
      ctx.effect(() => ctx.slots.inject(SLOT.overlay, function* () {
        yield ctx.slots.register({ name: SLOT.overlay, id: HAND_OVER.id, locale: NS }, makeHandOverDialog(t))
        yield ctx.slots.register({ name: SLOT.overlay, id: HAND_OVER.noticeId, locale: NS }, makeRequestNotice(t, manageNotice, 'manageTitle'))
      }), 'fishball: dialogs')
      // The Fishball view in DSH's main area, as Plugins and Tasks register theirs (§7). The key is
      // registered for the plugin's life, so the brand button opens it even without the row.
      ctx.effect(() => ctx.slots.inject(SLOT.main, () => ctx.slots.register({ name: SLOT.main, key: EMBED_UI.panelId, locale: NS }, makeFishballView(ctx, t))), 'fishball: main view')
      ctx.effect(() => followSidebarEntry(ctx, makeMark(t), t), 'fishball: sidebar row')
      // The managed-session marks (§8.2) and the ask_fishball row with your Allow once / Reject (S37).
      ctx.effect(() => ctx.slots.inject(SLOT.rowLeading, () => ctx.slots.register({ name: SLOT.rowLeading, id: MANAGED_ROW.id, locale: NS }, makeManagedRowMark(t))), 'fishball: managed row mark')
      // 0.2.2 keeps a row's trailing seat mounted while it runs; rc.3 has no such seat and this waits.
      ctx.effect(() => ctx.slots.inject(SLOT.rowTrailing, () => ctx.slots.register({ name: SLOT.rowTrailing, id: MANAGED_ROW.id, locale: NS }, makeManagedRowRunningMark(t))), 'fishball: managed row running mark')
      ctx.effect(() => ctx.slots.inject(SLOT.toolview, () => ctx.slots.register({ name: SLOT.toolview, key: ASK_ROW.tool, locale: NS }, makeAskRow(t))), 'fishball: ask_fishball row')
      // Card records in any DSH session view (client.records.js). The uiConversation service is read
      // on demand, so an older DSH without it keeps working. A failed chunk load loses only the
      // record rows, never the rest of the client.
      void require.async(RECORDS_CHUNK).then(({ CARD_RECORD, cardRecordDefinition, makeCardRecordView }) => {
        if (ctx.fiber?.uid === null) return
        ctx.inject(['uiConversation'], (scope) => {
          scope.effect(() => scope.uiConversation.events.register(cardRecordDefinition), 'fishball: card record definition')
        })
        const CardRecord = makeCardRecordView({ t, labelled, classes: { muted: CLS.muted, recordBody: CLS.recordBody, pre: CLS.pre } })
        ctx.effect(() => ctx.slots.inject(SLOT.chatNode, () => ctx.slots.register({ name: SLOT.chatNode, key: CARD_RECORD.node, locale: NS }, CardRecord)), 'fishball: card record row')
      }, (error) => { ctx.logger?.warn?.('fishball: card records unavailable', error) })
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