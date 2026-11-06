/**
 * Fishball browser half (DESIGN §10).
 *
 * 1. Brand: fills sidebar.brand.mark / sidebar.brand.name at slot priority -1 (a single
 *    slot renders its LOWEST priority; the shipped brand uses 0 — spike S14). The name
 *    occupant takes over its enclosing button's click (capture phase, so it runs before
 *    the shell's New Session handler) and opens the Fishball view (item 3). On macOS Desktop
 *    the brand row is a drag region without a button; there Fishball opens from its
 *    sidebar row.
 * 2. The Plugins → Fishball settings page is the isolated Fishball's console (§9): its
 *    status and restart, model, plugins and settings through the owner-only admin routes
 *    (src/slim/host/settings-routes.js), the brand switches, the question mode and Fishball's
 *    own limits.
 * 3. The Fishball view (slim §7): the isolated Fishball's page framed in DSH's main area, the
 *    `main` slot where a session's conversation shows, opened by the brand and by a Fishball row
 *    in the sidebar's panel list (on by default; Settings can leave only the brand).
 * 4. The body's marks on ordinary sessions (§8.2, §8.3): Hand over / Take back in the header and
 *    row menu, the managed-session fish and dots on the row, and the ask_fishball row with your
 *    Allow once / Reject once the request is yours.
 * The in-process Fishball's own surfaces (its chat dock, pile, welcome card, model gate, the
 * Plugins page's Fishball tab and install dialog, the Messenger look) were removed with it.
 *
 * The mark is FishMark from the owner's fishball app (assets/icon.svg, THIRD_PARTY_NOTICES).
 *
 * State comes from GET /api/fishball/events (server-sent snapshots).
 */
window.__ModuleLoader__.load({
  id: 'dsh-fishball',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const {  } = require('react-dom')
    const { BrandWordmark, Button, DisclosureRow, FISH_LOGO_PATH, FISH_LOGO_VIEWBOX, IconQuestionOutlineRegular, IconShieldOutlineRegular, IconWarningOutlineRegular, Input, MenuItemButton, Modal, PluginArtworkSearch, PluginArtworkTerminal, SettingsForm, SettingsFormModel, SettingsSecretField, SettingsValueField, Switch, Tag, settingsNumberField } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const PACKAGE_NAME = 'dsh-fishball'
    /** Host row id; also the settings namespace configForms serves (cordis.patch.yml). */
    const ENTRY_ID = 'fishball'
    const NS = 'fishball'
    const BRAND_PRIORITY = -1
    /** Client services read on demand (not injected: Fishball works without each of them). */
    const SERVICE = Object.freeze({ layout: 'layout' })
    const SUMMARY_VIEW = 'summary'
    /** Host statuses (src/constants.js STATUS) the page compares against. */
    const STATUS = Object.freeze({ starting: 'starting', live: 'live' })
    /** Fishball's own feature plugins in the snapshot's `features` (src/builtins.js FEATURE_KEY; revision 10c). */
    /** Whether a feature runs; a Host without the field (older) shows everything, as before. */
    const API = Object.freeze({ events: 'api/fishball/events', send: 'api/fishball/send', brand: 'api/fishball/brand', sidebarEntry: 'api/fishball/sidebar-entry', managed: 'api/fishball/managed', requestsAnswer: 'api/fishball/requests/answer', grantsRevoke: 'api/fishball/grants/revoke', questionsAnswer: 'api/fishball/questions/answer', questionMode: 'api/fishball/question-mode' })
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
     * The Fishball view (§7): the child page framed in DSH's main area, as a global panel.
     * `document` is the fixed embed path: no query, fragment or token (keep in step with contract
     * ROUTES.document). `panelId` is one key shared by the `main` occupant and its
     * `sidebar.panellist` row, as DSH's Plugins ("plugins") and Tasks ("schedules") panels do.
     * `panelOrder` puts the row first, before Plugins (0) and Tasks (10): Fishball is the
     * conversation you open most, so it sits where a pinned session would. `warningIconPx` is the
     * glyph of DSH's own empty/error state (dsh-client-ui-schedule's list error, 24px).
     * `stateTone` maps the child state to DSH's Tag tones (the ones its plugin page uses).
     */
    const EMBED_UI = Object.freeze({
      document: '/fishball/embed/', panelId: 'fishball', panelOrder: -10, warningIconPx: 24,
      stateTone: Object.freeze({ ready: 'info', failed: 'danger' }), neutralTone: 'neutral',
      // noopener, but not noreferrer: the broker admits only Sec-Fetch-Site: same-origin.
      target: '_blank', features: 'noopener',
      retry: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin' }),
    })
    /**
     * DSH's session header (dsh-client-ui-conversation ConversationRoot .header/.titleRow/
     * .crumbCurrent, identical in 0.2.1-rc.5 and 0.2.2-rc.1), without its tab row: the Fishball
     * view has one page, so the header is one line of DSH's title-row height plus padding.
     */
    const DSH_SESSION_HEADER = Object.freeze({ minHeight: '52px', padding: '10px 28px', startPadding: '20px', gap: '8px', nameFont: '14px', nameLine: '20px' })
    /** DSH's empty/error state (dsh-client-ui-schedule TaskManagerPage .empty, .emptyAction). */
    const DSH_EMPTY_STATE = Object.freeze({ padding: '48px 20px', gap: '8px', font: '14px', actionGap: '8px' })
    const NATIVE_UI = Object.freeze({
      statusPath: '/api/fishball/native/status',
      states: Object.freeze(['disabled', 'waiting', 'starting', 'ready', 'stopping', 'stopped', 'failed']),
      codes: Object.freeze(['NATIVE_START_FAILED', 'NATIVE_STOP_FAILED', 'NATIVE_CHILD_EXITED', 'NATIVE_UNAVAILABLE', 'NATIVE_TIMEOUT', 'NATIVE_DISABLED']),
      ready: 'ready', unavailable: 'unavailable', loading: 'loading',
      request: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      /**
       * How often the open Fishball view re-reads statusPath (B8). Nothing pushes the lifecycle
       * state: the main row's event stream carries no native state, and the child's own stream
       * lives inside the iframe. One small GET per interval, only while the view is mounted and
       * the tab visible, keeps the bar's state within a few seconds of a child exit.
       */
      pollMs: 5000,
    })
    /** Fishball's explicit model choice is independent of the host's last-used/default route. */
    const MODEL = Object.freeze({
      settingsClass: 'fb-model-settings', gateClass: 'fb-model-gate', empty: '',
    })
    /** Context-window refusals with their own text (keep in step with src/constants.js CONTEXT_ERROR). */
    /** Host tool statuses (src/constants.js TOOL_STATUS) shown as tags, and the plugin kinds. */
    const TOOL_STATUS = Object.freeze({ visible: 'visible', hidden: 'hidden', pluginOff: 'plugin-off', unchecked: 'unchecked', otherSessions: 'other-sessions' })
    /**
     * Plugin actions the Host offers per plugin (src/constants.js PLUGIN_OFFER). The Host decides
     * which actions a plugin has; the page shows only those.
     */
    const PLUGIN_OFFER = Object.freeze({ enable: 'enable', disable: 'disable', uninstall: 'uninstall' })
    /** Brand icon choices (src/constants.js BRAND_STYLE). */
    const BRAND_STYLE = Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' })
    /** Where the sidebar opens the Fishball view (src/constants.js SIDEBAR_ENTRY): its own row, or the brand only. */
    const SIDEBAR_ENTRY = Object.freeze({ panel: 'panel', brand: 'brand' })
    const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' })
    /**
     * The child admin routes (§9; src/slim/host/settings-routes.js). One exact path per admin
     * operation; every request is POST with that operation's payload, and every answer is
     * {ok:true,result} or {ok:false,error:{code}}. The slugs must match the route module.
     */
    const ADMIN_UI = Object.freeze({
      prefix: '/api/fishball/native/admin/',
      path: Object.freeze({
        status: 'status', restart: 'restart',
        modelGet: 'model/get', modelSet: 'model/set',
        pluginsGet: 'plugins/get', pluginInstall: 'plugin/install', pluginRemove: 'plugin/remove',
        pluginEnable: 'plugin/enable', pluginDisable: 'plugin/disable',
        settingsGet: 'settings/get', settingsMutate: 'settings/mutate',
      }),
      request: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: JSON_HEADERS }),
      /** Admin refusal codes with their own words; any other code is shown with the code itself. */
      errors: Object.freeze(['stale-revision', 'unavailable', 'timeout', 'disconnected', 'invalid-payload', 'read-only', 'unknown-namespace', 'unknown-provider', 'unknown-model', 'invalid-reasoning-effort', 'model-unavailable', 'unknown-plugin', 'invalid-spec', 'already-installed', 'not-removable', 'build-blocked', 'plugin-failed', 'too-large', 'operation-failed']),
    })
    /**
     * T16's provider sync (§10; src/slim/host/provider-sync-routes.js). "Refresh models" POSTs
     * this one path with no body, then reloads the child's model list. The answer is
     * {ok:true,result:{items:[{id,name,outcome,reason?}]}} or {ok:false,error:{code}}: provider
     * names and reason codes only, never a key, a mask or an endpoint.
     */
    const CHILD_SYNC_UI = Object.freeze({
      path: '/api/fishball/native/provider-sync/sync',
      request: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin' }),
      outcome: Object.freeze({ added: 'added', present: 'present', skipped: 'skipped', failed: 'failed' }),
      /** The outcomes the details list names, in order: what needs attention first. */
      detailOutcomes: Object.freeze(['failed', 'skipped']),
      summarySeparator: ' · ',
      /** Item reasons with their own words (src/provider-sync.js, src/provider-sync-service.js); any other shows the generic one. */
      reasons: Object.freeze(['oauth-login', 'unsupported-provider', 'provider-conflict', 'incompatible-owner-or-schema',
        'no-api-key', 'version-mismatch', 'credential-not-writable', 'missing-revision', 'repreview-required',
        'result-unknown', 'key-not-saved', 'unsupported-record']),
      /** Whole-sync refusals with their own words; any other shows the generic one with its code. */
      errors: Object.freeze({ 'child-sync-unavailable': 'unavailable', 'child-sync-disconnected': 'unavailable',
        'target-unavailable': 'unavailable', 'child-sync-timeout': 'timeout',
        'repreview-required': 'changed', 'peer-mismatch': 'changed' }),
      failed: 'provider-sync-refused',
    })
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
     * DSH's composer layout variables (dsh-client-ui-conversation, rc.2), read so a dock entry
     * takes DSH's own width and spacing. The composer stack is a column whose gap
     * (--dsh-composer-stack-gap) spaces its docks. DSH's Todo dock is a free-standing card
     * `width: calc(100% - 2 × side clearance - 4 × dock inset)`, max-width the composer card's
     * minus 4 dock insets, `margin: 0 auto`; the Queue dock's visible panel comes out the same
     * width (its box is 2 insets narrower and padded by an inset on each side).
     */
    const DSH_COMPOSER = Object.freeze({ sideClearance: 'var(--dsh-composer-side-clearance)', dockInset: 'var(--dsh-composer-dock-inset)', cardMaxWidth: 'var(--dsh-composer-card-max-width)', sideClearances: 2, dockInsets: 4, cardInsets: 0 })
    /** `n` copies of a CSS length, subtracted inside a calc(). */
    const minusTimes = (length, n) => ` - ${length}`.repeat(n)
    /** A dock card's surface (the managed banner's look, shared with the welcome card). */
    const DOCK_CARD_LOOK = 'border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);line-height:1.5'
    const dockCardWidth = (insets) => `box-sizing:border-box;flex:none;width:calc(100%${minusTimes(DSH_COMPOSER.sideClearance, DSH_COMPOSER.sideClearances)}${minusTimes(DSH_COMPOSER.dockInset, insets)});max-width:calc(${DSH_COMPOSER.cardMaxWidth}${minusTimes(DSH_COMPOSER.dockInset, insets)});margin:0 auto`
    const DOCK_CARD_WIDTH = dockCardWidth(DSH_COMPOSER.dockInsets)
    /** Recommended plugins on the settings page (DESIGN §10f). States as src/recommended.js RECOMMENDED_STATE. Sizes in px. */
    const RECOMMENDED = Object.freeze({
      rowGapPx: 12, rowPaddingYPx: 6, categoryGapPx: 8,
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
     * Questions and plan reviews (rev11g, §7a.10; src/constants.js QUESTION_KIND, QUESTION_MODE,
     * QUESTION_ERROR): their cards share the pile, the mode is set on the settings page.
     */
    const QUESTION_VIEW = Object.freeze({ question: 'question', planReview: 'plan-review', modes: Object.freeze(['auto', 'fishball', 'user']) })
    const QUESTION_ERRORS = new Set(['expired', 'bad-answer', 'already-settled', 'session-not-live', 'unavailable'])
    const GRANT_ERRORS = new Set(['unknown', 'ended', 'unavailable'])
    const JSON_INDENT = 2
    /**
     * The plugin manager (DESIGN §10d): the Fishball tab, laid out like DSH's Installed tab and
     * plugin page (owner's choice: list version 1, page A), and the tag and switch on DSH's own
     * page for each plugin. It changes Fishball's side only; DSH's side is shown, never changed.
     */
    const MANAGER = Object.freeze({
      artSize: 36,
      listMinRows: 2,
    })
    /**
     * How the settings form draws each schema field (DESIGN §10d "The form"); anything else is
     * shown read-only. The form reads the Host's `schema.toJSON()` envelope ({ uid, refs }).
     */
    const FIELD_KIND = Object.freeze({ text: 'text', number: 'number', switch: 'switch', choice: 'choice', list: 'list', secret: 'secret', readOnly: 'read-only' })
    const SCHEMA = Object.freeze({ object: 'object', intersect: 'intersect', string: 'string', number: 'number', boolean: 'boolean', union: 'union', constant: 'const', array: 'array', secretRole: 'secret' })
    const LIST_SEPARATOR = '\n'
    /**
     * The limit fields, in the order the Host declares them (src/config.js LIMITS). The
     * form model needs its fields before the first state frame arrives, so the browser keeps
     * this list; the Host schema still decides validity on save.
     */
    const LIMIT_FIELDS = Object.freeze(['maxQueuedInputs', 'maxActiveWatches', 'maxSourcesPerPlugin', 'maxFishballOnlyPlugins', 'wakeupsPerHour', 'messagesPerHour', 'sessionsPerHour', 'maxPendingApprovals', 'approvalAnswerSeconds', 'argumentExcerptBytes', 'maxMessageBytes', 'auditEntriesKept', 'requestUserMessageBytes', 'rationaleChars', 'approvalsShown', 'intakeRowsShown', 'outboxShown', 'watchesShown', 'readSessionMessages', 'readSessionBytes', 'forwardExcerptBytes', 'pluginHistoryShown', 'settingsPromptValueBytes', 'replyCapShare', 'headroomShare', 'minWindowTokens', 'pluginManagerStartMs', 'defaultReplyCapTokens', 'userMessagesListed', 'userMessageExcerptChars', 'pileMaxHeightVh'])
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
     * The §8.5 button style: DSH's Button with its normal (secondary) background and text plus
     * one class whose only rule is the magenta ring. The old filled magenta constants
     * (FISHBALL_COLOUR) are gone; the ring mixes the accent with the current surface, so light
     * and dark themes both work and DSH keeps its own hover, active and focus-visible states.
     * 0.2.2-rc.1's Button has no `secondary` variant class; the base variant is the normal
     * transparent background and label colour, so this is the intended look either way.
     */
    const ACCENT_BUTTON = Object.freeze({ variant: 'secondary', className: 'fb-outline' })
    /**
     * The knob of Fishball's switches: white, with the fish mark in magenta (its eye white), drawn as
     * a background image so DSH's own Switch is reused as it is.
     */
    const FISHBALL_SWITCH = Object.freeze({
      knob: '#fff',
      fishSize: '11px',
      fish: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${FISH_MARK.viewBox}'><path d='${FISH_MARK.body}' fill='${FISH_MARK.eyeColor}'/><path d='${FISH_MARK.eye}' fill='#fff'/></svg>`)}")`,
    })
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
    /** The plugin manager's classes (styles below); `fbp-` keeps them apart from the settings page's. */
    const MCLS = Object.freeze({
      panel: 'fbp-panel', bar: 'fbp-bar', group: 'fbp-group', groupTitle: 'fbp-group-title', cards: 'fbp-cards', card: 'fbp-card', cardHead: 'fbp-card-head',
      icon: 'fbp-icon', main: 'fbp-main', titleRow: 'fbp-title-row', title: 'fbp-title', desc: 'fbp-desc', tag: 'fbp-tag', crumb: 'fbp-crumb',
      detailHead: 'fbp-detail-head', detailMain: 'fbp-detail-main', detailTitle: 'fbp-detail-title', detailName: 'fbp-detail-name',
      detailDesc: 'fbp-detail-desc', detailActions: 'fbp-detail-actions', sections: 'fbp-sections', section: 'fbp-section', sectionTitle: 'fbp-section-title',
      detail: 'fbp-detail', detailTop: 'fbp-detail-top', detailSection: 'fbp-detail-section', sectionHead: 'fbp-section-head', sectionCount: 'fbp-section-count',
      facts: 'fbp-facts', rows: 'fbp-rows', row: 'fbp-row', link: 'fbp-link', field: 'fbp-field', fieldHead: 'fbp-field-head', hint: 'fbp-hint',
      input: 'fbp-input', readOnly: 'fbp-read-only', formActions: 'fbp-form-actions', fields: 'fbp-fields', label: 'fbp-label', reset: 'fbp-reset',
      accent: 'fbp-accent', headerActions: 'fbp-header-actions', addButton: 'fbp-add-button', iconButton: 'fbp-icon-button', spin: 'fbp-spin', menuIcon: 'fbp-menu-icon', copy: 'fbp-copy', copyDesc: 'fbp-copy-desc', dialog: 'fbp-dialog', subject: 'fbp-subject', trust: 'fbp-trust', log: 'fbp-log',
    })
    const CLS = Object.freeze({ cardHead: 'fb-card-head', title: 'fb-title', pre: 'fb-pre', actions: 'fb-actions', askRow: 'fb-ask-row', field: 'fb-field', note: 'fb-note', entries: 'fb-entries', section: 'fb-section', row: 'fb-row', label: 'fb-label', code: 'fb-code', name: 'fb-name', tag: 'fb-tag', mark: 'fb-mark', markBox: 'fb-mark-box', swim: 'fb-swim', badge: 'fb-badge', wag: 'fb-wag', grow: 'fb-grow', muted: 'fb-muted', recordBody: 'fb-record-body', managedRow: 'fb-managed-row', managedRowDot: 'fb-managed-row-dot', flip: 'fb-flip', reveal: 'fb-reveal', revealInner: 'fb-reveal-inner', recCategory: 'fb-rec-category', recRow: 'fb-rec-row', recDesc: 'fb-rec-desc', embed: 'fb-embed', embedBar: 'fb-embed-bar', embedName: 'fb-embed-name', embedActions: 'fb-embed-actions', embedFrame: 'fb-embed-frame', embedError: 'fb-embed-error', embedGlyph: 'fb-embed-glyph' })

    const en = {
      brandName: 'FISHBALL',
      brandTag: 'Deepseek Harness',
      brandLabel: 'Open Fishball',
      brandLabelUnread: 'Open Fishball, {count} unread',
      unreadMany: '{max}+',
      brandStyle: 'Sidebar icon',
      brandStyleHint: 'Fishball\'s own mark and word logo, or the DeepSeek orca and DeepSeek\'s word logo. A new message shows the number either way; Fishball\'s fish wags, and the orca swims as it does when you hover it in a new session.',
      brandStyleDeepseek: 'Use the DeepSeek icon',
      sidebarEntry: 'Sidebar entry',
      sidebarEntryHint: 'Fishball opens in the main area, as a session does. With this on, the sidebar has a Fishball row above Plugins; with it off, only the top-left Fishball button opens it. On macOS Desktop the top-left button cannot be clicked, so keep the row there.',
      sidebarEntryPanel: 'Show Fishball as a row in the sidebar',
      limits: 'Safety limits',
      modelLoading: 'Loading models…',
      modelEffort: 'Reasoning effort',
      modelEffortDefault: 'Model default',
      modelEmpty: 'No models available. Configure a provider in DSH model settings, then refresh.',
      nativeTitle: 'Isolated Fishball', nativeRefresh: 'Refresh status',
      nativeHint: 'The isolated Fishball runs beside DSH in its own home. Its chat opens in DSH\'s main area, as a session does; the model, plugins and settings below are its own.',
      viewTitle: 'Fishball', embedTitle: 'Fishball chat', embedRefresh: 'Refresh', embedOpenTab: 'Open in a tab',
      embedUnavailable: 'Fishball is not available. Retry starts it again.', embedRetry: 'Retry',
      embedState: 'State', embedCode: 'Code',
      'native.loading': 'Checking status…', 'native.disabled': 'Disabled', 'native.waiting': 'Waiting for host readiness',
      'native.starting': 'Starting', 'native.ready': 'Ready', 'native.stopping': 'Stopping', 'native.stopped': 'Stopped',
      'native.failed': 'Native runtime failed', 'native.unavailable': 'Unavailable or not enabled in this profile',
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
      plugins: 'Plugins for Fishball',
      uninstall: 'Uninstall',
      installSpecLabel: 'Package',
      install: 'Install',
      installPlaceholder: 'package-name, package-name@1.2.0, a Git address, or /absolute/path',
      pending: 'Applies after this turn',
      waiting: 'Starting…',
      changeFailed: 'That change was not accepted.',
      refresh: 'Refresh',
      'recommendedCategory.context': 'Context management',
      'recommendedCategory.memory': 'Memory',
      'recommendedCategory.channel': 'Channel',
      'recommendedCategory.pet': 'Pet',
      recommendedInstallLabel: 'Install {name} for Fishball',
      'recommendedState.installed': 'Installed',
      'recommendedDesc.dsh-idle-compact': 'Prepares a compaction while you are idle, before the model cache expires, and applies it without a new model call.',
      'recommendedDesc.dsh-plugin-save-token': 'Cuts token cost by compressing tool output losslessly and spilling large results to disk.',
      'recommendedDesc.smart-compaction': 'Lets the model compact at a safe point and check its real token use.',
      'recommendedDesc.meow-memory': 'Local memory across sessions in SQLite, with remember and search tools and automatic reflection.',
      'recommendedDesc.@a9i5k4/dsh-auto-memory': 'Recalls before the model answers and consolidates what it learns over time.',
      'recommendedDesc.@zilliz/memsearch-dsh': 'Markdown memory shared with other coding agents, with search-based recall. Needs the memsearch tool.',
      'recommendedDesc.@michengai/dsh-im-connect': 'Talk to DSH from WeChat, WeCom, DingTalk, Feishu, Lark, QQ and Telegram.',
      'recommendedDesc.dsh-telegram-notify': 'Sends turn ends, questions and permission requests to a Telegram chat (one way).',
      'recommendedDesc.dsh-plugin-discord': 'Drive a session from Discord. Needs a Discord bot token and your user id in its allow list.',
      'recommendedDesc.dsh-dingtalk-channel': 'DingTalk Stream-mode bot: each chat drives its own agent. Needs a DingTalk client id and secret.',
      settingsChanged: 'Changed',
      settingsReset: 'Reset',
      settingsResetAll: 'Reset all',
      settingsInvalid: 'This value is not accepted.',
      settingsReadOnly: 'Shown only: this kind of setting cannot be changed here.',
      settingsListHint: 'One per line.',
      secretSet: 'Set',
      secretUnset: 'Not set',
      secretHint: 'Type a new value to replace it. It is never shown, and Fishball cannot see it.',
      secretClear: 'Clear',
      resetField: 'Reset {name}',
      clearField: 'Clear {name}',
      'field.maxQueuedInputs': 'Queued inputs not yet read',
      'field.maxActiveWatches': 'Active "tell me when finished" watches',
      'field.maxSourcesPerPlugin': 'Feeds per plugin',
      'field.maxFishballOnlyPlugins': 'Plugins running only for Fishball',
      'field.wakeupsPerHour': 'Wake-ups per hour from non-user inputs (0 = no cap)',
      'field.messagesPerHour': 'Messages Fishball sends per hour (0 = no cap)',
      'field.sessionsPerHour': 'Sessions Fishball starts per hour (0 = no cap)',
      'field.maxPendingApprovals': 'Permission requests open at once (waiting for Fishball or in your pile)',
      'field.approvalAnswerSeconds': 'Seconds Fishball has to answer a request',
      'field.argumentExcerptBytes': 'Bytes of a request\'s command Fishball sees',
      'field.maxMessageBytes': 'Bytes in one message',
      'field.auditEntriesKept': 'Entries kept in each audit list',
      'field.requestUserMessageBytes': 'Bytes of your latest message a permission request shows Fishball',
      'field.rationaleChars': 'Characters of Fishball\'s reason kept in the approval audit',
      'field.approvalsShown': 'Permission requests shown on this page',
      'field.intakeRowsShown': 'Queue rows kept in the state snapshot',
      'field.outboxShown': 'Outbox entries kept in the state snapshot',
      'field.watchesShown': 'Watches kept in the state snapshot and by list_watches',
      'field.readSessionMessages': 'Messages read_session returns',
      'field.readSessionBytes': 'Bytes read_session returns',
      'field.forwardExcerptBytes': 'Bytes of a session\'s last answer in a forward or watch notice',
      'field.pluginHistoryShown': 'Changes shown on a plugin page',
      'field.settingsPromptValueBytes': 'Bytes of each value in a plugin-settings request',
      'field.replyCapShare': 'With a smaller window, automatic reply cap = window ÷ this',
      'field.headroomShare': 'With a smaller window, compaction headroom = window ÷ this',
      'field.minWindowTokens': 'Smallest context window you can set (tokens)',
      'field.pluginManagerStartMs': 'Milliseconds Fishball\'s plugin manager may take to start',
      'field.defaultReplyCapTokens': 'Largest automatic reply cap with a smaller window (tokens)',
      'field.userMessagesListed': 'Your messages list_user_messages shows a managed session',
      'field.userMessageExcerptChars': 'Characters of each message list_user_messages shows',
      'field.pileMaxHeightVh': 'Height of your pile above Fishball\'s composer (% of the window)',
      'questionError.expired': 'This question was already answered, has ended, or went back to its session.',
      'questionError.bad-answer': 'That answer does not fit the question: {reason}',
      'questionError.already-settled': 'Someone answered this question first.',
      'questionError.session-not-live': 'The session could not be reached.',
      'questionError.unavailable': 'Fishball is not running.',
      questionMode: 'Questions in managed sessions',
      questionModeHint: 'Who answers the questions and plan reviews of sessions Fishball manages. Your own sessions\' questions always stay with you.',
      'questionMode.auto': 'Auto',
      'questionMode.fishball': 'Fishball',
      'questionMode.user': 'You',
      'questionModeHint.auto': 'Fishball answers only when your own words cover it; otherwise the question comes to your pile.',
      'questionModeHint.fishball': 'Fishball answers on its own judgement and sends you only what it cannot decide.',
      'questionModeHint.user': 'Every question comes to your pile; Fishball may add a note.',
      questionModeFailed: 'The mode was not changed. Fishball may not be running; try again.',
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
      "adminStatusHint": "Restart stops the isolated Fishball and starts it again; its own home and settings are kept.",
      "adminRestart": "Restart",
      "adminRestarting": "Restarting…",
      "adminLoading": "Loading…",
      "adminReload": "Reload",
      "adminModelTitle": "Model for the isolated Fishball",
      "adminModelHint": "From the isolated Fishball's own catalog. A change applies to its next request and does not change the model your other sessions use.",
      "adminProvider": "Provider",
      "adminModel": "Model",
      "adminModelUnavailable": "The saved model is not in the current catalog. Its selection is kept; choose another model to change it.",
      "adminModelSaved": "Saved. The isolated Fishball uses it from its next request.",
      "adminModelSavedNotApplied": "Saved as the default. The live chat could not take it now; its next request may still use the previous model.",
      "adminPluginsTitle": "Plugins for the isolated Fishball",
      "adminPluginsHint": "These are installed in the isolated Fishball's own profile; nothing here changes DSH's own plugins or another session.",
      "adminInstalled": "Installed",
      "adminNoPlugins": "No plugins are installed in the isolated Fishball.",
      "adminPluginToggle": "Use {name} in the isolated Fishball",
      "adminPluginRemoveLabel": "Uninstall {name} from the isolated Fishball",
      "adminOff": "Off",
      "adminCoreOn": "Core, on",
      "adminInstallTitle": "Install a plugin",
      "adminInstallHint": "A recommended plugin, or any package spec you type: a package name with an optional version, a Git address, a tarball URL or an absolute folder path.",
      "adminRecommendedTitle": "Recommended plugins",
      "adminRecommendedHint": "A fixed list chosen for the isolated Fishball. Installing one needs your click and changes only the child's profile.",
      "adminPluginInstalled": "Installed. It is in the list above now.",
      "adminPluginChanged": "Enabled state saved.",
      "adminPluginRemoved": "Uninstalled.",
      "adminSettingsTitle": "Settings of the isolated Fishball",
      "adminSettingsHint": "The settings its own plugins publish. Each Save sends the revision this page read, so a change made elsewhere is refused instead of overwritten.",
      "adminSettingsReadOnly": "The isolated Fishball stores settings read-only, so they cannot be changed here.",
      "adminSettingsNone": "No plugin in the isolated Fishball publishes a setting this page can change.",
      "adminSettingsAuto": "Some of these values are generated automatically.",
      "adminSettingsSaved": "Saved.",
      "adminSettingsStale": "These settings changed elsewhere. The current values were reloaded; review them and save again.",
      "adminRevisionNumbers": "(expected revision {expected}, found {actual})",
      "adminErrorOther": "The isolated Fishball refused that operation.",
      "adminError.stale-revision": "These values changed since the page read them, so nothing was written. Reload and try again.",
      "adminError.unavailable": "The isolated Fishball is not running.",
      "adminError.timeout": "The isolated Fishball did not answer in time. It may still be applying the change; reload before retrying.",
      "adminError.disconnected": "The connection to the isolated Fishball closed. Restart it and try again.",
      "adminError.invalid-payload": "That request was not valid.",
      "adminError.read-only": "The isolated Fishball stores settings read-only.",
      "adminError.unknown-namespace": "That settings section no longer exists.",
      "adminError.unknown-provider": "That provider is not in the isolated Fishball's catalog.",
      "adminError.unknown-model": "That model is not in the isolated Fishball's catalog.",
      "adminError.invalid-reasoning-effort": "That reasoning effort is not offered for this model.",
      "adminError.model-unavailable": "That model cannot be selected right now.",
      "adminError.unknown-plugin": "That plugin is not installed in the isolated Fishball.",
      "adminError.invalid-spec": "That is not a package spec DSH accepts.",
      "adminError.already-installed": "That plugin is already installed in the isolated Fishball.",
      "adminError.not-removable": "The isolated Fishball cannot remove or disable that plugin; it is part of its core.",
      "adminError.build-blocked": "The install is waiting for your approval of its build scripts (DSH's own dialog).",
      "adminError.plugin-failed": "The plugin change failed.",
      "adminError.too-large": "That answer was too large for the connection.",
      "adminError.operation-failed": "That operation failed.",
      "adminModelRefresh": "Refresh models",
      "adminModelSyncing": "Syncing from DSH…",
      "adminModelSyncHint": "Refresh models also copies new API-key providers from your main DSH into Fishball. OAuth logins are not copied, and providers Fishball already has are kept. Fishball's model catalog then checks them, which may also read keys set for its other providers.",
      "adminModelNotRunning": "Start the isolated Fishball above to refresh its models.",
      "syncSummary": "Synced from DSH: {added} new",
      "syncSummaryPresent": "{count} already in Fishball",
      "syncSummarySkipped": "{count} skipped",
      "syncSummaryFailed": "{count} failed",
      "syncNothing": "No API-key providers in DSH to sync.",
      "syncDetails": "Details",
      "syncOutcome.skipped": "Skipped",
      "syncOutcome.failed": "Failed",
      "syncReason.oauth-login": "Uses a login, not an API key: log in inside Fishball.",
      "syncReason.unsupported-provider": "Not a plain API-key provider (custom headers, a secret reference or an environment key). Set it up inside Fishball.",
      "syncReason.provider-conflict": "Fishball has a different provider with this name; it was kept.",
      "syncReason.incompatible-owner-or-schema": "Fishball's model plugin for this provider is different; nothing was changed.",
      "syncReason.version-mismatch": "Fishball runs a different DSH version. Restart Fishball, then refresh again.",
      "syncReason.no-api-key": "Has no API key in DSH, so there is nothing to copy.",
      "syncReason.credential-not-writable": "Fishball cannot store a key for this provider.",
      "syncReason.missing-revision": "Fishball's model settings could not be read.",
      "syncReason.repreview-required": "Changed while syncing; refresh again.",
      "syncReason.result-unknown": "The result is unknown. Refresh again to check it.",
      "syncReason.key-not-saved": "The provider was added but its key was not saved. Refresh again.",
      "syncReason.unsupported-record": "Its key in DSH is not a plain API key.",
      "syncReasonOther": "Could not be synced.",
      "syncError.unavailable": "Fishball is not connected, so nothing was synced. Restart it and retry.",
      "syncError.timeout": "Fishball did not answer in time. Some providers may already be in; retry to check.",
      "syncError.changed": "DSH or Fishball changed while syncing, so nothing was written. Retry.",
      "syncErrorOther": "Models could not be synced from DSH.",
      "syncRetry": "Retry",
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
      brandStyle: '侧边栏图标',
      brandStyleHint: 'Fishball 自己的标志和字标，或 DeepSeek 的鲸鱼和字标。新消息在两种图标上都会显示数字；Fishball 的小鱼会摆尾，鲸鱼则会像在新会话里悬停时那样游动。',
      brandStyleDeepseek: '使用 DeepSeek 图标',
      sidebarEntry: '侧边栏入口',
      sidebarEntryHint: 'Fishball 像普通会话一样在主区域中打开。开启时，侧边栏在「插件」上方多一行 Fishball；关闭时，只有左上角的 Fishball 按钮能打开它。macOS 桌面版的左上角按钮不能点击，在那里请保持开启。',
      sidebarEntryPanel: '在侧边栏中显示 Fishball 一行',
      limits: '安全限制',
      modelLoading: '正在加载模型…',
      modelEffort: '推理强度',
      modelEffortDefault: '模型默认值',
      modelEmpty: '没有可用模型。请先在 DSH 模型设置中配置提供商，然后刷新。',
      nativeTitle: '独立 Fishball', nativeRefresh: '刷新状态',
      nativeHint: '隔离的 Fishball 在自己的主目录中与 DSH 并行运行。它的聊天像普通会话一样在 DSH 主区域中打开；下面的模型、插件和设置都是它自己的。',
      viewTitle: 'Fishball', embedTitle: 'Fishball 聊天', embedRefresh: '刷新', embedOpenTab: '在标签页中打开',
      embedUnavailable: 'Fishball 当前不可用。重试会重新启动它。', embedRetry: '重试',
      embedState: '状态', embedCode: '代码',
      'native.loading': '正在检查状态…', 'native.disabled': '已禁用', 'native.waiting': '等待主端就绪',
      'native.starting': '正在启动', 'native.ready': '已就绪', 'native.stopping': '正在停止', 'native.stopped': '已停止',
      'native.failed': '原生运行时失败', 'native.unavailable': '不可用，或当前 profile 未启用',
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
      plugins: 'Fishball 的插件',
      uninstall: '卸载',
      installSpecLabel: '包',
      install: '安装',
      installPlaceholder: '包名、包名@1.2.0、Git 地址或 /绝对路径',
      pending: '本回合结束后生效',
      waiting: '启动中…',
      changeFailed: '该更改未被接受。',
      refresh: '刷新',
      'recommendedCategory.context': '上下文管理',
      'recommendedCategory.memory': '记忆',
      'recommendedCategory.channel': '渠道',
      'recommendedCategory.pet': '宠物',
      recommendedInstallLabel: '为 Fishball 安装 {name}',
      'recommendedState.installed': '已安装',
      'recommendedDesc.dsh-idle-compact': '在你空闲时、模型缓存过期前准备压缩，并且无需新的模型调用即可应用。',
      'recommendedDesc.dsh-plugin-save-token': '无损压缩工具输出，并把大结果写到磁盘，降低 token 开销。',
      'recommendedDesc.smart-compaction': '让模型在安全的时机压缩上下文，并查看真实的 token 用量。',
      'recommendedDesc.meow-memory': '基于 SQLite 的本地跨会话记忆，提供记住与搜索工具，并会自动反思。',
      'recommendedDesc.@a9i5k4/dsh-auto-memory': '在模型回答前回忆相关内容，并随时间整理所学。',
      'recommendedDesc.@zilliz/memsearch-dsh': '与其他编程智能体共享的 Markdown 记忆，基于搜索回忆。需要安装 memsearch 工具。',
      'recommendedDesc.@michengai/dsh-im-connect': '通过微信、企业微信、钉钉、飞书、Lark、QQ 和 Telegram 与 DSH 对话。',
      'recommendedDesc.dsh-telegram-notify': '把回合结束、提问和权限请求发到 Telegram 聊天（单向）。',
      'recommendedDesc.dsh-plugin-discord': '从 Discord 操作会话。需要 Discord 机器人令牌，并把你的用户 ID 加入允许列表。',
      'recommendedDesc.dsh-dingtalk-channel': '钉钉 Stream 模式机器人：每个聊天驱动自己的智能体。需要钉钉的客户端 ID 和密钥。',
      settingsChanged: '已更改',
      settingsReset: '重置',
      settingsResetAll: '全部重置',
      settingsInvalid: '此值不被接受。',
      settingsReadOnly: '仅显示：这类设置不能在这里修改。',
      settingsListHint: '每行一项。',
      secretSet: '已设置',
      secretUnset: '未设置',
      secretHint: '输入新值以替换。它不会显示，Fishball 也看不到。',
      secretClear: '清除',
      resetField: '重置 {name}',
      clearField: '清除 {name}',
      'field.maxQueuedInputs': '尚未读取的排队输入',
      'field.maxActiveWatches': '进行中的“完成时通知我”',
      'field.maxSourcesPerPlugin': '每个插件的信息源',
      'field.maxFishballOnlyPlugins': '仅为 Fishball 运行的插件',
      'field.wakeupsPerHour': '每小时非用户输入唤醒次数（0 = 不限）',
      'field.messagesPerHour': 'Fishball 每小时发送的消息（0 = 不限）',
      'field.sessionsPerHour': 'Fishball 每小时新建的会话（0 = 不限）',
      'field.maxPendingApprovals': '同时打开的权限请求（等待 Fishball 或在你的待处理区）',
      'field.approvalAnswerSeconds': 'Fishball 回答请求的秒数',
      'field.argumentExcerptBytes': 'Fishball 可见的请求命令字节数',
      'field.maxMessageBytes': '单条消息字节数',
      'field.auditEntriesKept': '每个审计列表保留的条目',
      'field.requestUserMessageBytes': '权限请求向 Fishball 显示的你最近消息字节数',
      'field.rationaleChars': '审批记录中保留的 Fishball 理由字符数',
      'field.approvalsShown': '本页显示的权限请求条目',
      'field.intakeRowsShown': '状态快照中保留的队列行数',
      'field.outboxShown': '状态快照中保留的发件箱条目',
      'field.watchesShown': '状态快照与 list_watches 中保留的关注数',
      'field.readSessionMessages': 'read_session 返回的消息数',
      'field.readSessionBytes': 'read_session 返回的字节数',
      'field.forwardExcerptBytes': '转发或关注通知中会话最后回答的字节数',
      'field.pluginHistoryShown': '插件页面显示的变更数',
      'field.settingsPromptValueBytes': '插件设置请求中每个值的字节数',
      'field.replyCapShare': '较小窗口时，自动回复上限 = 窗口 ÷ 此值',
      'field.headroomShare': '较小窗口时，压缩余量 = 窗口 ÷ 此值',
      'field.minWindowTokens': '可设置的最小上下文窗口（token）',
      'field.pluginManagerStartMs': 'Fishball 插件管理器启动可用的毫秒数',
      'field.defaultReplyCapTokens': '较小窗口时自动回复上限的最大值（token）',
      'field.userMessagesListed': 'list_user_messages 向受管会话列出的你的消息条数',
      'field.userMessageExcerptChars': 'list_user_messages 每条消息摘录的字符数',
      'field.pileMaxHeightVh': 'Fishball 输入框上方待处理请求区的高度（占窗口的百分比）',
      'questionError.expired': '这个问题已被回答、已结束，或已回到它的会话。',
      'questionError.bad-answer': '这个回答不符合问题：{reason}',
      'questionError.already-settled': '已有人先回答了这个问题。',
      'questionError.session-not-live': '无法连接到该会话。',
      'questionError.unavailable': 'Fishball 未在运行。',
      questionMode: '受管会话中的问题',
      questionModeHint: '由谁回答 Fishball 管理的会话中的问题和计划审阅。你自己的会话中的问题始终由你回答。',
      'questionMode.auto': '自动',
      'questionMode.fishball': 'Fishball',
      'questionMode.user': '你',
      'questionModeHint.auto': '只有在你自己的话涵盖时 Fishball 才回答；否则问题会进入你的待处理区。',
      'questionModeHint.fishball': 'Fishball 按自己的判断回答，只把它无法决定的交给你。',
      'questionModeHint.user': '每个问题都进入你的待处理区；Fishball 可以附上备注。',
      questionModeFailed: '模式未更改。Fishball 可能未在运行，请重试。',
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
      "adminStatusHint": "重启会停止隔离的 Fishball 并再次启动；它自己的主目录和设置会保留。",
      "adminRestart": "重启",
      "adminRestarting": "正在重启…",
      "adminLoading": "正在读取…",
      "adminReload": "重新读取",
      "adminModelTitle": "隔离 Fishball 使用的模型",
      "adminModelHint": "来自隔离 Fishball 自己的模型目录。更改会在它的下一次请求生效，不会改变你其他会话使用的模型。",
      "adminProvider": "提供商",
      "adminModel": "模型",
      "adminModelUnavailable": "已保存的模型不在当前目录中。选择会保留；要更改请选择另一个模型。",
      "adminModelSaved": "已保存。隔离 Fishball 会在下一次请求使用它。",
      "adminModelSavedNotApplied": "已保存为默认值。当前聊天未能立即采用；它的下一次请求可能仍使用此前的模型。",
      "adminPluginsTitle": "隔离 Fishball 的插件",
      "adminPluginsHint": "这些插件安装在隔离 Fishball 自己的配置中；此处不会改变 DSH 自己的插件或其他会话。",
      "adminInstalled": "已安装",
      "adminNoPlugins": "隔离 Fishball 中尚未安装插件。",
      "adminPluginToggle": "在隔离 Fishball 中使用 {name}",
      "adminPluginRemoveLabel": "从隔离 Fishball 卸载 {name}",
      "adminOff": "已关闭",
      "adminCoreOn": "核心，已开启",
      "adminInstallTitle": "安装插件",
      "adminInstallHint": "推荐插件，或你输入的任何包规格：包名（可带版本）、Git 地址、压缩包 URL 或绝对文件夹路径。",
      "adminRecommendedTitle": "推荐插件",
      "adminRecommendedHint": "为隔离 Fishball 选定的固定列表。安装需要你点击，并且只改它的配置。",
      "adminPluginInstalled": "已安装。它现在在上面的列表中。",
      "adminPluginChanged": "启用状态已保存。",
      "adminPluginRemoved": "已卸载。",
      "adminSettingsTitle": "隔离 Fishball 的设置",
      "adminSettingsHint": "它自己的插件公开的设置。每次保存都会发送本页读取的修订号，因此在别处发生的更改会被拒绝，不会被覆盖。",
      "adminSettingsReadOnly": "隔离 Fishball 以只读方式存储设置，因此不能在这里修改。",
      "adminSettingsNone": "隔离 Fishball 中没有插件公开本页可修改的设置。",
      "adminSettingsAuto": "其中一些值是自动生成的。",
      "adminSettingsSaved": "已保存。",
      "adminSettingsStale": "这些设置在别处已更改。已重新读取当前值；请检查后再次保存。",
      "adminRevisionNumbers": "（期望修订号 {expected}，实际 {actual}）",
      "adminErrorOther": "隔离 Fishball 拒绝了该操作。",
      "adminError.stale-revision": "自本页读取以来这些值已更改，因此没有写入任何内容。请重新读取后再试。",
      "adminError.unavailable": "隔离 Fishball 未在运行。",
      "adminError.timeout": "隔离 Fishball 未及时回答。它可能仍在应用更改；重试前请重新读取。",
      "adminError.disconnected": "与隔离 Fishball 的连接已关闭。请重启后再试。",
      "adminError.invalid-payload": "该请求无效。",
      "adminError.read-only": "隔离 Fishball 以只读方式存储设置。",
      "adminError.unknown-namespace": "该设置分区已不存在。",
      "adminError.unknown-provider": "该提供商不在隔离 Fishball 的目录中。",
      "adminError.unknown-model": "该模型不在隔离 Fishball 的目录中。",
      "adminError.invalid-reasoning-effort": "该模型不提供这个推理强度。",
      "adminError.model-unavailable": "当前无法选择该模型。",
      "adminError.unknown-plugin": "隔离 Fishball 中未安装该插件。",
      "adminError.invalid-spec": "DSH 不接受这个包规格。",
      "adminError.already-installed": "隔离 Fishball 中已安装该插件。",
      "adminError.not-removable": "隔离 Fishball 无法卸载或停用该插件；它是核心的一部分。",
      "adminError.build-blocked": "安装正在等待你批准其构建脚本（DSH 自己的对话框）。",
      "adminError.plugin-failed": "插件更改失败。",
      "adminError.too-large": "该回答对于连接来说太大。",
      "adminError.operation-failed": "该操作失败。",
      "adminModelRefresh": "刷新模型",
      "adminModelSyncing": "正在从 DSH 同步…",
      "adminModelSyncHint": "刷新模型时，会把主 DSH 中新的 API key 提供商复制到 Fishball。OAuth 登录不会复制，Fishball 已有的提供商保持不变。之后 Fishball 的模型目录会检查它们，这可能同时读取它其他提供商设置的 key。",
      "adminModelNotRunning": "请先在上方启动隔离 Fishball，再刷新它的模型。",
      "syncSummary": "已从 DSH 同步：新增 {added} 个",
      "syncSummaryPresent": "已存在 {count} 个",
      "syncSummarySkipped": "跳过 {count} 个",
      "syncSummaryFailed": "失败 {count} 个",
      "syncNothing": "主 DSH 中没有可同步的 API key 提供商。",
      "syncDetails": "详情",
      "syncOutcome.skipped": "已跳过",
      "syncOutcome.failed": "失败",
      "syncReason.oauth-login": "使用登录而不是 API key：请在 Fishball 内登录。",
      "syncReason.unsupported-provider": "不是普通的 API key 提供商（自定义 header、密钥引用或环境变量 key）。请在 Fishball 内设置。",
      "syncReason.provider-conflict": "Fishball 中有同名但不同的提供商，已保留原样。",
      "syncReason.incompatible-owner-or-schema": "Fishball 中这个提供商的模型插件不同，未做任何更改。",
      "syncReason.version-mismatch": "Fishball 运行的 DSH 版本不同。请重启 Fishball 后再刷新。",
      "syncReason.no-api-key": "它在 DSH 中没有 API key，无需复制。",
      "syncReason.credential-not-writable": "Fishball 无法为这个提供商保存 key。",
      "syncReason.missing-revision": "无法读取 Fishball 的模型设置。",
      "syncReason.repreview-required": "同步期间发生了变化，请再刷新一次。",
      "syncReason.result-unknown": "结果未知。请再刷新一次以确认。",
      "syncReason.key-not-saved": "提供商已新增，但它的 key 没有保存。请再刷新一次。",
      "syncReason.unsupported-record": "它在 DSH 中的 key 不是普通的 API key。",
      "syncReasonOther": "无法同步。",
      "syncError.unavailable": "Fishball 未连接，没有同步任何内容。请重启后重试。",
      "syncError.timeout": "Fishball 未及时回答，部分提供商可能已经同步。请重试以确认。",
      "syncError.changed": "同步期间 DSH 或 Fishball 发生了变化，因此没有写入任何内容。请重试。",
      "syncErrorOther": "无法从 DSH 同步模型。",
      "syncRetry": "重试",
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
      `.${MODEL.settingsClass} select{width:100%;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);padding:8px 12px}`,
      `.${MODEL.gateClass}{${DOCK_CARD_WIDTH};${DOCK_CARD_LOOK};padding:12px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;font:var(--dsw-font-xs-13)}`,
      `.${CLS.row}{display:flex;gap:12px;align-items:baseline}`,
      `.${CLS.label}{min-width:120px;color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.code}{font-family:var(--ds-font-family-code);overflow-wrap:anywhere}`,
      `.${CLS.name}{position:relative;display:inline-block;font-family:${WORDMARK.fontFamily};font-weight:${WORDMARK.fontWeight};letter-spacing:${WORDMARK.letterSpacing};line-height:${WORDMARK.lineHeight};top:${WORDMARK.lift}}`,
      // Overlaid on the corner, so it takes no layout space and cannot push the sidebar controls.
      `.${CLS.tag}{position:absolute;right:${BRAND_TAG.right};bottom:${BRAND_TAG.bottom};padding:0 ${BRAND_TAG.paddingX};border-radius:${BRAND_TAG.radius};background:${BRAND_TAG.fill};color:${BRAND_TAG.textColor};font:${BRAND_TAG.fontWeight} ${BRAND_TAG.fontSize}/${BRAND_TAG.lineHeight} ${BRAND_TAG.fontFamily};box-shadow:${BRAND_TAG.ring},${BRAND_TAG.shadow};white-space:nowrap;pointer-events:none}`,
      `.${CLS.grow}{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}`,
      `.${CLS.muted}{color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.recordBody}{display:flex;flex-direction:column;gap:4px;padding:4px 0 4px 22px;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-secondary)}`,
      // The Fishball view (§7) fills DSH's main area as a session does: DSH's conversation root,
      // its header (border, padding, the leading clearance a hidden macOS sidebar leaves) and its
      // name style; the frame takes the rest.
      `.${CLS.embed}{display:flex;flex-direction:column;flex:1;width:100%;height:100%;min-width:0;min-height:0;background:var(--dsw-alias-bg-base)}`,
      `.${CLS.embedBar}{box-sizing:border-box;flex:none;display:flex;align-items:center;gap:${DSH_SESSION_HEADER.gap};min-height:${DSH_SESSION_HEADER.minHeight};padding:${DSH_SESSION_HEADER.padding};padding-inline-start:max(${DSH_SESSION_HEADER.startPadding}, var(--dsh-frame-leading-clearance,0px));border-bottom:.5px solid var(--dsw-alias-border-l3)}`,
      `.${CLS.embedName}{color:var(--dsw-alias-label-primary);font-size:${DSH_SESSION_HEADER.nameFont};line-height:${DSH_SESSION_HEADER.nameLine};font-weight:500;white-space:nowrap}`,
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
      // The managed-session banner and sidebar mark (item 30), in DSH's theme tokens for light and dark.
      // Width and spacing as DSH's Todo dock (DSH_COMPOSER): no margin of its own, so the composer stack's gap spaces it.
      // The welcome card (revision 12) shares the banner's width and look; it stacks its lines.
      // Recommended plugins on the settings page: one compact row per plugin, the description cut to one line.
      `.${CLS.recCategory}{display:flex;align-items:center;gap:${RECOMMENDED.categoryGapPx}px;margin:0}`,
      `.${CLS.recRow}{display:flex;align-items:center;gap:${RECOMMENDED.rowGapPx}px;padding:${RECOMMENDED.rowPaddingYPx}px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}`,
      `.${CLS.recDesc}{overflow:hidden;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap}`,
      `.${CLS.managedRow}{position:relative;display:inline-flex;align-items:center;justify-content:center;width:${MANAGED_ROW.cellPx}px;height:${MANAGED_ROW.cellPx}px;color:var(--dsw-alias-label-primary)}`,
      // The dots' two meanings get DSH's own state tokens; yellow is checked first in the component.
      `.${CLS.managedRowDot}{position:absolute;top:${MANAGED_ROW.dot.topPx}px;right:${MANAGED_ROW.dot.rightPx}px;box-sizing:border-box;width:${MANAGED_ROW.dot.sizePx}px;height:${MANAGED_ROW.dot.sizePx}px;border-radius:50%;background:var(--dsw-alias-state-success-primary);pointer-events:none}`,
      `.${CLS.managedRowDot}[data-fishball-dot="${MANAGED_ROW.dot.action}"]{background:var(--dsw-alias-state-warn-primary)}`,
      // The plugin manager copies DSH's own Plugins-page rules (dsh-client-ui-plugin-manager
      // PluginManagerPage.module.css, rc.2) with DSH's theme variables, so the Fishball tab reads
      // as DSH's Installed tab and plugin page (DESIGN §10d "Look"). If DSH restyles its page,
      // this copy keeps the old look until it is updated.
      `.${MCLS.panel}{display:flex;flex-direction:column;gap:24px;color:var(--dsw-alias-label-primary)}`,
      `.${MCLS.bar}{display:flex;justify-content:flex-end;gap:8px}`,
      `.${MCLS.group}{display:flex;flex-direction:column;gap:8px}`,
      `.${MCLS.groupTitle}{margin:0;font-size:14px;font-weight:500;line-height:22px}`,
      `.${MCLS.cards}{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}`,
      `.${MCLS.card}{position:relative;min-width:0;margin:0 -8px;border-radius:var(--dsw-radius-xl);cursor:pointer}`,
      `.${MCLS.card}:hover{background:var(--dsw-alias-interactive-bg-hover)}`,
      `.${MCLS.cardHead}{display:flex;align-items:center;gap:14px;padding:8px}`,
      `.${MCLS.icon}{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:48px;height:48px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);color:var(--dsw-alias-label-secondary);overflow:hidden}`,
      `.${MCLS.icon} img{width:${MANAGER.artSize}px;height:${MANAGER.artSize}px;object-fit:contain}`,
      `.${MCLS.main}{display:flex;flex:1 1 0%;flex-direction:column;gap:4px;min-width:0}`,
      `.${MCLS.titleRow}{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}`,
      `.${MCLS.title}{overflow:hidden;padding:0;border:0;background:none;color:inherit;font-size:14px;font-weight:500;line-height:20px;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}`,
      `.${MCLS.title}:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}`,
      `.${MCLS.desc}{display:-webkit-box;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:18px;-webkit-line-clamp:1;-webkit-box-orient:vertical}`,
      `.${MCLS.tag}{height:18px;padding:0 7px;font-size:10px;line-height:1}`,
      // The plugin page copies DSH's own (dsh-client-ui-plugin-manager .detail and its parts, rc.2).
      `.${MCLS.detail}{display:flex;flex-direction:column}`,
      `.${MCLS.detailTop}{display:flex;flex-direction:column;padding-top:28px}`,
      `[data-platform="darwin"] .${MCLS.detailTop}{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}`,
      `.${MCLS.crumb}{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:0;border:0;background:none;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12.5px;cursor:pointer}`,
      `.${MCLS.crumb}:hover{color:var(--dsw-alias-label-primary)}`,
      `.${MCLS.crumb}:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}`,
      `.${MCLS.detailHead}{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:32px 0 0}`,
      `.${MCLS.detailMain}{display:flex;flex-direction:column;gap:8px;min-width:0;margin-top:20px}`,
      `.${MCLS.detailTitle}{margin:0;font-size:20px;font-weight:500;line-height:28px}`,
      `.${MCLS.detailName}{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}`,
      `.${MCLS.detailName} code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}`,
      `.${MCLS.detailDesc}{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}`,
      `.${MCLS.detailActions}{display:flex;flex:0 0 auto;align-items:center;gap:16px}`,
      `.${MCLS.sections}{display:flex;flex-direction:column;gap:32px;margin-top:32px}`,
      `.${MCLS.detailSection}{display:flex;flex-direction:column;gap:12px}`,
      `.${MCLS.sectionHead}{display:flex;align-items:baseline;gap:10px}`,
      `.${MCLS.sectionCount}{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}`,
      `.${MCLS.facts}{margin:0}`,
      `.${MCLS.facts} div{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:44px;padding:8px 2px;border-bottom:.5px solid var(--dsw-alias-border-l2)}`,
      `.${MCLS.facts} dt{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}`,
      `.${MCLS.facts} dd{min-width:0;margin:0;font-size:13px;line-height:20px;text-align:end;overflow-wrap:anywhere}`,
      `.${MCLS.rows}{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}`,
      `.${MCLS.row}{display:flex;align-items:center;gap:8px;padding:12px 2px;border-bottom:.5px solid var(--dsw-alias-border-l2);font-size:13px}`,
      `.${MCLS.row}:last-child{border-bottom:0}`,
      `.${MCLS.row} code{flex:1;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);overflow-wrap:anywhere}`,
      `.${MCLS.section}{display:flex;flex-direction:column;gap:8px}`,
      `.${MCLS.sectionTitle}{margin:0;font-size:14px;font-weight:500;line-height:20px}`,
      `.${MCLS.link}{padding:0;border:0;background:none;color:var(--dsw-alias-state-business-primary);font:inherit;cursor:pointer}`,
      // Fields copy DSH's settings fields (dsh-client-ui-primitives SettingsValueField, rc.2): a
      // hairline between fields, a 13px label, a 12px reset link and a filled 34px input.
      `.${MCLS.fields}{display:flex;flex-direction:column}`,
      `.${MCLS.fields}>*+*{border-top:.5px solid var(--dsw-alias-border-l2)}`,
      `.${MCLS.field}{display:flex;flex-direction:column;gap:6px;padding:12px 0}`,
      `.${MCLS.fieldHead}{display:flex;align-items:center;gap:8px}`,
      `.${MCLS.label}{flex:1 1 0%;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}`,
      `.${MCLS.reset}{align-self:flex-start;padding:0;border:none;background:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;cursor:pointer}`,
      `.${MCLS.reset}:hover:not(:disabled){color:var(--dsw-alias-label-primary)}`,
      `.${MCLS.hint}{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}`,
      `.${MCLS.input}{box-sizing:border-box;width:100%;min-height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5}`,
      `textarea.${MCLS.input}{padding:6px 12px;resize:vertical}`,
      `.${MCLS.input}:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}`,
      `.${MCLS.input}[aria-invalid="true"]{border-color:var(--dsw-alias-state-error-primary)}`,
      `.${MCLS.readOnly}{margin:0;padding:6px 10px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${MCLS.formActions}{display:flex;justify-content:flex-end;gap:8px}`,
      // The one accent token and the one ring (§8.5). The ring mixes the accent with whatever
      // surface is under it, so it reads on light and dark; DSH's own variant supplies hover,
      // active and focus-visible.
      `:root{--fb-accent:${FISHBALL_ACCENT}}`,
      `.${ACCENT_BUTTON.className}{box-shadow:0 0 0 1px color-mix(in srgb, var(--fb-accent) 55%, transparent)}`,
      // Fishball's switches (owner's choice): magenta when on, and a small fish on the knob in both
      // states, so one reads as Fishball's wherever it appears, DSH's pages included. DSH's switch
      // is a button[role=switch] with one span knob (dsh-client-ui-primitives Switch, rc.2).
      `.${MCLS.accent} [role=switch][aria-checked="true"]{background:${FISHBALL_ACCENT}}`,
      // [aria-checked] outranks DSH's off-state knob rule, whose `background` shorthand would clear the fish.
      `.${MCLS.accent} [role=switch][aria-checked] > span{background-color:${FISHBALL_SWITCH.knob};background-image:${FISHBALL_SWITCH.fish};background-position:center;background-repeat:no-repeat;background-size:${FISHBALL_SWITCH.fishSize}}`,
      `.${MCLS.accent}{display:inline-flex;align-items:center;gap:8px}`,
      `.${MCLS.menuIcon}{display:inline-flex;color:${FISHBALL_ACCENT}}`,
      // As DSH's own toolbar in the page header (dsh-client-ui-plugin-manager .toolbar, rc.2).
      `.${MCLS.headerActions}{display:flex;flex:none;align-items:center;justify-content:flex-end;gap:16px;white-space:nowrap}`,
      // DSH's own Add button pattern on top of its primary small button (dsh-client-ui-plugin-manager
      // .addButton, rc.2): 32px high, 12px sides, the medium radius, 13px text.
      `.${MCLS.addButton}{height:32px;padding:0 12px;border-radius:var(--dsw-radius-md);font-size:13px;line-height:20px}`,
      // DSH's Refresh icon button (dsh-client-ui-plugin-manager .iconButton, rc.2).
      `.${MCLS.iconButton}{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-caption);cursor:pointer}`,
      `.${MCLS.iconButton}:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}`,
      `.${MCLS.iconButton}:disabled{opacity:.5;cursor:default}`,
      `.${MCLS.iconButton}:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}`,
      `.${MCLS.spin}{display:inline-flex;animation:fbp-spin 1s linear infinite}`,
      `@keyframes fbp-spin{to{transform:rotate(360deg)}}`,
      `@media (prefers-reduced-motion:reduce){.${MCLS.spin}{animation:none}}`,
      // The Add plugin menu item and the install dialog follow DSH's own (dsh-client-ui-plugin-manager, rc.2).
      `.${MCLS.copy}{display:flex;flex-direction:column;gap:2px;white-space:normal}`,
      `.${MCLS.copyDesc}{display:-webkit-box;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;-webkit-line-clamp:2;-webkit-box-orient:vertical}`,
      `.${MCLS.dialog}{display:flex;flex-direction:column;gap:12px;font-size:13px;line-height:1.5}`,
      `.${MCLS.subject}{display:flex;align-items:flex-start;gap:14px;padding:12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg)}`,
      `.${MCLS.trust}{margin:0;padding:8px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}`,
      `.${MCLS.log}{max-height:220px;margin:0;overflow:auto;padding:8px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}`,
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
    /** POST one command. @returns whether it was accepted. */
    const post = async (path, body) => (await send(path, body)).ok

    /**
     * One child admin operation (§9). Never throws: a transport failure is a typed error, and a
     * refusal keeps the child's code (and its revision facts) so the page can show the reason.
     */
    async function adminRequest(operation, payload = {}) {
      try {
        const response = await fetch(apiUrl(ADMIN_UI.prefix + ADMIN_UI.path[operation]), { ...ADMIN_UI.request, body: JSON.stringify(payload) })
        const answer = await response.json().catch(() => null)
        if (answer?.ok === true && answer.result !== undefined) return { ok: true, result: answer.result }
        const error = answer?.ok === false && typeof answer.error?.code === 'string' ? answer.error : { code: 'operation-failed' }
        return { ok: false, error }
      } catch { return { ok: false, error: { code: 'unavailable' } } }
    }

    /**
     * One provider sync from the main DSH into the child (§10). Never throws: a transport failure
     * or a refusal is a typed error; a success is the per-provider list.
     * @returns {{ok: true, items: Array} | {ok: false, code: string}}
     */
    async function syncProviders() {
      try {
        const response = await fetch(apiUrl(CHILD_SYNC_UI.path), CHILD_SYNC_UI.request)
        const answer = await response.json().catch(() => null)
        if (answer?.ok === true && Array.isArray(answer.result?.items)) return { ok: true, items: answer.result.items }
        return { ok: false, code: answer?.ok === false && typeof answer.error?.code === 'string' ? answer.error.code : CHILD_SYNC_UI.failed }
      } catch { return { ok: false, code: CHILD_SYNC_UI.failed } }
    }

    /** The sync's quiet one-line summary: new providers, then whatever else happened. */
    function syncSummaryText(t, items) {
      if (items.length === 0) return t('syncNothing')
      const count = (outcome) => items.filter((item) => item.outcome === outcome).length
      const O = CHILD_SYNC_UI.outcome
      const parts = [t('syncSummary', { added: count(O.added) })]
      for (const [outcome, key] of [[O.present, 'syncSummaryPresent'], [O.skipped, 'syncSummarySkipped'], [O.failed, 'syncSummaryFailed']]) {
        if (count(outcome) > 0) parts.push(t(key, { count: count(outcome) }))
      }
      return parts.join(CHILD_SYNC_UI.summarySeparator)
    }

    /** What the last sync did: the summary line, and the skipped/failed providers with their reasons. */
    function SyncOutcome({ items, t }) {
      const noted = CHILD_SYNC_UI.detailOutcomes.flatMap((outcome) => items.filter((item) => item.outcome === outcome))
      const reason = (code) => CHILD_SYNC_UI.reasons.includes(code) ? t('syncReason.' + code) : t('syncReasonOther')
      return h('div', { 'data-fishball-sync-result': true },
        h('p', { role: 'status', className: CLS.muted }, syncSummaryText(t, items)),
        noted.length === 0 ? null : h('details', null,
          h('summary', { className: CLS.muted }, t('syncDetails')),
          h('ul', { className: CLS.entries }, noted.map((item) => h('li', { key: item.id, 'data-fishball-sync-item': item.id, 'data-sync-outcome': item.outcome },
            h('strong', null, item.name), ' — ', t('syncOutcome.' + item.outcome), ': ', reason(item.reason))))))
    }

    /** A whole-sync refusal in words, its code, and Retry. */
    function SyncProblem({ code, onRetry, t }) {
      const words = CHILD_SYNC_UI.errors[code] ? t('syncError.' + CHILD_SYNC_UI.errors[code]) : t('syncErrorOther')
      return h('div', { role: 'alert', className: CLS.row, 'data-fishball-sync-error': code },
        h('span', null, words, ' ', h('code', { className: CLS.code }, code)),
        h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: onRetry }, t('syncRetry')))
    }

    /** One Fishball-accent button (§8.5): DSH's Button with the shared magenta ring. */
    const accentButton = (props, ...children) => h(Button, {
      type: 'button', ...props, variant: ACCENT_BUTTON.variant,
      className: [ACCENT_BUTTON.className, props.className].filter(Boolean).join(' '),
    }, ...children)

    /** A typed admin refusal in words, with its code and any revision numbers the child sent. */
    function AdminProblem({ error, t }) {
      if (!error) return null
      const numbers = Number.isSafeInteger(error.expected) && Number.isSafeInteger(error.actual)
        ? t('adminRevisionNumbers', { expected: error.expected, actual: error.actual }) : null
      return h('div', { role: 'alert', 'data-fishball-admin-error': error.code },
        h('span', null, ADMIN_UI.errors.includes(error.code) ? t('adminError.' + error.code) : t('adminErrorOther')),
        numbers ? h('span', null, ' ' + numbers) : null,
        ' ', h('code', { className: CLS.code }, error.code))
    }

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
     * identity is this session. The snapshot lists at most intakeRowsShown items, so a very old
     * open item may be missing from the dot; the dot is a hint, not a queue count.
     */
    const unreadInput = (state, sessionId) => (Array.isArray(state.intake?.items) ? state.intake.items : []).some((item) => item?.sourceIdentity === ROW_STATE.unreadSource + sessionId && ROW_STATE.unreadStatuses.has(item.status))

    /** Which brand icon you chose; Fishball's own until the Host says otherwise. */
    const brandStyleOf = (state) => state.preferences?.brandStyle ?? BRAND_STYLE.fishball

    /**
     * Fishball's fish: wags while anything is unread; flips while a row runs (the managed mark's
     * running variant). A moving mark never wags, so the running state has one animation.
     */
    function FishballIcon({ size, unread, moving }) {
      const animation = moving ? CLS.flip : unread ? CLS.wag : null
      return h('svg', { width: size, height: size, viewBox: FISH_MARK.viewBox, className: [CLS.mark, animation].filter(Boolean).join(' '), 'aria-hidden': true, 'data-fishball-mark': true },
        h('path', { d: FISH_MARK.body, fill: FISH_MARK.bodyColor }),
        h('path', { d: FISH_MARK.eye, fill: FISH_MARK.eyeColor }))
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
          h(Icon, { size, unread: count > 0 }),
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
     * The child's model (§9): provider, model and reasoning effort from the child's own catalog,
     * saved with the settings revision the page read. A stale revision is a typed refusal, shown
     * with its code; Reload reads the child's current values instead of guessing.
     *
     * "Refresh models" first syncs the main DSH's new API-key providers into the child (§10), then
     * reloads the list, so a provider added in DSH can be picked straight away. The user asked for
     * this to need no extra step, so there is no preview or confirmation; the host still adds
     * only, keeps what Fishball has and never copies a login. Clicks during a run are ignored.
     */
    function makeModelSettings(t) {
      return function FishballModelSettings() {
        const baseId = React.useId()
        const [snapshot, setSnapshot] = React.useState(null)
        const [selection, setSelection] = React.useState(null)
        const [saving, setSaving] = React.useState(false)
        const [problem, setProblem] = React.useState(null)
        const [message, setMessage] = React.useState(null)
        const [sync, setSync] = React.useState({ busy: false, items: null, error: null })
        const syncing = React.useRef(false)
        // Unknown (null) until the status block's first read: disabled, but no "not running" hint yet.
        const nativeNow = useNativeState()
        const running = nativeNow === NATIVE_UI.ready
        const load = React.useCallback(async () => {
          setMessage(null)
          const answer = await adminRequest('modelGet')
          if (!answer.ok) { setProblem(answer.error); return }
          setProblem(null)
          setSnapshot(answer.result)
          setSelection(answer.result.selection)
        }, [])
        React.useEffect(() => { void load() }, [load])
        const refresh = async () => {
          if (syncing.current) return
          syncing.current = true
          setSync({ busy: true, items: null, error: null })
          try {
            const answer = await syncProviders()
            setSync({ busy: false, items: answer.ok ? answer.items : null, error: answer.ok ? null : answer.code })
            // Reload either way: a failed run may still have added some providers.
            await load()
          } finally { syncing.current = false }
        }
        const busy = saving || sync.busy
        const providers = snapshot?.providers ?? []
        const models = snapshot?.models ?? []
        const offered = models.filter((model) => model.provider === selection?.provider)
        const chosen = offered.find((model) => model.id === selection?.model)
        const efforts = chosen?.efforts ?? []
        const known = selection !== null && providers.some((provider) => provider.id === selection.provider) && chosen !== undefined
        const dirty = snapshot !== null && JSON.stringify(selection) !== JSON.stringify(snapshot.selection)
        // A model switch drops the effort unless the new model offers it.
        const pickProvider = (provider) => {
          const first = models.find((model) => model.provider === provider)
          setSelection(first === undefined ? { provider, model: '' } : { provider, model: first.id })
          setMessage(null)
        }
        const pickModel = (id) => {
          const next = offered.find((model) => model.id === id)
          const keep = next?.efforts?.some((effort) => effort.id === selection.reasoningEffort) === true
          setSelection({ provider: selection.provider, model: id, ...(keep ? { reasoningEffort: selection.reasoningEffort } : {}) })
          setMessage(null)
        }
        const pickEffort = (id) => {
          setSelection((previous) => {
            const next = { ...previous }
            if (id === MODEL.empty) delete next.reasoningEffort
            else next.reasoningEffort = id
            return next
          })
          setMessage(null)
        }
        const save = async () => {
          setSaving(true)
          const request = { revision: snapshot.revision, provider: selection.provider, model: selection.model }
          if (selection.reasoningEffort !== undefined) request.reasoningEffort = selection.reasoningEffort
          const answer = await adminRequest('modelSet', request)
          setSaving(false)
          if (!answer.ok) { setProblem(answer.error); return }
          setProblem(null)
          setSnapshot({ ...snapshot, revision: answer.result.revision, selection: answer.result.selection })
          setSelection(answer.result.selection)
          setMessage(answer.result.sessionError ? 'adminModelSavedNotApplied' : 'adminModelSaved')
        }
        return h('section', { className: CLS.section + ' ' + MODEL.settingsClass, 'data-fishball-model-settings': true },
          h('h3', null, t('adminModelTitle')),
          h('p', { className: CLS.muted }, t('adminModelHint')),
          snapshot === null ? h('p', { role: 'status' }, t('modelLoading')) : h(React.Fragment, null,
            h('label', { htmlFor: baseId + '-provider' }, t('adminProvider')),
            h('select', { id: baseId + '-provider', value: selection?.provider ?? '', disabled: busy, onChange: (event) => pickProvider(event.target.value) },
              providers.map((provider) => h('option', { key: provider.id, value: provider.id }, provider.name))),
            h('label', { htmlFor: baseId + '-model' }, t('adminModel')),
            h('select', { id: baseId + '-model', value: selection?.model ?? '', disabled: busy, onChange: (event) => pickModel(event.target.value) },
              offered.map((model) => h('option', { key: model.id, value: model.id }, model.name))),
            efforts.length > 0 ? h(React.Fragment, null,
              h('label', { htmlFor: baseId + '-effort' }, t('modelEffort')),
              h('select', { id: baseId + '-effort', value: selection?.reasoningEffort ?? MODEL.empty, disabled: busy, onChange: (event) => pickEffort(event.target.value) },
                h('option', { value: MODEL.empty }, t('modelEffortDefault')),
                efforts.map((effort) => h('option', { key: effort.id, value: effort.id }, effort.name)))) : null,
            providers.length === 0 || models.length === 0 ? h('p', { role: 'status' }, t('modelEmpty')) : null,
            known ? null : h('p', { role: 'status' }, t('adminModelUnavailable'))),
          h(AdminProblem, { error: problem, t }),
          message ? h('p', { role: 'status', className: CLS.muted }, t(message)) : null,
          sync.items === null ? null : h(SyncOutcome, { items: sync.items, t }),
          sync.error === null ? null : h(SyncProblem, { code: sync.error, onRetry: () => void refresh(), t }),
          h('div', { className: CLS.row },
            h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy || !running, 'aria-busy': sync.busy, onClick: () => void refresh() },
              sync.busy ? t('adminModelSyncing') : t('adminModelRefresh')),
            problem?.code === 'stale-revision' ? h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => void load() }, t('adminReload')) : null,
            accentButton({ size: 'sm', disabled: !known || !dirty || busy, onClick: () => void save() }, saving ? t('saving') : t('save'))),
          running || nativeNow === null ? null : h('p', { role: 'status', className: CLS.muted }, t('adminModelNotRunning')),
          h('p', { className: CLS.muted }, t('adminModelSyncHint')))
      }
    }

    /**
     * The child's plugins (§9). The recommended list is ADMIN_RECOMMENDED (src/slim/host/admin.js,
     * backed by src/recommended.js) plus any package spec you type. Every mutation sends the
     * inventory digest the page read, so a change made elsewhere is refused as stale-revision
     * instead of overwriting it; a successful change reloads the inventory.
     */
    function makeChildPlugins(t) {
      return function FishballChildPlugins() {
        const baseId = React.useId()
        const [view, setView] = React.useState({ loading: true, revision: null, bundles: [], recommended: [], error: null })
        const [busy, setBusy] = React.useState(false)
        const [spec, setSpec] = React.useState('')
        const [problem, setProblem] = React.useState(null)
        const [message, setMessage] = React.useState(null)
        const load = React.useCallback(async () => {
          const answer = await adminRequest('pluginsGet')
          if (!answer.ok) { setView((previous) => ({ ...previous, loading: false, error: answer.error })); return }
          setView({ loading: false, revision: answer.result.inventoryRevision, bundles: answer.result.bundles, recommended: answer.result.recommended ?? [], error: null })
          setProblem(null)
        }, [])
        React.useEffect(() => { void load() }, [load])
        const loaded = !view.loading && view.revision !== null
        const run = async (operation, payload, done) => {
          setBusy(true)
          setProblem(null)
          setMessage(null)
          const answer = await adminRequest(operation, payload)
          setBusy(false)
          if (!answer.ok) { setProblem(answer.error); return }
          setMessage(done)
          await load()
        }
        const install = (value) => {
          const trimmed = value.trim()
          return trimmed === '' ? undefined : run('pluginInstall', { inventoryRevision: view.revision, spec: trimmed }, 'adminPluginInstalled')
        }
        const setEnabled = (bundle, on) => run(on ? 'pluginEnable' : 'pluginDisable', { inventoryRevision: view.revision, name: bundle.name }, 'adminPluginChanged')
        const remove = (bundle) => run('pluginRemove', { inventoryRevision: view.revision, name: bundle.name }, 'adminPluginRemoved')
        const installed = new Set(view.bundles.map((bundle) => bundle.name))
        const groups = []
        for (const item of view.recommended) {
          let group = groups.find((candidate) => candidate.category === item.category)
          if (group === undefined) { group = { category: item.category, items: [] }; groups.push(group) }
          group.items.push(item)
        }
        return h('section', { className: CLS.section, 'data-fishball-child-plugins': true },
          h('h3', null, t('adminPluginsTitle')),
          h('p', { className: CLS.muted }, t('adminPluginsHint')),
          view.loading ? h('p', { role: 'status' }, t('adminLoading')) : null,
          h(AdminProblem, { error: view.error, t }),
          h(AdminProblem, { error: problem, t }),
          message ? h('p', { role: 'status', className: CLS.muted }, t(message)) : null,
          view.revision === null ? null : h(React.Fragment, null,
          h('h4', null, t('adminInstalled')),
          view.bundles.length === 0 ? h('p', { className: CLS.muted }, t('adminNoPlugins'))
            : h('ul', { className: MCLS.rows }, view.bundles.map((bundle) => h('li', { key: bundle.name, className: MCLS.row },
              h('span', { className: CLS.grow }, h('code', null, bundle.name), bundle.version ? h('span', { className: CLS.muted }, ' ' + bundle.version) : null),
              bundle.removable && bundle.installed
                ? h('span', { className: MCLS.accent }, h(Switch, { checked: bundle.enabled, label: t('adminPluginToggle', { name: bundle.name }), disabled: busy, onChange: (on) => void setEnabled(bundle, on) }))
                : h(Tag, { tone: 'neutral' }, t(bundle.enabled ? 'adminCoreOn' : 'adminOff')),
              bundle.removable && bundle.installed
                ? h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: busy, 'aria-label': t('adminPluginRemoveLabel', { name: bundle.name }), onClick: () => void remove(bundle) }, t('uninstall'))
                : null))),
          h('h4', null, t('adminInstallTitle')),
          h('p', { className: CLS.muted }, t('adminInstallHint')),
          h('div', { className: CLS.row },
            h(Input, { id: baseId + '-spec', 'aria-label': t('installSpecLabel'), value: spec, placeholder: t('installPlaceholder'), disabled: busy, onChange: (event) => setSpec(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void install(spec) } }),
            accentButton({ size: 'sm', disabled: busy || view.revision === null || spec.trim() === '', onClick: () => void install(spec) }, t('install'))),
          h('div', { 'data-fishball-recommended-section': true },
            h('h4', null, t('adminRecommendedTitle')),
            h('p', { className: CLS.muted }, t('adminRecommendedHint')),
            groups.map((group) => h('div', { key: group.category, 'data-fishball-recommended-category': group.category },
              h('h5', { className: CLS.recCategory }, t('recommendedCategory.' + group.category)),
              h('ul', { className: CLS.entries }, group.items.map((item) => h('li', { key: item.packageName, className: CLS.recRow, 'data-fishball-recommended': item.packageName },
                h('div', { className: CLS.grow },
                  h('span', { className: CLS.code }, item.packageName),
                  h('span', { className: CLS.recDesc, title: t('recommendedDesc.' + item.packageName) }, t('recommendedDesc.' + item.packageName))),
                installed.has(item.packageName)
                  ? h(Tag, { tone: 'neutral' }, t('recommendedState.installed'))
                  : accentButton({ size: 'sm', disabled: busy, 'aria-label': t('recommendedInstallLabel', { name: item.packageName }), onClick: () => void install(item.spec) }, t('install'))))))))),
          h('div', { className: CLS.row },
            h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy || view.loading, onClick: () => void load() }, t('refresh')),
            problem?.code === 'stale-revision' ? h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: busy, onClick: () => void load() }, t('adminReload')) : null))
      }
    }

    /** Flatten nested form values into the admin's field-path set operations. */
    function valueOps(value, path = [], ops = []) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) valueOps(child, [...path, key], ops)
        return ops
      }
      ops.push({ op: 'set', path, value })
      return ops
    }

    /** The value at a path of a plain value, or undefined. */
    const valueAt = (value, path) => path.reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), value)

    /** Set a value at a path, creating the objects on the way. */
    function setAt(target, path, value) {
      let node = target
      for (const key of path.slice(0, -1)) node = node[key] ??= {}
      node[path[path.length - 1]] = value
    }

    /**
     * The schema-driven settings fields, shared by the plugin manager's settings rows and the
     * isolated child's settings namespaces (§9). Both receive DSH's own schemastery envelope
     * ({ uid, refs }) and draw the same kinds: text, number, switch, choice, list, secret, and a
     * shown-only value for anything else. Edits are drafts until Save; Save hands the caller the
     * nested `values` and the `reset` paths, because the two destinations speak different wire
     * shapes (the plugin-side route and the child's admin mutate).
     */
    function makeSchemaForm(t, resolveText) {
      const localized = (text) => (text === undefined || text === null ? undefined : resolveText(text))

      /** The fields of a schema JSON envelope, in declaration order, each with the way the form draws it. */
      function formFields(json) {
        const node = (ref) => (typeof ref === 'object' ? ref : json.refs?.[ref])
        const kindOf = (field) => {
          if (field.meta?.role === SCHEMA.secretRole) return FIELD_KIND.secret
          if (field.type === SCHEMA.string) return FIELD_KIND.text
          if (field.type === SCHEMA.number) return FIELD_KIND.number
          if (field.type === SCHEMA.boolean) return FIELD_KIND.switch
          if (field.type === SCHEMA.union && (field.list ?? []).length > 0 && field.list.every((ref) => node(ref)?.type === SCHEMA.constant)) return FIELD_KIND.choice
          if (field.type === SCHEMA.array && [SCHEMA.string, SCHEMA.number].includes(node(field.inner)?.type)) return FIELD_KIND.list
          return FIELD_KIND.readOnly
        }
        const walk = (ref, path) => {
          const field = node(ref)
          if (!field || field.meta?.hidden) return []
          if (field.type === SCHEMA.object) return Object.entries(field.dict ?? {}).flatMap(([key, inner]) => walk(inner, [...path, key]))
          if (field.type === SCHEMA.intersect) return (field.list ?? []).flatMap((inner) => walk(inner, path))
          const kind = path.length === 0 ? FIELD_KIND.readOnly : kindOf(field)
          return [{
            path,
            key: JSON.stringify(path),
            kind,
            description: localized(field.meta?.description),
            numbers: kind === FIELD_KIND.list && node(field.inner)?.type === SCHEMA.number,
            choices: kind === FIELD_KIND.choice ? field.list.map((choice) => node(choice).value) : undefined,
          }]
        }
        return walk(json.uid ?? json, [])
      }

      /** A field's text in the form, from its current value. */
      function fieldText(field, value) {
        if (value === undefined || value === null) return ''
        if (field.kind === FIELD_KIND.list) return Array.isArray(value) ? value.join(LIST_SEPARATOR) : ''
        if (field.kind === FIELD_KIND.choice) return String(Math.max(0, field.choices.findIndex((choice) => choice === value)))
        return String(value)
      }

      /** The value a field's draft stands for; undefined when it is not a valid value for its kind. */
      function fieldValue(field, draft) {
        if (field.kind === FIELD_KIND.switch) return draft === true
        if (field.kind === FIELD_KIND.choice) return field.choices[Number(draft)]
        if (field.kind === FIELD_KIND.number) {
          const number = Number(String(draft).trim())
          return String(draft).trim() !== '' && Number.isFinite(number) ? number : undefined
        }
        if (field.kind === FIELD_KIND.list) {
          const items = String(draft).split(LIST_SEPARATOR).map((item) => item.trim()).filter((item) => item !== '')
          if (!field.numbers) return items
          const numbers = items.map(Number)
          return numbers.every(Number.isFinite) ? numbers : undefined
        }
        return String(draft)
      }

      /** A field's label row: its name, and "Changed" with Reset for a field you changed. */
      function FieldHead({ id, label, changed, onReset, disabled }) {
        return h('div', { className: MCLS.fieldHead },
          id === undefined ? h('span', { className: MCLS.label }, label) : h('label', { htmlFor: id, className: MCLS.label }, label),
          changed ? h(React.Fragment, null, h(Tag, { tone: 'neutral' }, t('settingsChanged')), h('button', { type: 'button', className: MCLS.reset, disabled, 'aria-label': t('resetField', { name: label }), onClick: onReset }, t('settingsReset'))) : null)
      }

      /** One field of the form, drawn for its kind. */
      function SettingsField({ field, id, value, secrets, draft, changed, invalid, disabled, onEdit, onReset }) {
        const label = field.path.join('.')
        const current = valueAt(value, field.path)
        const text = draft !== undefined ? draft : fieldText(field, current)
        const labelled = field.kind === FIELD_KIND.choice || field.kind === FIELD_KIND.list
        const head = h(FieldHead, { id: labelled ? id : undefined, label, changed, onReset, disabled })
        const hint = field.description ? h('p', { className: MCLS.hint }, field.description) : null
        if (field.kind === FIELD_KIND.text || field.kind === FIELD_KIND.number) {
          return h(SettingsValueField, {
            id, label, text, numeric: field.kind === FIELD_KIND.number, hint: field.description, invalid, invalidLabel: t('settingsInvalid'),
            overridden: changed, overriddenLabel: t('settingsChanged'), resetLabel: t('settingsReset'), onReset, disabled, onEdit,
          })
        }
        if (field.kind === FIELD_KIND.secret) {
          const slot = secrets.find((candidate) => JSON.stringify(candidate.path) === field.key)
          const set = slot?.set === true
          // DSH's secret field draws its own padding; Clear sits under it.
          return h('div', null,
            h(SettingsSecretField, { id, label, configured: set, stateLabel: t(set ? 'secretSet' : 'secretUnset'), text: draft ?? '', hint: t('secretHint'), disabled, onEdit }),
            // Clear drops the value you set; the plugin's own value, if any, then applies.
            slot?.stored === true ? h('button', { type: 'button', className: MCLS.reset, disabled, 'aria-label': t('clearField', { name: label }), onClick: onReset }, t('secretClear')) : null)
        }
        if (field.kind === FIELD_KIND.switch) {
          return h('div', { className: MCLS.field }, head, h(Switch, { checked: draft !== undefined ? draft : current === true, label, onChange: onEdit }), hint)
        }
        if (field.kind === FIELD_KIND.choice) {
          return h('div', { className: MCLS.field }, head,
            h('select', { id, className: MCLS.input, value: text, disabled, 'aria-invalid': invalid || undefined, onChange: (event) => onEdit(event.target.value) },
              field.choices.map((choice, index) => h('option', { key: index, value: String(index) }, String(choice)))),
            hint)
        }
        if (field.kind === FIELD_KIND.list) {
          return h('div', { className: MCLS.field }, head,
            h('textarea', { id, className: MCLS.input, rows: Math.max(MANAGER.listMinRows, text.split(LIST_SEPARATOR).length), value: text, disabled, 'aria-invalid': invalid || undefined, onChange: (event) => onEdit(event.target.value) }),
            h('p', { className: MCLS.hint }, [field.description, t('settingsListHint')].filter(Boolean).join(' ')))
        }
        return h('div', { className: MCLS.field }, head,
          h('pre', { className: MCLS.readOnly }, JSON.stringify(current ?? null, null, 2)),
          h('p', { className: MCLS.hint }, [field.description, t('settingsReadOnly')].filter(Boolean).join(' ')))
      }

      /**
       * The fields, their drafts and the Save action. `onSave(edits)` returns whether the save was
       * accepted; only then are the drafts cleared, so a refusal leaves your edits in place.
       */
      function SchemaForm({ schema, value, secrets, user, invalidPath, resetAll, disabled, onSave }) {
        const baseId = React.useId()
        const fields = React.useMemo(() => formFields(schema), [schema])
        const [drafts, setDrafts] = React.useState({})
        const [resets, setResets] = React.useState([])
        const [saving, setSaving] = React.useState(false)
        const [invalid, setInvalid] = React.useState(false)
        const edit = (field, next) => { setDrafts({ ...drafts, [field.key]: next }); setResets(resets.filter((key) => key !== field.key)); setInvalid(false) }
        const reset = (field) => {
          const next = { ...drafts }
          delete next[field.key]
          setDrafts(next)
          setResets([...new Set([...resets, field.key])])
          setInvalid(false)
        }
        const submit = async (body = null) => {
          const values = {}
          if (body === null) {
            for (const field of fields) {
              if (!Object.hasOwn(drafts, field.key)) continue
              // An empty secret field means "keep the stored secret".
              if (field.kind === FIELD_KIND.secret && drafts[field.key] === '') continue
              const next = fieldValue(field, drafts[field.key])
              if (next === undefined) { setInvalid(true); return }
              setAt(values, field.path, next)
            }
          }
          const resetPaths = body?.reset ?? resets.map((key) => JSON.parse(key))
          if (Object.keys(values).length === 0 && resetPaths.length === 0) { setDrafts({}); return }
          setSaving(true)
          const saved = await onSave({ ...(Object.keys(values).length > 0 ? { values } : {}), ...(resetPaths.length > 0 ? { reset: resetPaths } : {}) })
          setSaving(false)
          if (saved) { setDrafts({}); setResets([]) }
        }
        const dirty = Object.keys(drafts).length > 0 || resets.length > 0
        // The Host names the failing field's path, which can lie inside a field (a list item): the field containing it is marked (review L7).
        const isInvalid = (field) => invalidPath !== undefined && field.path.every((key, index) => invalidPath[index] === key)
        return h(React.Fragment, null,
          h('div', { className: MCLS.fields }, fields.map((field) => h(SettingsField, {
            key: field.key,
            field,
            id: `${baseId}-${field.key}`,
            value,
            secrets,
            draft: drafts[field.key],
            changed: Object.hasOwn(drafts, field.key) || (valueAt(user, field.path) !== undefined && !resets.includes(field.key)),
            invalid: isInvalid(field),
            disabled: saving || disabled,
            onEdit: (next) => edit(field, next),
            onReset: () => reset(field),
          }))),
          invalid ? h('div', { role: 'alert' }, t('settingsInvalid')) : null,
          h('div', { className: MCLS.formActions },
            resetAll ? h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: saving || disabled, onClick: () => void submit({ reset: [[]] }) }, t('settingsResetAll')) : null,
            accentButton({ size: 'sm', disabled: saving || disabled || !dirty, onClick: () => void submit() }, saving ? t('saving') : t('save'))))
      }

      return { formFields, SchemaForm }
    }

    /**
     * The child's settings (§9): the namespaces its own settings service describes, drawn with
     * the shared schema form. Save sends the namespace revision and field-path ops only, so a
     * stale revision is refused instead of overwriting another writer; a stale refusal reloads.
     */
    function makeChildSettings(t, resolveText) {
      const { SchemaForm } = makeSchemaForm(t, resolveText)

      function NamespaceForm({ entry, t, onSaved, onStale }) {
        const [problem, setProblem] = React.useState(null)
        const [message, setMessage] = React.useState(null)
        const save = async ({ values = {}, reset = [] }) => {
          const ops = valueOps(values)
          for (const path of reset) if (path.length > 0) ops.push({ op: 'unset', path })
          if (ops.length === 0) return true
          setProblem(null)
          setMessage(null)
          const answer = await adminRequest('settingsMutate', { ns: entry.ns, revision: entry.revision, ops })
          if (answer.ok) { setMessage('adminSettingsSaved'); onSaved(answer.result.revision); return true }
          if (answer.error.code === 'stale-revision') { onStale(); return false }
          setProblem(answer.error)
          return false
        }
        return h('div', { className: MCLS.section, 'data-fishball-child-namespace': entry.ns },
          h('h4', { className: MCLS.sectionTitle }, entry.ns),
          entry.autoGenerate ? h('p', { className: MCLS.hint }, t('adminSettingsAuto')) : null,
          // The admin reports only {"set"} for a secret; stored is what the field's Clear action asks for.
          h(SchemaForm, { schema: entry.schema, value: entry.value, secrets: entry.secrets.map((secret) => ({ ...secret, stored: secret.set })), user: {}, resetAll: false, onSave: save }),
          h(AdminProblem, { error: problem, t }),
          message ? h('p', { role: 'status', className: MCLS.hint }, t(message)) : null)
      }

      return function FishballChildSettings() {
        const [view, setView] = React.useState({ loading: true, writable: false, namespaces: [], error: null })
        const [reloads, setReloads] = React.useState(0)
        const [notice, setNotice] = React.useState(null)
        const load = React.useCallback(async () => {
          setView((previous) => ({ ...previous, loading: true }))
          const answer = await adminRequest('settingsGet')
          if (!answer.ok) { setView((previous) => ({ ...previous, loading: false, error: answer.error })); return }
          setView({ loading: false, writable: answer.result.writable, namespaces: answer.result.namespaces, error: null })
        }, [])
        React.useEffect(() => { void load() }, [load, reloads])
        const update = (ns, revision) => setView((previous) => ({ ...previous, namespaces: previous.namespaces.map((entry) => (entry.ns === ns ? { ...entry, revision } : entry)) }))
        const stale = () => { setNotice('adminSettingsStale'); setReloads((count) => count + 1) }
        return h('section', { className: CLS.section, 'data-fishball-child-settings': true },
          h('h3', null, t('adminSettingsTitle')),
          h('p', { className: CLS.muted }, t('adminSettingsHint')),
          view.loading ? h('p', { role: 'status' }, t('adminLoading')) : null,
          h(AdminProblem, { error: view.error, t }),
          !view.loading && view.error === null && view.writable === false ? h('p', { role: 'status', className: CLS.muted }, t('adminSettingsReadOnly')) : null,
          !view.loading && view.error === null && view.writable && view.namespaces.length === 0 ? h('p', { className: CLS.muted }, t('adminSettingsNone')) : null,
          view.writable ? view.namespaces.map((entry) => h(NamespaceForm, { key: entry.ns, entry, t, onSaved: (revision) => { setNotice(null); update(entry.ns, revision) }, onStale: stale })) : null,
          notice ? h('p', { role: 'status', className: CLS.muted }, t(notice)) : null,
          h('div', { className: CLS.row },
            h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: view.loading, onClick: () => { setNotice(null); setReloads((count) => count + 1) } }, t('refresh'))))
      }
    }

    /** One read of the native status route; failures stay local to the caller. */
    async function nativeStatus(signal) {
      let next = { state: NATIVE_UI.unavailable, code: null }
      try {
        const response = await fetch(apiUrl(NATIVE_UI.statusPath), { ...NATIVE_UI.request, signal })
        if (response.ok) {
          const value = await response.json()
          if (NATIVE_UI.states.includes(value?.state) &&
              (value.state !== NATIVE_UI.ready || value.enabled === true)) next = { state: value.state,
                code: NATIVE_UI.codes.includes(value.code) ? value.code : null }
        }
      } catch { /* Missing native plugin, authorization and network failures stay local to the caller. */ }
      return next
    }

    /**
     * Status and restart of the isolated Fishball (§9), through the admin relay. The state and
     * code are the host's safe vocabulary; nothing else about the child is shown (§11).
     */
    function makeNativeSettings(t) {
      return function FishballNativeSettings() {
        const [view, setView] = React.useState({ loading: true, state: NATIVE_UI.loading, code: null, error: null })
        const [busy, setBusy] = React.useState(false)
        const load = React.useCallback(async () => {
          setView((previous) => ({ ...previous, loading: true, error: null }))
          const answer = await adminRequest('status')
          if (answer.ok) setView({ loading: false, state: answer.result.state, code: answer.result.code ?? null, error: null })
          else setView({ loading: false, state: NATIVE_UI.unavailable, code: null, error: answer.error })
          nativeState.set(answer.ok ? answer.result.state : NATIVE_UI.unavailable)
        }, [])
        React.useEffect(() => { void load() }, [load])
        const restart = async () => {
          setBusy(true)
          const answer = await adminRequest('restart')
          setBusy(false)
          if (answer.ok) setView({ loading: false, state: answer.result.state, code: answer.result.code ?? null, error: null })
          else setView((previous) => ({ ...previous, loading: false, error: answer.error }))
          if (answer.ok) nativeState.set(answer.result.state)
        }
        return h('div', { className: CLS.section, 'data-fishball-native': true },
          h('h3', null, t('nativeTitle')),
          h('p', { className: CLS.muted }, t('nativeHint')),
          view.loading ? h('p', { role: 'status' }, t('native.loading'))
            : h('p', { role: 'status', 'aria-live': 'polite' }, t('native.' + view.state)),
          view.code ? h('p', { className: CLS.code }, view.code) : null,
          h(AdminProblem, { error: view.error, t }),
          h('div', { className: CLS.row },
            h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy || view.loading, onClick: () => void load() }, t('nativeRefresh')),
            h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: busy || view.loading, onClick: () => void restart() }, busy ? t('adminRestarting') : t('adminRestart'))),
          h('p', { className: CLS.muted }, t('adminStatusHint')))
      }
    }

    /**
     * The Fishball view (§7): the child page framed through the main origin, in DSH's main area
     * where a session's conversation shows (the `main` slot, keyed by EMBED_UI.panelId). DSH swaps
     * it out when you open a session and back in when you select Fishball, so it has no Close.
     * The iframe URL is constant and carries no token; the header reloads the frame or opens that
     * same document in a tab. A child that is not ready shows its safe state, code and a Retry that
     * calls the lifecycle restart service through the broker; it never falls back to legacy chat.
     */
    function makeFishballView(t) {
      return function FishballView() {
        const [status, setStatus] = React.useState({ state: NATIVE_UI.loading, code: null })
        const [generation, setGeneration] = React.useState(0)
        const [retrying, setRetrying] = React.useState(false)
        // DSH mounts this only while the view is selected, so each visit reads the status afresh.
        React.useEffect(() => {
          const abort = new AbortController()
          setStatus({ state: NATIVE_UI.loading, code: null })
          void nativeStatus(abort.signal).then((next) => { if (!abort.signal.aborted) setStatus(next) })
          // B8: a child that exits while the view is open must not leave the bar at Ready. The poll
          // keeps the previous object when nothing changed, so a steady state re-renders nothing,
          // and one read at a time is in flight.
          let polling = false
          const timer = setInterval(() => {
            if (polling || document.hidden) return
            polling = true
            void nativeStatus(abort.signal).then((next) => {
              if (!abort.signal.aborted) setStatus((previous) => (previous.state === next.state && previous.code === next.code ? previous : next))
            }).finally(() => { polling = false })
          }, NATIVE_UI.pollMs)
          return () => { clearInterval(timer); abort.abort() }
        }, [generation])
        const loading = status.state === NATIVE_UI.loading
        const ready = status.state === NATIVE_UI.ready
        const retry = async () => {
          setRetrying(true)
          try { await fetch(EMBED_UI.document, EMBED_UI.retry) } catch { /* The status probe below reports the state. */ }
          const next = await nativeStatus()
          setRetrying(false)
          setStatus(next)
        }
        const body = loading
          ? h('div', { className: CLS.embedError }, h('p', { role: 'status' }, t('native.loading')))
          : ready
            ? h('iframe', { key: generation, className: CLS.embedFrame, src: EMBED_UI.document, title: t('embedTitle'), allow: 'clipboard-write', 'data-fishball-embed-frame': true })
            : h('div', { className: CLS.embedError },
              h(IconWarningOutlineRegular, { size: EMBED_UI.warningIconPx, className: CLS.embedGlyph }),
              h('p', { role: 'alert' }, t('embedUnavailable')),
              h('p', null, t('embedState'), ' ', h('code', { className: CLS.code }, status.state)),
              status.code ? h('p', null, t('embedCode'), ' ', h('code', { className: CLS.code }, status.code)) : null,
              accentButton({ disabled: retrying, onClick: () => void retry() }, retrying ? t('native.starting') : t('embedRetry')))
        return h('section', { className: CLS.embed, 'aria-label': t('viewTitle'), 'data-fishball-embed': true },
          h('header', { className: CLS.embedBar, 'data-window-drag': true },
            h('span', { className: CLS.embedName }, t('viewTitle')),
            // DSH's Tag takes no data attributes, so the state's hook sits on a wrapper.
            h('span', { 'data-fishball-embed-state': status.state }, h(Tag, { tone: EMBED_UI.stateTone[status.state] ?? EMBED_UI.neutralTone }, t('native.' + status.state))),
            h('div', { className: CLS.embedActions },
              h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: loading || retrying, onClick: () => setGeneration((value) => value + 1) }, t('embedRefresh')),
              h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: !ready, onClick: () => { window.open(EMBED_UI.document, EMBED_UI.target, EMBED_UI.features) } }, t('embedOpenTab')))),
          body)
      }
    }

    /** Open the Fishball view in DSH's main area, as selecting a session would; nothing when DSH has no layout service. */
    function openFishballView(ctx) {
      ctx.get(SERVICE.layout)?.selectPanel(EMBED_UI.panelId)
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
    /**
     * The isolated Fishball's last known state (NATIVE_UI.states), published by the status block
     * and read by the model block's Refresh models; null until the first status read.
     */
    const nativeState = valueStore(null)
    const useNativeState = () => React.useSyncExternalStore(nativeState.subscribe, nativeState.get)

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
        h(Icon, { size: MANAGED_ROW.iconPx, unread: false, moving: running }),
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

    /** POST your answer on a question card. @returns null when accepted, else the refusal's text. */
    async function answerQuestionCard(questionId, body, t) {
      const { ok, code, answer } = await send(API.questionsAnswer, { questionId, ...body })
      if (ok) return null
      return QUESTION_ERRORS.has(code) ? t('questionError.' + code, { reason: answer?.reason ?? '' }) : t('cardFailed')
    }

    /**
     * Who answers managed sessions' questions (item 25, §10e): Auto, Fishball or You, in the
     * Permission requests section. The choice is the Host's (snapshot `questionMode`).
     */
    function QuestionMode({ state, t }) {
      const [busy, setBusy] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const mode = state.questionMode
      if (typeof mode !== 'string') return null
      const choose = async (next) => {
        setBusy(true)
        const { ok } = await send(API.questionMode, { mode: next })
        setFailed(!ok)
        setBusy(false)
      }
      return h('div', { 'data-fishball-question-mode': mode },
        h('h4', null, t('questionMode')),
        h('p', { className: CLS.muted }, t('questionModeHint')),
        h('div', { className: CLS.actions, role: 'radiogroup', 'aria-label': t('questionMode') }, QUESTION_VIEW.modes.map((option) => h(Button, {
          key: option, type: 'button', size: 'sm', variant: option === mode ? 'primary' : 'secondary', role: 'radio', 'aria-checked': option === mode, disabled: busy,
          onClick: () => { if (option !== mode) void choose(option) },
        }, t('questionMode.' + option)))),
        h('p', { className: CLS.muted }, t('questionModeHint.' + mode)),
        failed ? h('div', { role: 'alert' }, t('questionModeFailed')) : null)
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
     * The card record (src/slim/card-record.js; keep CARD_RECORD in step with it): a plugin record
     * DSH sends to the browser but never to the model. One conversation definition turns each record
     * into a chat node at its own place in the log, in a managed session's view and in Fishball's
     * (both are DSH's own session view), and the node is DSH's collapsed DisclosureRow: one line
     * with the kind, the outcome, who and when; expanded, the questions or the call, the answer and
     * the note. No new chat primitive: DSH's own row, its own icons and the existing fb-* classes.
     */
    const CARD_RECORD = Object.freeze({ type: 'plugin:fishball/card-record', version: 1, kind: 'fishball-card-record', node: 'fishball-card-record', permission: 'permission', iconPx: 14, separator: ' · ' })
    /** Who and where, as one phrase: "You · on the card", or "Fishball". A closure names no one. */
    const recordWho = (record, t) => record.by === undefined ? '' : [t('record.by.' + record.by), ...(record.place === undefined ? [] : [t('record.place.' + record.place)])].join(' ')
    const cardRecordDefinition = Object.freeze({
      kind: CARD_RECORD.kind,
      target: 'chat',
      match: (event) => event.type === CARD_RECORD.type && event.data?.v === CARD_RECORD.version && typeof event.data.id === 'string' ? { id: event.data.id, role: 'start' } : null,
      start: (_context, match) => ({ seq: match.event.seq, record: match.event.data }),
      update: (context) => context.state,
      // Outside the turn's process group ("turn"), so a record written while the turn runs is not
      // folded into its tool-call steps; at the record's own seq, so it reads where the card ended.
      buildViewNode: (context) => context.state === undefined ? null : {
        key: context.key, kind: CARD_RECORD.node, id: context.id, target: 'chat', anchorSeq: context.state.seq,
        location: context.start?.location ?? { kind: 'unresolved' }, visibility: 'visible', groupTree: 'turn', data: context.state.record,
      },
    })
    function makeCardRecordView(t) {
      return function FishballCardRecord({ node }) {
        const record = node.data
        const [open, setOpen] = React.useState(false)
        const questions = Array.isArray(record.questions) ? record.questions : []
        const first = questions[0]
        const title = record.own === true ? t('record.own') : t('record.' + record.kind)
        const line = [
          record.kind === CARD_RECORD.permission ? record.tool : first?.header || first?.question,
          t('record.outcome.' + record.outcome) + (record.answer ? ': ' + record.answer : ''),
          recordWho(record, t),
          new Date(record.at).toLocaleString(),
        ].filter(Boolean).join(CARD_RECORD.separator)
        const from = record.from === undefined ? null : labelled(t('record.from'), record.from.title || record.from.sessionId)
        return h(DisclosureRow, {
          icon: h(record.kind === CARD_RECORD.permission ? IconShieldOutlineRegular : IconQuestionOutlineRegular, { size: CARD_RECORD.iconPx }),
          title, collapsedContent: h('span', { className: CLS.muted }, CARD_RECORD.separator + line),
          open, expandable: true, expandOnRowClick: true, onToggle: () => setOpen((value) => !value),
        }, h('div', { className: CLS.recordBody, 'data-fishball-card-record': record.cardId },
          from,
          ...questions.map((item, index) => h('div', { key: index },
            h('div', null, item.header ? item.header + ': ' + item.question : item.question),
            Array.isArray(item.options) && item.options.length > 0 ? h('div', { className: CLS.muted }, item.options.join(CARD_RECORD.separator)) : null)),
          record.tool ? labelled(t('record.tool'), record.tool) : null,
          record.arguments ? h('pre', { className: CLS.pre, 'aria-label': t('record.arguments') }, record.arguments) : null,
          record.reason ? labelled(t('record.reason'), record.reason) : null,
          record.answer ? labelled(t('record.answer'), record.answer) : null,
          record.note ? labelled(t('record.note'), record.note) : null,
          record.closed ? labelled(t('record.closed'), record.closed) : null))
      }
    }

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

    /** Settings: switch the sidebar back to DeepSeek's icon and word logo (your choice, stored by the Host). */
    function makeBrandStyle(t) {
      return function FishballBrandStyle() {
        const state = useFishball()
        const [failed, setFailed] = React.useState(false)
        const deepseek = brandStyleOf(state) === BRAND_STYLE.deepseek
        const panel = sidebarEntryOf(state) === SIDEBAR_ENTRY.panel
        const choose = async (on) => setFailed(!(await post(API.brand, { style: on ? BRAND_STYLE.deepseek : BRAND_STYLE.fishball })))
        const chooseEntry = async (on) => setFailed(!(await post(API.sidebarEntry, { entry: on ? SIDEBAR_ENTRY.panel : SIDEBAR_ENTRY.brand })))
        return h('div', { className: CLS.section, 'data-fishball-brand-style': brandStyleOf(state), 'data-fishball-sidebar-entry': sidebarEntryOf(state) },
          h('h3', null, t('brandStyle')),
          h('p', { className: CLS.muted }, t('brandStyleHint')),
          h('div', { className: CLS.row },
            h('span', { className: CLS.grow }, t('brandStyleDeepseek')),
            h(Switch, { checked: deepseek, label: t('brandStyleDeepseek'), onChange: choose })),
          h('h3', null, t('sidebarEntry')),
          h('p', { className: CLS.muted }, t('sidebarEntryHint')),
          h('div', { className: CLS.row },
            h('span', { className: CLS.grow }, t('sidebarEntryPanel')),
            h(Switch, { checked: panel, label: t('sidebarEntryPanel'), onChange: chooseEntry })),
          failed ? h('div', { role: 'alert' }, t('changeFailed')) : null)
      }
    }

    /** DSH's staged form over the row's live config; Save writes through ctx.settings. */
    function limitsSection(scope) {
      const form = new SettingsFormModel(scope, LIMIT_FIELDS.map((field) => settingsNumberField(field)))
      const store = form.bind(() => ({ ...form.shell(), fields: Object.fromEntries(LIMIT_FIELDS.map((field) => [field, form.field(field)])) }))
      return { store, actions: form.actions(), dispose: () => form.dispose() }
    }

    /**
     * Fishball's whole settings page (§9): the isolated child's status and restart, model (whose
     * Refresh models also syncs providers from DSH, §10), plugins and settings, the brand switch and Fishball's own
     * limits.
     */
    function makeSettingsPage(section, NativeSettings, ModelSettings, ChildPlugins, ChildSettings, BrandStyle, t) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballSettings(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        // The question mode is the one decision setting left on this page: the audit list that
        // sat under it became inline labels in Fishball's chat (T08, §8.1). Its state is the
        // live Fishball feed, not this form's, so the switch also works while the form is locked.
        const fishball = useFishball()
        const baseId = React.useId()
        if (props.view === SUMMARY_VIEW) return null
        const disabled = !state.writable || state.saving
        return h(React.Fragment, null,
          h(NativeSettings),
          h(ModelSettings),
          h(ChildPlugins),
          h(ChildSettings),
          h(BrandStyle),
          h('div', { className: CLS.section }, h(QuestionMode, { state: fishball, t })),
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
          })))
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
      ctx.effect(() => ctx.slots.inject(SLOT.main, () => ctx.slots.register({ name: SLOT.main, key: EMBED_UI.panelId, locale: NS }, makeFishballView(t))), 'fishball: main view')
      ctx.effect(() => followSidebarEntry(ctx, makeMark(t), t), 'fishball: sidebar row')
      // The managed-session marks (§8.2) and the ask_fishball row with your Allow once / Reject (S37).
      ctx.effect(() => ctx.slots.inject(SLOT.rowLeading, () => ctx.slots.register({ name: SLOT.rowLeading, id: MANAGED_ROW.id, locale: NS }, makeManagedRowMark(t))), 'fishball: managed row mark')
      // 0.2.2 keeps a row's trailing seat mounted while it runs; rc.3 has no such seat and this waits.
      ctx.effect(() => ctx.slots.inject(SLOT.rowTrailing, () => ctx.slots.register({ name: SLOT.rowTrailing, id: MANAGED_ROW.id, locale: NS }, makeManagedRowRunningMark(t))), 'fishball: managed row running mark')
      ctx.effect(() => ctx.slots.inject(SLOT.toolview, () => ctx.slots.register({ name: SLOT.toolview, key: ASK_ROW.tool, locale: NS }, makeAskRow(t))), 'fishball: ask_fishball row')
      // Card records in any DSH session view; read on demand, so an older DSH without the service keeps working.
      ctx.inject(['uiConversation'], (scope) => {
        scope.effect(() => scope.uiConversation.events.register(cardRecordDefinition), 'fishball: card record definition')
      })
      ctx.effect(() => ctx.slots.inject(SLOT.chatNode, () => ctx.slots.register({ name: SLOT.chatNode, key: CARD_RECORD.node, locale: NS }, makeCardRecordView(t))), 'fishball: card record row')
      ctx.effect(() => {
        const section = limitsSection(ctx.configForms.get(ENTRY_ID))
        const Settings = makeSettingsPage(section, makeNativeSettings(t), makeModelSettings(t), makeChildPlugins(t), makeChildSettings(t, (text) => ctx.locale.resolveText(text)), makeBrandStyle(t), t)
        const stopServing = ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject(SLOT.bundleConfig, () => ctx.slots.register({ name: SLOT.bundleConfig, key: PACKAGE_NAME, locale: NS }, Settings)))
        return () => { stopServing(); section.dispose() }
      }, 'fishball: settings page')
    }
    return module.exports
  },
})