/**
 * Fishball browser half (DESIGN §10).
 *
 * 1. Brand: fills sidebar.brand.mark / sidebar.brand.name at slot priority -1 (a single
 *    slot renders its LOWEST priority; the shipped brand uses 0 — spike S14). The name
 *    occupant takes over its enclosing button's click (capture phase, so it runs before
 *    the shell's New Session handler) and opens the assistant session. On macOS Desktop
 *    the brand row is a drag region without a button; there Fishball opens from its
 *    pinned session and its Plugins page.
 * 2. Settings live on Fishball's own page under Plugins (owner's choice, P2): the
 *    page's `plugins.bundle.config` entry shows status and recovery actions, the live
 *    limits form (DSH's staged settings form; the Host schema decides validity) and the
 *    tools Fishball never uses. There is no separate settings panel.
 * 3. Header action in Fishball's own session: opens that Plugins page.
 * 4. Fishball's own session row is hidden from the sidebar's session list; the brand opens it.
 * 5. The Messenger look (DESIGN §10c): while the Host reports `look.messenger`, this half loads
 *    the dsh-fishball-messenger package's browser file from the Host and mounts it as a child
 *    plugin; it is disposed when the look is turned off. DSH serves browser halves only for
 *    host rows, and the messenger package has none (spike S24).
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
    const { createPortal } = require('react-dom')
    const { BrandWordmark, Button, FISH_LOGO_PATH, FISH_LOGO_VIEWBOX, IconChevronLeftOutlineRegular, IconCloseOutlineRegular, IconLoadingOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular, Input, MenuItemButton, Modal, PluginArtworkDefault, PluginArtworkSearch, PluginArtworkTerminal, SettingsForm, SettingsFormModel, SettingsSecretField, SettingsValueField, Switch, Tag, settingsNumberField } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const PACKAGE_NAME = 'dsh-fishball'
    /** Host row id; also the settings namespace configForms serves (cordis.patch.yml). */
    const ENTRY_ID = 'fishball'
    const NS = 'fishball'
    const BRAND_PRIORITY = -1
    const HEADER_ACTION_ORDER = 5
    /** Plugins page main-panel id (dsh-client-ui-plugin-manager PANEL_ID) and its navigation service. */
    const PLUGINS_PANEL = 'plugins'
    /** Client services read on demand (not injected: Fishball works without each of them). */
    const SERVICE = Object.freeze({ pluginNavigation: 'pluginNavigation', layout: 'layout', uiWorkspace: 'uiWorkspace', remote: 'remote' })
    const SUMMARY_VIEW = 'summary'
    const HEADER_ACTION_ID = 'fishball-settings'
    /** Renders nothing: while mounted for Fishball's session, that chat is on screen (see ReadReporter). */
    const READ_HEADER = Object.freeze({ id: 'fishball-read', order: 6 })
    /** Host statuses (src/constants.js STATUS) and the recovery actions each one offers. */
    const STATUS = Object.freeze({ starting: 'starting', live: 'live', recovery: 'recovery', archived: 'archived', stopped: 'stopped', failed: 'failed' })
    /** Fishball's own feature plugins in the snapshot's `features` (src/builtins.js FEATURE_KEY; revision 10c). */
    const FEATURE = Object.freeze({ messages: 'messages', watching: 'watching' })
    /** Whether a feature runs; a Host without the field (older) shows everything, as before. */
    const featureOn = (state, feature) => state.features?.[feature] !== false
    const ACTION = Object.freeze({ retry: 'retry', adopt: 'adopt' })
    const OFFERED = Object.freeze({
      [STATUS.recovery]: Object.freeze([ACTION.retry, ACTION.adopt]),
      [STATUS.archived]: Object.freeze([ACTION.retry]),
      [STATUS.stopped]: Object.freeze([ACTION.retry]),
    })
    const API = Object.freeze({ events: 'api/fishball/events', recovery: 'api/fishball/recovery', plugins: 'api/fishball/plugins', pluginsRemove: 'api/fishball/plugins/remove', toolApprovals: 'api/fishball/tool-approvals/remove', contextWindow: 'api/fishball/context-window', send: 'api/fishball/send', watches: 'api/fishball/watches', watchesRemove: 'api/fishball/watches/remove', read: 'api/fishball/read', brand: 'api/fishball/brand', welcomeSeen: 'api/fishball/welcome/seen', model: 'api/fishball/model', models: 'api/fishball/models', messengerClient: 'api/fishball/messenger/client.js', pluginsDetail: 'api/fishball/plugins/detail', pluginsIcon: 'api/fishball/plugins/icon', pluginsSettings: 'api/fishball/plugins/settings', pluginsRefresh: 'api/fishball/plugins/refresh', installInspect: 'api/fishball/install/inspect', install: 'api/fishball/install', installCancel: 'api/fishball/install/cancel', managed: 'api/fishball/managed', requestsAnswer: 'api/fishball/requests/answer', grantsRevoke: 'api/fishball/grants/revoke', questionsAnswer: 'api/fishball/questions/answer', questionMode: 'api/fishball/question-mode' })
    /** The Messenger look's module id: its browser file registers it with DSH's module system. */
    const MESSENGER_MODULE = 'dsh-fishball-messenger'
    /** "Tell Fishball when finished" entries (after Send to Fishball) and refusals with text (src/constants.js WATCH_ERROR). */
    const WATCH_MENU = Object.freeze({ id: 'fishball-watch', order: 425 })
    const WATCH_HEADER = Object.freeze({ id: 'fishball-watch', order: 3 })
    const WATCH_ERRORS = new Set(['unknown-session', 'archived', 'is-fishball', 'limit-reached', 'unknown-watch', 'unavailable'])
    const WATCH_ACTIVE = 'active'
    const WATCH_BY_USER = 'user'
    /** "Send to Fishball" refusals with their own text (keep in step with src/constants.js INTAKE_ERROR). */
    const SEND_ERRORS = new Set(['queue-full', 'too-large', 'from-fishball', 'unknown-session', 'unavailable'])
    /** Session-row menu entry and its place (after DSH's own pin/rename/fork/archive, before the id). */
    const SEND_MENU = Object.freeze({ id: 'fishball-send', order: 420 })
    const SEND_HEADER_ID = 'fishball-send'
    /** Just before Fishball's own settings action. */
    const SEND_HEADER_ORDER = 4
    /** Hand over to Fishball / Take back from Fishball, beside Send to Fishball (DESIGN §10e, S37), and refusals with text (src/constants.js MANAGED_ERROR). */
    const MANAGE_MENU = Object.freeze({ id: 'fishball-manage', order: 422 })
    const MANAGE_HEADER = Object.freeze({ id: 'fishball-manage', order: 4.5 })
    const MANAGE_ERRORS = new Set(['unknown-session', 'is-fishball', 'feature-off', 'unavailable'])
    const PROVIDER_SYNC_UI = Object.freeze({ path: '/api/fishball/provider-sync', mask: '••••••••',
      groups: Object.freeze(['add', 'existsSkip', 'conflictSkip', 'unsupported']),
      invitationRows: 3, inactive: 'inactive', pendingSource: 'pendingSource', pendingTarget: 'pendingTarget', paired: 'paired',
    })
    /** The two context-window settings (src/constants.js API.contextWindow body). */
    const CONTEXT_FIELDS = Object.freeze(['contextWindowTokens', 'maxOutputTokens'])
    /** Fishball's explicit model choice is independent of the host's last-used/default route. */
    const MODEL = Object.freeze({
      gateId: 'fishball-model-required', gateOrder: -50, styleId: 'fishball-model-seat',
      settingsClass: 'fb-model-settings', gateClass: 'fb-model-gate', empty: '',
      fieldSuffix: '-model', effortSuffix: '-effort', pickerClass: 'fb-model-picker',
      request: Object.freeze({ cache: 'no-store' }), routeSeparator: '/', refreshStart: 0, refreshStep: 1,
      seatSelector: (id) => `[data-conversation-session="${CSS.escape(id)}"] > [data-conversation-scroll] > [data-composer-seat] [data-slot="conversation.input.model"]`,
    })
    /** Context-window refusals with their own text (keep in step with src/constants.js CONTEXT_ERROR). */
    const CONTEXT_ERRORS = new Set(['window-too-small', 'output-too-large', 'model-window-unknown'])
    const WHOLE_NUMBER = /^[1-9][0-9]*$/
    /** Host tool statuses (src/constants.js TOOL_STATUS) shown as tags, and the plugin kinds. */
    const TOOL_STATUS = Object.freeze({ visible: 'visible', hidden: 'hidden', pluginOff: 'plugin-off', unchecked: 'unchecked', otherSessions: 'other-sessions' })
    /** Tag tones used by DSH's own plugin page (neutral, info, danger). */
    const TAG_TONE = Object.freeze({ [TOOL_STATUS.unchecked]: 'danger', [TOOL_STATUS.hidden]: 'neutral', [TOOL_STATUS.pluginOff]: 'neutral' })
    /**
     * Plugin diagnostics with their own text; any other code shows the generic one. A separate
     * client bundle cannot import the host's list: keep it in step with src/constants.js PLUGIN_ERROR.
     */
    const PLUGIN_ERRORS = new Set(['edits-other-rows', 'no-rows', 'row-failed', 'leaks-service', 'no-profile', 'row-id-conflict', 'limit-reached', 'remove-failed'])
    /** A plugin diagnostic in words: its own text when it has one, else the generic one. */
    const pluginErrorText = (t, code) => (PLUGIN_ERRORS.has(code) ? t('pluginError.' + code) : t('pluginErrorOther'))
    /**
     * Plugin actions the Host offers per plugin (src/constants.js PLUGIN_OFFER). The Host decides
     * which actions a plugin has; the page shows only those.
     */
    const PLUGIN_OFFER = Object.freeze({ enable: 'enable', disable: 'disable', uninstall: 'uninstall' })
    /**
     * Install for Fishball (DESIGN §10d revision 10a): refusals with their own text (src/constants.js
     * PACKAGE_ERROR, API_CODE), DSH's inspection problems (dsh-plugin-manager PluginInspectProblem),
     * and DSH's install events, which carry the request id the dialog chose.
     */
    const INSTALL_ERRORS = new Set(['too-large', 'invalid-spec', 'already-installed', 'not-bundle', 'ambiguous-install', 'incompatible-version', 'cancelled', 'build-blocked', 'operation-error', 'no-profile', 'unavailable'])
    const INSPECT_PROBLEMS = new Set(['invalid-spec', 'already-installed', 'not-found', 'not-a-package', 'not-a-bundle', 'network', 'unknown'])
    const INSTALL_EVENT = Object.freeze({ state: 'plugin-manager/install-state', log: 'plugin-manager/install-log' })
    const INSPECT_ACCEPTED = 'accepted'
    /**
     * DSH's inspect in Fishball's scope answers `already-installed` for a name the DSH installation
     * ships (its view is Fishball's folder plus the installation, never DSH's profile): Fishball can
     * still install its own copy (review M5). A name installed in DSH's profile is read from the catalog.
     */
    const INSPECT_SHIPPED = 'already-installed'
    /** DSH's inspection kind of a registry name (the other kinds name a folder or a host). */
    const SPEC_KIND_REGISTRY = 'registry'
    /** DSH's cancel answer once its install is applying. */
    const CANCEL_TOO_LATE = 'too-late'
    /** The phase in which DSH's install asks registries in turn (its `attempt` counts them). */
    const INSTALL_PHASE_INSTALLING = 'installing'
    const BUILD_BLOCKED = 'build-blocked'
    /** The dialog's screens, in DSH's order: the spec, its check, the confirmation, progress, the result. */
    const INSTALL_STEP = Object.freeze({ edit: 'edit', checking: 'checking', confirm: 'confirm', installing: 'installing', done: 'done', failed: 'failed' })
    /** The newest output lines the progress screen keeps. */
    const INSTALL_LOG_LINES = 200
    /** Where the dialog was opened: the Fishball tab can open the new plugin's page, DSH's menu cannot (S28). */
    const INSTALL_FROM = Object.freeze({ tab: 'tab', menu: 'menu', settings: 'settings' })
    const VISIBLE = 'visible'
    const VISIBILITY_EVENT = 'visibilitychange'
    /** Brand icon choices (src/constants.js BRAND_STYLE). */
    const BRAND_STYLE = Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' })
    const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' })
    const SLOT = Object.freeze({
      mark: 'sidebar.brand.mark',
      name: 'sidebar.brand.name',
      bundleConfig: 'plugins.bundle.config',
      headerActions: 'conversation.session.header.actions',
      sessionMenu: 'sidebar.workspaces.session.menu.item',
      overlay: 'shell.overlay',
      /** DSH's Plugins page (dsh-client-ui-plugin-manager): a page tab, and a tag and an action on each plugin's page (spike S28). */
      pluginsTab: 'plugins.tab',
      detailBadge: 'plugins.detail.badge',
      detailActions: 'plugins.detail.actions',
      /** DSH's Add plugin menu: plugin-contributed items after its own (revision 10a). */
      addActions: 'plugins.add.actions',
      /** Revision 11 (S37): the pile above a session's composer, a tool's whole row by its name, and a turn's tail. */
      dock: 'conversation.input.dock',
      toolview: 'tool.call.toolview',
      turnTail: 'conversation.chat.turnTail',
      /** DSH's 16px cell before a session row's title, mounted only while the row is idle (dsh-client-ui-workspace, rc.2). */
      rowLeading: 'sidebar.session.row.leading',
    })
    /**
     * Your pile (DESIGN §10e, S37): a dock entry above Fishball's composer. Its order puts it
     * before DSH's own docks, as in S37's fixture (the order beside DSH's Todo and Queue docks
     * was not checked there).
     */
    // fill: the pile's background, shared by its pinned title rows, which must be opaque or the
    // cards scrolling under them show through (rev11-ui-fixes R1).
    const PILE = Object.freeze({ id: 'fishball-pile', order: -100, heightUnit: 'vh', fill: 'var(--dsw-alias-bg-layer-1)', requestsExpanded: true, grantsExpanded: false, chevronPx: 14, expandedRotationDeg: -90, collapsedRotationDeg: -180 })
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
    // The pile matches the composer card itself, not the narrower Todo/Queue panels. Constrain
    // Reveal's outer box: a width on its inner section would resolve against the wrong containing box.
    const PILE_DOCK_WIDTH = dockCardWidth(DSH_COMPOSER.cardInsets)
    /**
     * The managed-session banner (DESIGN §10e item 30): a dock entry in a managed session's chat.
     * Order 10 puts it after DSH's Todo dock (0) and before its Queue dock (20) (the builder's
     * choice, per the Reading): the Queue dock must stay last, because its negative bottom
     * margin tucks it into the composer card and would overlap anything placed between them.
     * Sizes are in px.
     */
    const MANAGED_BANNER = Object.freeze({ id: 'fishball-managed', order: 10, iconPx: 16, gapPx: 8, paddingYPx: 4, paddingStartPx: 12, paddingEndPx: 4, fontPx: 13 })
    /**
     * The one-time welcome card (DESIGN §10f, revision 12): a dock entry in Fishball's chat. Order
     * −200 puts it at the top of the composer area, above your pile (−100), as you chose
     * (Q-rec-card-place). Sizes are in px.
     */
    const WELCOME = Object.freeze({ id: 'fishball-welcome', order: -200, iconPx: 16, closeIconPx: 14, gapPx: 6, headGapPx: 8, paddingYPx: 8, paddingStartPx: 12, paddingEndPx: 4, fontPx: 13 })
    /** Recommended plugins on the settings page (DESIGN §10f). States as src/recommended.js RECOMMENDED_STATE. Sizes in px. */
    const RECOMMENDED = Object.freeze({
      state: Object.freeze({ install: 'install', installed: 'installed', dshOn: 'dsh-on', dshOff: 'dsh-off' }),
      rowGapPx: 12, rowPaddingYPx: 6, categoryGapPx: 8,
      /** How the section comes into view when the welcome card's link opens the page. */
      scroll: Object.freeze({ behavior: 'smooth', block: 'start' }),
      /**
       * How long the welcome card's request to bring the section into view waits for the page to
       * mount. Past it the request lapses, so a later visit to the settings page never jumps (when
       * DSH could not open Fishball's page, or the page was already open).
       */
      focusMs: 5000,
    })
    /**
     * The managed mark in a sidebar row's leading cell. cellPx copies DSH's leading cell (the
     * seat's contract in dsh-client-ui-workspace slots.d.ts, rc.2: "the 16px cell before the
     * title"); the cell is not sized by its parent, so a percentage would collapse. Revisit if DSH resizes it.
     */
    const MANAGED_ROW = Object.freeze({ id: 'fishball-managed', iconPx: 14, cellPx: 16 })
    /** The ask_fishball row (S37): DSH has no view for this tool, so this entry draws the whole row. */
    const ASK_ROW = Object.freeze({ tool: 'ask_fishball', phaseStart: 'start', phaseResult: 'result' })
    /** ask_fishball's answer codes with their own words (keep in step with src/constants.js ASK_RESULT, ASK_ERROR). */
    const ASK_CODES = new Set(['allowed', 'rejected', 'question', 'unavailable', 'over-capacity', 'no-longer-managed', 'not-user-message', 'too-large', 'expired', 'invalid-request', 'empty', 'cancelled'])
    /** Your answer on a card (src/constants.js CARD_DECISION) and refusals with their own text. */
    const CARD_DECISION = Object.freeze({ allow: 'allow', reject: 'reject' })
    const CARD_ERRORS = new Set(['expired', 'too-large', 'unavailable'])
    /** Card kinds (src/constants.js REQUEST_KIND) and thread authors (THREAD_FROM) with their own words. */
    const CARD_KINDS = new Set(['asked', 'direct', 'own'])
    /** Fishball's own request (rev11f, §7a.11): its card is labelled Fishball instead of a session. */
    const OWN_CARD_KIND = 'own'
    // The attribute Fishball keeps on DSH's brand button (rev11-ui-fixes R5).
    const BRAND_LABEL_ATTR = 'aria-label'
    // The one use count English words apart ("used once", not "used 1 times"); the manager's decision, rev11-ui-fixes R2.
    const GRANT_USES = Object.freeze({ once: 1 })
    // An audit row that ran on a pass: who gave the pass (passBy, recorded since rev11-ui-fixes R4).
    // A row without passBy (written before the fix) keeps the wording it always had.
    const AUDIT_PASS = Object.freeze({ answer: 'pass', byUser: 'user', userKey: 'approvalAnswer.pass-user' })
    // ask_fishball's reason_from for Fishball's own reason (rev11-ui-fixes R3); a row from before the fix has none.
    const REASON_FROM_FISHBALL = 'fishball'
    const ARGUMENTS_COMPLETE = 'complete'
    /** The turn-tail tags (DESIGN §7a.3, §10e; src/constants.js TAG_KIND). */
    const TURN_TAGS = Object.freeze({ id: 'fishball-tags', sentToYou: 'sent-to-you', grant: 'grant', prompt: 'prompt', question: 'question', planReview: 'plan-review', iconSize: 12, separator: ' · ' })
    const TAG_ANSWERS = new Set(['allow', 'grant', 'reject', 'ask'])
    /** A plan review's tag answers (src/constants.js QUESTION_TAG_ANSWER); a question's tag shows the answer's own words. */
    const PLAN_TAG_ANSWERS = new Set(['approve', 'keep-planning'])
    /**
     * Questions and plan reviews (rev11g, §7a.10; src/constants.js QUESTION_KIND, QUESTION_MODE,
     * QUESTION_ERROR): their cards share the pile, the mode is set on the settings page.
     */
    const QUESTION_VIEW = Object.freeze({ question: 'question', planReview: 'plan-review', modes: Object.freeze(['auto', 'fishball', 'user']) })
    const QUESTION_KINDS = new Set([QUESTION_VIEW.question, QUESTION_VIEW.planReview])
    const QUESTION_ERRORS = new Set(['expired', 'bad-answer', 'already-settled', 'session-not-live', 'unavailable'])
    /**
     * Standing grants (rev11d; src/constants.js GRANT_KIND, GRANT.wildcard): a prefix grant is shown
     * as its prefix with the wildcard, an exact one by its tool. Revoke refusals with their own text.
     */
    const GRANT_VIEW = Object.freeze({ prefix: 'prefix', wildcard: '*' })
    const GRANT_ERRORS = new Set(['unknown', 'ended', 'unavailable'])
    const JSON_INDENT = 2
    /**
     * The plugin manager (DESIGN §10d): the Fishball tab, laid out like DSH's Installed tab and
     * plugin page (owner's choice: list version 1, page A), and the tag and switch on DSH's own
     * page for each plugin. It changes Fishball's side only; DSH's side is shown, never changed.
     */
    const MANAGER = Object.freeze({
      tabId: 'fishball',
      badgeId: 'fishball-state',
      actionId: 'fishball-use',
      /** The subject kind of a bundle's page (plugins.detail.* props). */
      bundleSubject: 'bundle',
      /** Card groups in order, by the catalog's `dsh` field (src/constants.js PLUGIN_DSH). */
      groups: Object.freeze([
        // Fishball's own plugins first (revision 10c).
        Object.freeze({ id: 'own', dsh: Object.freeze(['fishball']) }),
        Object.freeze({ id: 'builtin', dsh: Object.freeze(['builtin']) }),
        Object.freeze({ id: 'dsh', dsh: Object.freeze(['on', 'off']) }),
        Object.freeze({ id: 'fishball', dsh: Object.freeze(['none']) }),
      ]),
      /** A DSH plugin that is off in DSH and on in Fishball runs only in Fishball (snapshot `runs`). */
      dshOff: 'off',
      runsInFishball: 'fishball',
      /** Snapshot `settings` values the page words. */
      settingsUnused: 'unused',
      /** DSH's own artwork for the built-ins it has one for (dsh-client-ui-primitives); the rest take the default. */
      builtinArt: Object.freeze({ 'builtin:web': PluginArtworkSearch, 'builtin:shell': PluginArtworkTerminal }),
      messengerKey: 'builtin:messenger',
      artSize: 36,
      /** The back link's chevron, and the fewest rows a list field shows. */
      crumbIconSize: 14,
      listMinRows: 2,
      /** The "+" before "Install for Fishball", as DSH's Add plugin draws it (13px). */
      addIconSize: 13,
      /** DSH's Refresh: a 16px icon; the spinner shows at least this long so it never flashes (DSH's 400 ms). */
      refreshIconSize: 16,
      refreshMinMs: 400,
      /** The group of DSH plugins: DSH's Installed tab lists them, so only they open there. */
      dshGroup: 'dsh',
      /** DSH tags these packages "Experimental" on its own page (dsh-client-ui-plugin-manager, rc.2). */
      experimentalPrefix: '@deepseek-ai/dsh-experimental-',
    })
    /** What a settings form last said after Save. */
    const FORM_MESSAGE = Object.freeze({ saved: 'saved', invalid: 'invalid', failed: 'failed' })
    /**
     * How the settings form draws each schema field (DESIGN §10d "The form"); anything else is
     * shown read-only. The form reads the Host's `schema.toJSON()` envelope ({ uid, refs }).
     */
    const FIELD_KIND = Object.freeze({ text: 'text', number: 'number', switch: 'switch', choice: 'choice', list: 'list', secret: 'secret', readOnly: 'read-only' })
    const SCHEMA = Object.freeze({ object: 'object', intersect: 'intersect', string: 'string', number: 'number', boolean: 'boolean', union: 'union', constant: 'const', array: 'array', secretRole: 'secret' })
    /** Settings refusals: 400 `invalid` names the failing field's path. */
    const SETTINGS_INVALID = 'invalid'
    const LIST_SEPARATOR = '\n'
    /**
     * The limit fields, in the order the Host declares them (src/config.js LIMITS). The
     * form model needs its fields before the first state frame arrives, so the browser keeps
     * this list; the Host schema still decides validity on save.
     */
    const LIMIT_FIELDS = Object.freeze(['maxQueuedInputs', 'maxActiveWatches', 'maxSourcesPerPlugin', 'maxFishballOnlyPlugins', 'wakeupsPerHour', 'messagesPerHour', 'sessionsPerHour', 'maxPendingApprovals', 'approvalAnswerSeconds', 'argumentExcerptBytes', 'maxMessageBytes', 'auditEntriesKept', 'requestUserMessageBytes', 'rationaleChars', 'approvalsShown', 'intakeRowsShown', 'outboxShown', 'watchesShown', 'readSessionMessages', 'readSessionBytes', 'forwardExcerptBytes', 'pluginHistoryShown', 'settingsPromptValueBytes', 'replyCapShare', 'headroomShare', 'minWindowTokens', 'pluginManagerStartMs', 'defaultReplyCapTokens', 'userMessagesListed', 'userMessageExcerptChars', 'pileMaxHeightVh'])
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
      eyeColor: '#EC0A6E',
    })
    /**
     * Fishball's own interactive controls take a light magenta derived from the mark's eye, so they
     * stand apart from DSH's (owner's choice, revision 10a): its buttons, switches and menu item.
     * Mixed with white, it reads on DSH's light and dark themes; the text is a deep magenta.
     */
    const FISHBALL_COLOUR = Object.freeze({
      fill: `color-mix(in srgb, ${FISH_MARK.eyeColor} 32%, #fff)`,
      fillHover: `color-mix(in srgb, ${FISH_MARK.eyeColor} 44%, #fff)`,
      // Dark enough to read on the light fill (about 8:1); the earlier 70% mix read at about 4:1 (owner's note).
      text: `color-mix(in srgb, ${FISH_MARK.eyeColor} 35%, #000)`,
      accent: FISH_MARK.eyeColor,
    })
    const ADD_MENU = Object.freeze({ id: 'fishball-install', iconSize: 14 })
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
    /**
     * Fishball's own session is reached through the brand (or its Plugins page), not the
     * session list (owner's choice, P9). DSH has no per-session hidden flag, so the row is
     * hidden by a style rule on the workspace browser's row key. The key is
     * dsh-client-ui-workspace markup (`data-row-key="session:<id>"`, rc.2), used by both the
     * grouped and the flat list; if a DSH update renames it the row simply shows again.
     */
    const OWN_ROW = Object.freeze({ styleId: 'fishball-own-row', selector: (sessionId) => `[data-row-key="session:${CSS.escape(sessionId)}"]{display:none}` })
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
    const CLS = Object.freeze({ pile: 'fb-pile', pileDock: 'fb-pile-dock', pileHead: 'fb-pile-head', card: 'fb-card', cardHead: 'fb-card-head', title: 'fb-title', pre: 'fb-pre', quote: 'fb-quote', thread: 'fb-thread', actions: 'fb-actions', askRow: 'fb-ask-row', turnTags: 'fb-turn-tags', fishTag: 'fb-fish-tag', field: 'fb-field', note: 'fb-note', entries: 'fb-entries', section: 'fb-section', row: 'fb-row', label: 'fb-label', code: 'fb-code', list: 'fb-list', name: 'fb-name', tag: 'fb-tag', mark: 'fb-mark', markBox: 'fb-mark-box', swim: 'fb-swim', badge: 'fb-badge', wag: 'fb-wag', grow: 'fb-grow', muted: 'fb-muted', managedBanner: 'fb-managed-banner', managedText: 'fb-managed-text', managedRow: 'fb-managed-row', reveal: 'fb-reveal', revealInner: 'fb-reveal-inner', pileRow: 'fb-pile-row', rowMain: 'fb-row-main', rowLine: 'fb-row-line', rowControls: 'fb-row-controls', detail: 'fb-detail', detailBody: 'fb-detail-body', welcome: 'fb-welcome', welcomeLine: 'fb-welcome-line', recCategory: 'fb-rec-category', recRow: 'fb-rec-row', recDesc: 'fb-rec-desc' })

    const en = {
      brandName: 'FISHBALL',
      brandTag: 'Deepseek Harness',
      brandLabel: 'Open Fishball',
      brandLabelUnread: 'Open Fishball, {count} unread',
      unreadMany: '{max}+',
      brandStyle: 'Sidebar icon',
      brandStyleHint: 'Fishball\'s own mark and word logo, or the DeepSeek orca and DeepSeek\'s word logo. A new message shows the number either way; Fishball\'s fish wags, and the orca swims as it does when you hover it in a new session.',
      brandStyleDeepseek: 'Use the DeepSeek icon',
      session: 'Session',
      folder: 'Folder',
      error: 'Problem',
      'status.starting': 'Starting',
      'status.live': 'Running',
      'status.recovery': 'Needs your decision',
      'status.archived': 'Archived',
      'status.stopped': 'Stopped',
      'status.failed': 'Could not start (restart DSH)',
      recoverFailed: 'That did not work. Check the status above and try again.',
      retry: 'Try again',
      adopt: 'Start a new Fishball session',
      openChat: 'Open chat',
      hiddenTools: 'Tools Fishball never uses',
      hiddenToolsHint: 'They save files, change the profile, or start agents inside Fishball\'s own session.',
      limits: 'Safety limits',
      openSettings: 'Fishball settings',
      modelTitle: 'Model for Fishball',
      modelHint: 'Choose a dedicated model for Fishball. This does not change the model or default for your other sessions.',
      modelRequired: 'Choose a model in Fishball settings before sending messages.',
      modelChoose: 'Select model',
      modelLoading: 'Loading models…',
      modelRefresh: 'Refresh models',
      modelRefreshing: 'Refreshing…',
      modelRefreshHint: 'Fetch the models configured in this DSH again, without reloading the page.',
      modelUnavailableOption: 'Unavailable',
      modelEffort: 'Reasoning effort',
      modelEffortDefault: 'Model default',
      modelEmpty: 'No models available. Configure a provider in DSH model settings, then refresh.',
      modelLoadFailed: 'Models could not be refreshed. Any previous list and selection are unchanged. Try again.',
      modelSaveFailed: 'The model was not saved. Check that it is still available and try again.',
      modelUnavailable: 'A saved or selected model is unavailable in the current list. Its selection is kept; choose another model to change it.',
      syncTitle: 'Sync model providers and API keys',
      syncHint: 'Manual additions only. Pair source and target pages, preview, then confirm. The invitation is a short-lived scoped pairing capability, not a DSH Web or OAuth token. Existing settings are skipped. OAuth and logins are never copied.',
      syncInvite: 'Create target invitation', syncInvitation: 'One-time target invitation', syncPaste: 'Paste target invitation on the source',
      syncBegin: 'Connect to target', syncApprove: 'Approve source on target', syncFinish: 'Confirm target on source',
      syncStatus: 'Check pairing status', syncClose: 'Close sync channel', syncPreview: 'Preview sync', syncConfirm: 'Confirm selected additions',
      syncConsent: 'I confirm transferring the selected model configuration and current API keys to this target. Partial success is possible.',
      syncIdentity: 'Runtime / profile', syncFailed: 'Sync was refused or could not be confirmed. Check pairing and create a new preview; no automatic retry.',
      syncComplete: 'Selected additions completed. Catalog presence does not prove account authentication.',
      syncPartial: 'Not all items completed. Review every result; create a new preview before retrying failed or unknown items.',
      'syncGroup.add': 'Will add', 'syncGroup.existsSkip': 'Already exists — skip', 'syncGroup.conflictSkip': 'Conflict — skip', 'syncGroup.unsupported': 'Unsupported',
      contextWindow: 'Context window',
      contextHint: 'Leave the window empty to use the model\'s full window. A smaller window makes Fishball summarise its conversation sooner; only Fishball\'s session is affected.',
      'contextField.contextWindowTokens': 'Context window (tokens)',
      'contextField.maxOutputTokens': 'Reply length cap (tokens)',
      contextModel: 'Model window',
      contextEffective: 'Window in use',
      contextThreshold: 'Summarises at',
      contextPressure: 'In use now',
      contextOutput: 'Reply cap',
      contextUnknown: 'unknown',
      contextNone: 'none',
      contextDefault: 'Default',
      contextCompactionOff: 'Compaction is off for Fishball, so only the reply cap applies. Turn it on under Plugins for Fishball.',
      'contextError.window-too-small': 'That window is too small: it is below the smallest window in the safety limits, or cannot hold Fishball\'s instructions, tools, a summary and recent messages.',
      'contextError.output-too-large': 'The reply cap does not fit in the window.',
      'contextError.model-window-unknown': 'The model does not report its window, so a smaller one cannot be set.',
      contextSaveFailed: 'That value was not accepted.',
      contextInvalid: 'Enter a whole number, or leave it empty.',
      sendToFishball: 'Send to Fishball',
      sendTitle: 'Send "{title}" to Fishball',
      sendNoteLabel: 'Note for Fishball (optional)',
      sendHint: 'Fishball reads this session\'s last answer and your note.',
      send: 'Send',
      cancel: 'Cancel',
      close: 'Close',
      sending: 'Sending…',
      'sendError.queue-full': 'Fishball\'s queue is full. Try again later.',
      'sendError.too-large': 'The note is too long.',
      'sendError.from-fishball': 'This is Fishball\'s own session.',
      'sendError.unknown-session': 'This session could not be read.',
      'sendError.unavailable': 'Fishball is not running.',
      sendFailed: 'That did not work.',
      handOver: 'Hand over to Fishball',
      takeBack: 'Take back from Fishball',
      manageTitle: 'Managed by Fishball',
      // The banner's words. Same text as manageTitle (the refusal dialog's title) today, but a separate meaning.
      managedBanner: 'Managed by Fishball',
      manageFailed: 'That did not work.',
      'manageError.unknown-session': 'This session could not be read.',
      'manageError.is-fishball': 'This is Fishball\'s own session.',
      'manageError.feature-off': 'Fishball\'s Session messages plugin is off.',
      'manageError.unavailable': 'Fishball is not running.',
      watchSession: 'Tell Fishball when finished',
      watching: 'Fishball is watching',
      watchFailed: 'Fishball could not watch this session.',
      'watchError.unknown-session': 'This session could not be read.',
      'watchError.archived': 'This session is archived.',
      'watchError.is-fishball': 'This is Fishball\'s own session.',
      'watchError.limit-reached': 'Fishball is watching as many sessions as it may.',
      'watchError.unknown-watch': 'That watch is already closed.',
      'watchError.unavailable': 'Fishball is not running.',
      watches: 'Watches',
      watchesHint: 'Sessions Fishball tells you about when they finish. Set one up from a session\'s menu.',
      'watchBy.user': 'You',
      'watchBy.assistant': 'Fishball',
      'watchBy.agent': 'The session itself',
      'watchCondition.finished': 'When finished',
      'watchCondition.per-turn': 'Every turn',
      'watchStatus.active': 'Active',
      'watchStatus.closed': 'Closed',
      'watchStatus.target-missing': 'Session gone',
      watchFired: 'Told {count}×',
      intake: 'Queue',
      intakeHint: 'Inputs that wake Fishball: messages from other sessions, sessions you forward, and notices.',
      intakeQueued: 'Waiting to be read',
      intakeFailed: 'Could not be delivered',
      intakeWakeups: 'Wake-ups this hour',
      'intakeKind.session': 'From a session',
      'intakeKind.user': 'From you',
      'intakeKind.system': 'Notice',
      'intakeKind.watch': 'Watched session',
      'intakeKind.approval': 'Permission request',
      'intakeStatus.pending': 'Waiting',
      'intakeStatus.accepted': 'Queued',
      'intakeStatus.consumed': 'Read',
      'intakeStatus.discarded': 'Cleared',
      'intakeStatus.failed': 'Failed',
      outbox: 'Sent by Fishball',
      outboxHint: 'Messages Fishball sent to other sessions and sessions it started.',
      'outboxKind.message': 'Message',
      'outboxKind.start': 'New session',
      'outboxKind.redirect': 'Redirect',
      'outboxStatus.delivered': 'Delivered',
      'outboxStatus.unconfirmed': 'Delivered, not confirmed',
      'outboxStatus.failed': 'Failed',
      nothingYet: 'Nothing yet.',
      sources: 'Plugin sources',
      sourcesHint: 'Plugins that send Fishball events through ctx.fishball. A source is off while Fishball is not running or has its plugin turned off.',
      sourceOn: 'Accepting events',
      sourceOff: 'Off',
      'intakeKind.plugin': 'Plugin event',
      approvals: 'Permission requests',
      managedSessions: 'Managed sessions',
      managedSessionsHint: 'Sessions Fishball looks after: they can message it, and their permission requests go to it first. Every other session is yours.',
      managedSince: 'since {at}',
      'managedBy.hand-over': 'Handed over by you',
      'managedBy.send': 'Sent by you',
      'managedBy.message': 'Messaged by Fishball',
      'managedBy.start': 'Started by Fishball',
      'managedBy.prompt-answer': 'Prompt answered by Fishball',
      approvalsHint: 'Managed sessions\' permission requests go to Fishball first. It approves only low-risk requests within an allowance you gave it in its chat, and hands the rest to you: a request the session asked first waits in your pile above Fishball\'s chat, and a direct call waits both there and in that session.',
      approvalsWaiting: 'Waiting for Fishball',
      'approvalAnswer.allow': 'Approved by Fishball',
      'approvalAnswer.escalate': 'Sent to you',
      'approvalAnswer.timeout': 'No answer in time; sent to you',
      'approvalAnswer.withdrawn': 'Withdrawn',
      'approvalAnswer.released': 'Session no longer managed; sent to you',
      'approvalAnswer.reject': 'Rejected by Fishball',
      'approvalAnswer.ask': 'Fishball asked a question; no reply',
      'approvalAnswer.to-user': 'Sent to you without Fishball\'s answer',
      approvalsPile: 'Waiting for you in the pile: {count}',
      'approvalAnswer.pass': 'Ran on Fishball\'s one-time approval',
      'approvalAnswer.pass-user': 'Ran on your one-time approval',
      'approvalAnswer.grant': 'Approved by Fishball with a standing grant',
      'approvalAnswer.grant-used': 'Ran on Fishball\'s standing grant',
      'approvalAnswer.answer': 'Question answered by Fishball',
      approvalsGrants: 'Active standing grants: {count}',
      'approvalOutcome.allowed-once': 'allowed once',
      'approvalOutcome.rejected': 'rejected',
      'approvalOutcome.cancelled': 'cancelled',
      'approvalOutcome.unavailable': 'no answer',
      'approvalOutcome.answered-by-fishball': 'answered by Fishball',
      'approvalOutcome.answered-in-pile': 'answered by you in the pile',
      'approvalOutcome.answered-in-session': 'answered in its session',
      'approvalOutcome.closed': 'closed',
      'approvalOutcome.back-to-session': 'back to its session',
      plugins: 'Plugins for Fishball',
      pluginToggle: 'Use {name} in Fishball',
      uninstall: 'Uninstall',
      uninstallLabel: 'Uninstall {name} from Fishball',
      removing: 'Uninstalling after this turn',
      'pluginError.remove-failed': 'Could not be uninstalled; it stays installed and off',
      installTitle: 'Install a plugin for Fishball only',
      installHint: 'A package name with an optional version, a Git address, a tarball URL or an absolute folder path. It is installed in Fishball\'s own folder, not in DSH, and turned on for Fishball only.',
      installSpecLabel: 'Package',
      install: 'Install',
      'installError.not-bundle': 'That package is not a DSH plugin.',
      'installError.ambiguous-install': 'pnpm changed more than one package, so nothing was installed.',
      'installError.incompatible-version': 'That package does not support this DSH version.',
      'installError.cancelled': 'The install was cancelled.',
      'installError.build-blocked': 'pnpm held back install scripts that need your approval.',
      'installError.operation-error': 'pnpm could not install it. The output is below.',
      'installError.no-profile': 'Installing needs a DSH profile.',
      installForFishballOnly: 'Install for Fishball only',
      installForFishballDescription: 'Installs into Fishball\'s own folder; other sessions do not get it',
      installPlaceholder: 'package-name, package-name@1.2.0, a Git address, or /absolute/path',
      installTrust: 'A plugin runs with full access to this computer. Install only plugins you trust.',
      installChecking: 'Checking the package…',
      installConfirm: 'Install for Fishball',
      installSource: 'From {source}',
      defaultRegistry: 'the registry pnpm uses',
      alsoInDsh: 'This package is installed in DSH too. Fishball installs its own copy, separate from DSH\'s.',
      shippedByDsh: 'DSH ships a plugin with this name. Fishball installs its own copy, which Fishball uses instead of DSH\'s.',
      cancelTooLate: 'It is too late to cancel: the install is finishing.',
      'installError.too-large': 'That package spec is too long.',
      'installPhase.waiting': 'Starting…',
      'installPhase.installing': 'Installing…',
      'installPhase.applying': 'Finishing…',
      'installPhase.cancelling': 'Cancelling…',
      installAttempt: '(registry {index} of {total})',
      showOutput: 'Install output',
      cancelInstall: 'Cancel install',
      installDone: '{name} {version} is installed for Fishball and turned on.',
      installDoneOff: 'It is installed but could not be turned on:',
      openPluginPage: 'Open its page',
      installRetry: 'Try again',
      allowScripts: 'Allow these scripts and retry',
      pendingScripts: 'Packages that want to run install scripts:',
      back: 'Back',
      'inspectProblem.invalid-spec': 'That is not a package spec DSH accepts.',
      'inspectProblem.already-installed': 'That package is already installed.',
      'inspectProblem.not-found': 'No package was found for that spec.',
      'inspectProblem.not-a-package': 'That is not a package.',
      'inspectProblem.not-a-bundle': 'That package is not a DSH plugin.',
      'inspectProblem.network': 'The registry could not be reached.',
      'inspectProblem.unknown': 'The package could not be checked.',
      'installError.unavailable': 'Fishball is not running.',
      'installError.invalid-spec': 'That is not a package spec DSH accepts. Use a package name, an absolute folder path, a git address or a tarball URL.',
      'installError.already-installed': 'That plugin is already installed for Fishball.',
      installFailed: 'That did not work.',
      pending: 'Applies after this turn',
      waiting: 'Starting…',
      'pluginError.row-id-conflict': 'Two of its parts have the same name, so it cannot run for Fishball',
      'pluginError.limit-reached': 'Too many plugins running only for Fishball',
      pluginErrorOther: 'Could not start for Fishball',
      changedByfishball: 'Changed by Fishball',
      changedByuser: 'Changed by you',
      'tool.unchecked': 'Not checked',
      'tool.hidden': 'Hidden',
      'tool.other-sessions': 'For other sessions',
      'tool.plugin-off': 'Off',
      remove: 'Remove',
      'pluginError.edits-other-rows': 'Changes other plugins, so it cannot run for Fishball only',
      'pluginError.no-rows': 'Adds nothing Fishball can run',
      'pluginError.row-failed': 'Failed to start for Fishball',
      'pluginError.leaks-service': 'Works only in DSH\'s own interface, so it cannot run for Fishball only',
      'pluginError.no-profile': 'Needs a DSH profile',
      changeFailed: 'That change was not accepted.',
      tabTitle: 'Fishball',
      refresh: 'Refresh',
      refreshFailed: 'The plugin list could not be read again. Try Refresh again.',
      pluginsSummary: 'On in Fishball: {on}. Waiting for you: {needs}.',
      pluginsWhere: 'Manage them in the Fishball tab of the Plugins list.',
      recommended: 'Recommended plugins',
      recommendedHint: "Plugins that work well with Fishball. Install puts one in Fishball's own folder after you confirm it; DSH's other sessions are unchanged.",
      recommendedFirst: 'Recommended first',
      recommendedNote: 'These significantly improve how Fishball works.',
      'recommendedCategory.context': 'Context management',
      'recommendedCategory.memory': 'Memory',
      'recommendedCategory.channel': 'Channel',
      'recommendedCategory.pet': 'Pet',
      recommendedPetNote: "Pets draw only in DSH's own interface, and a plugin that runs only for Fishball has no browser part, so none can be listed here.",
      recommendedSource: 'Source',
      recommendedInstallLabel: 'Install {name} for Fishball',
      recommendedTurnOn: 'Turn on for Fishball',
      recommendedTurnOnLabel: 'Turn on {name} for Fishball',
      'recommendedState.installed': 'Installed',
      'recommendedState.dsh-on': 'On in Fishball',
      'recommendedState.dsh-off': 'In DSH, off in Fishball',
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
      welcomeTitle: 'Welcome to Fishball',
      welcomeIntro: 'Plugins give Fishball more to work with:',
      welcomeSee: 'See recommended plugins',
      installForFishball: 'Install for Fishball',
      'group.builtin': 'Built in',
      'group.dsh': 'DSH plugins',
      'group.fishball': 'Installed for Fishball only',
      'group.own': 'Fishball',
      'group.tools': 'Tools from an unknown plugin',
      'dsh.on': 'On in DSH',
      'dsh.off': 'Off in DSH',
      'dsh.builtin': 'Built in',
      'dsh.none': 'Fishball only',
      'dsh.fishball': 'Fishball',
      runsOnlyInFishball: 'Runs only in Fishball',
      onInFishball: 'On in Fishball',
      offInFishball: 'Off in Fishball',
      toolsWait: '{count} waiting for you',
      backToList: 'Plugins',
      backToListLabel: 'Back to the Fishball list',
      toolsCount: '{count} tools',
      detailsTitle: 'Details',
      viewPlugin: 'View {name}',
      inDsh: 'In DSH',
      'inDsh.on': 'On for every session',
      'inDsh.off': 'Installed, off',
      'inDsh.builtin': 'Built in',
      'inDsh.none': 'Not installed in DSH',
      'inDsh.fishball': 'Part of dsh-fishball',
      openInDsh: 'Open in DSH',
      lastChange: 'Changed',
      neverChanged: 'Not changed yet',
      changedAt: '{who} · {when}',
      'who.user': 'By you',
      'who.fishball': 'By Fishball',
      tools: 'Tools',
      noTools: 'No tools.',
      'tool.visible': 'Visible',
      'tool.allowed': 'Allowed by you',
      settingsTitle: 'Settings for Fishball',
      settingsShared: 'This plugin is on in DSH, so one copy runs for every session with DSH\'s settings. Change them on DSH\'s page.',
      settingsUnused: 'Your Fishball settings are kept, but not used while this plugin runs in DSH.',
      settingsNone: 'This plugin has no settings Fishball can change.',
      settingsOwnError: 'The plugin\'s own settings are not valid: {message}',
      settingsChanged: 'Changed',
      settingsReset: 'Reset',
      settingsResetAll: 'Reset all',
      settingsSaved: 'Saved. It applies when Fishball\'s current turn ends.',
      settingsFailed: 'That was not saved.',
      settingsInvalid: 'This value is not accepted.',
      settingsReadOnly: 'Shown only: this kind of setting cannot be changed here.',
      settingsListHint: 'One per line.',
      settingsRow: 'Part: {row}',
      secretSet: 'Set',
      secretUnset: 'Not set',
      secretHint: 'Type a new value to replace it. It is never shown, and Fishball cannot see it.',
      secretClear: 'Clear',
      pageLoadFailed: 'This page could not be loaded.',
      experimental: 'Experimental',
      'group.allowed': 'Tools you allowed that are not listed above',
      resetField: 'Reset {name}',
      clearField: 'Clear {name}',
      settingsRowUnavailable: 'The settings of part {row} could not be read.',
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
      'field.intakeRowsShown': 'Queue rows shown on this page',
      'field.outboxShown': 'Outbox entries shown on this page',
      'field.watchesShown': 'Watches shown on this page and by list_watches',
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
      pileTitle: 'Waiting for you ({count})',
      pileOwnName: 'Fishball',
      pileBack: 'Back',
      questionAnswer: 'Answer',
      whyRun: '{who} wants to run {command}',
      whyUseOn: '{who} wants to use {tool}: {argument}',
      whyUse: '{who} wants to use {tool}',
      whyQuestion: '{who} asks you: {question}',
      whyPlan: '{who} asks you to review its plan',
      'cardKind.asked': 'Asked first',
      'cardKind.direct': 'Direct call',
      'cardKind.own': 'Fishball',
      cardOwnTitle: 'Fishball asks',
      'cardKind.question': 'Question',
      'cardKind.plan-review': 'Plan review',
      cardContinued: 'The session went on; your answer reaches it as a reply',
      questionOther: 'Your own answer (optional)',
      questionSubmit: 'Send answer',
      planApprove: 'Approve',
      planKeep: 'Keep planning',
      planFeedback: 'Feedback for the session (optional)',
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
      cardArgumentsCut: 'The arguments are cut.',
      cardQuotes: 'You asked that session',
      cardThread: 'Discussion with Fishball',
      'threadFrom.agent': 'Session',
      'threadFrom.fishball': 'Fishball',
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
      tagAskedFishball: 'Asked Fishball',
      'tagAnswer.allow': 'allowed once',
      'tagAnswer.reject': 'rejected',
      'tagAnswer.ask': 'asked a question',
      tagSentToYou: 'Sent to you',
      'tagAnswer.grant': 'granted (standing grant)',
      'tagAnswer.answer': 'answered',
      'tagAnswer.approve': 'plan approved',
      'tagAnswer.keep-planning': 'keep planning',
      tagGrant: 'Allowed by Fishball\'s grant: {what}',
      tagPrompt: 'Answered by Fishball: {decision}',
      grantExact: 'exact {tool} call',
      grantsTitle: 'Standing grants ({count})',
      grantEnds: 'ends {at}',
      grantUses: 'used {count} times',
      grantUsedOnce: 'used once',
      grantPaused: 'Paused while Fishball or Permission requests is off',
      revoke: 'Revoke',
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
      session: '会话',
      folder: '文件夹',
      error: '问题',
      'status.starting': '启动中',
      'status.live': '运行中',
      'status.recovery': '需要你的决定',
      'status.archived': '已归档',
      'status.stopped': '已停止',
      'status.failed': '无法启动（请重启 DSH）',
      recoverFailed: '操作未成功。请查看上方状态后重试。',
      retry: '重试',
      adopt: '新建 Fishball 会话',
      openChat: '打开对话',
      hiddenTools: 'Fishball 永不使用的工具',
      hiddenToolsHint: '它们会保存文件、修改配置，或在 Fishball 自己的会话里启动代理。',
      limits: '安全限制',
      openSettings: 'Fishball 设置',
      modelTitle: 'Fishball 专用模型',
      modelHint: '为 Fishball 选择专用模型。不会更改其他会话的模型或 DSH 默认模型。',
      modelRequired: '请先在 Fishball 设置中选择模型，再发送消息。',
      modelChoose: '选择模型',
      modelLoading: '正在加载模型…',
      modelRefresh: '刷新模型列表',
      modelRefreshing: '正在刷新…',
      modelRefreshHint: '重新获取当前 DSH 已配置的模型，无需刷新页面。',
      modelUnavailableOption: '不可用',
      modelEffort: '推理强度',
      modelEffortDefault: '模型默认值',
      modelEmpty: '没有可用模型。请先在 DSH 模型设置中配置提供商，然后刷新。',
      modelLoadFailed: '无法刷新模型列表。原有列表和选择保持不变，请重试。',
      modelSaveFailed: '模型未保存。请确认模型仍然可用，然后重试。',
      modelUnavailable: '已保存或当前选择的模型不在列表中，原选择仍然保留；可另选模型来更改。',
      syncTitle: '同步模型提供商和 API key',
      syncHint: '仅手动新增。先在来源与目标两端配对，再预览并确认。邀请是短期、限用途的配对凭证，不是 DSH Web 或 OAuth 令牌；已有配置跳过，不复制 OAuth 或登录信息。',
      syncInvite: '创建目标邀请', syncInvitation: '一次性目标邀请', syncPaste: '在来源粘贴目标邀请',
      syncBegin: '连接目标', syncApprove: '在目标批准来源', syncFinish: '在来源确认目标',
      syncStatus: '检查配对状态', syncClose: '关闭同步通道', syncPreview: '预览同步', syncConfirm: '确认所选新增项',
      syncConsent: '确认将所选模型配置及执行时的 API key 转移到此目标。可能出现部分成功。',
      syncIdentity: '运行实例 / profile', syncFailed: '同步被拒绝或无法确认。请检查配对并重新预览，不会自动重试。',
      syncComplete: '所选新增项已完成。模型在目录中不代表账户认证已验证。',
      syncPartial: '部分项目未完成。请逐项检查；失败或未知项需重新预览再重试。',
      'syncGroup.add': '将新增', 'syncGroup.existsSkip': '已存在，跳过', 'syncGroup.conflictSkip': '冲突，跳过', 'syncGroup.unsupported': '不支持',
      contextWindow: '上下文窗口',
      contextHint: '留空则使用模型的完整窗口。窗口越小，Fishball 越早总结对话；只影响 Fishball 的会话。',
      'contextField.contextWindowTokens': '上下文窗口（token）',
      'contextField.maxOutputTokens': '回复长度上限（token）',
      contextModel: '模型窗口',
      contextEffective: '当前使用的窗口',
      contextThreshold: '总结阈值',
      contextPressure: '当前占用',
      contextOutput: '回复上限',
      contextUnknown: '未知',
      contextNone: '无',
      contextDefault: '默认',
      contextCompactionOff: 'Fishball 的压缩已关闭，因此只有回复上限生效。请在“Fishball 的插件”中开启。',
      'contextError.window-too-small': '窗口太小：低于安全限制中的最小窗口，或放不下 Fishball 的指令、工具、总结和最近的消息。',
      'contextError.output-too-large': '回复上限超出了窗口。',
      'contextError.model-window-unknown': '模型没有报告其窗口，因此无法设置更小的窗口。',
      contextSaveFailed: '该值未被接受。',
      contextInvalid: '请输入整数，或留空。',
      sendToFishball: '发送给 Fishball',
      sendTitle: '把“{title}”发送给 Fishball',
      sendNoteLabel: '给 Fishball 的备注（可选）',
      sendHint: 'Fishball 会读取此会话的最后一条回复和你的备注。',
      send: '发送',
      cancel: '取消',
      close: '关闭',
      sending: '发送中…',
      'sendError.queue-full': 'Fishball 的队列已满，请稍后再试。',
      'sendError.too-large': '备注太长。',
      'sendError.from-fishball': '这是 Fishball 自己的会话。',
      'sendError.unknown-session': '无法读取此会话。',
      'sendError.unavailable': 'Fishball 未在运行。',
      sendFailed: '操作未成功。',
      handOver: '交给 Fishball 管理',
      takeBack: '从 Fishball 收回',
      manageTitle: '由 Fishball 管理',
      managedBanner: '由 Fishball 管理',
      manageFailed: '操作未成功。',
      'manageError.unknown-session': '无法读取此会话。',
      'manageError.is-fishball': '这是 Fishball 自己的会话。',
      'manageError.feature-off': 'Fishball 的会话消息插件已关闭。',
      'manageError.unavailable': 'Fishball 未在运行。',
      watchSession: '完成时通知 Fishball',
      watching: 'Fishball 正在关注',
      watchFailed: 'Fishball 无法关注此会话。',
      'watchError.unknown-session': '无法读取此会话。',
      'watchError.archived': '此会话已归档。',
      'watchError.is-fishball': '这是 Fishball 自己的会话。',
      'watchError.limit-reached': 'Fishball 关注的会话已达上限。',
      'watchError.unknown-watch': '该关注已关闭。',
      'watchError.unavailable': 'Fishball 未在运行。',
      watches: '关注',
      watchesHint: '这些会话完成时 Fishball 会告诉你。可在会话菜单中设置。',
      'watchBy.user': '你',
      'watchBy.assistant': 'Fishball',
      'watchBy.agent': '会话自己',
      'watchCondition.finished': '完成时',
      'watchCondition.per-turn': '每个回合',
      'watchStatus.active': '进行中',
      'watchStatus.closed': '已关闭',
      'watchStatus.target-missing': '会话已不存在',
      watchFired: '已通知 {count} 次',
      intake: '队列',
      intakeHint: '会唤醒 Fishball 的输入：其他会话的消息、你转发的会话和通知。',
      intakeQueued: '等待读取',
      intakeFailed: '无法送达',
      intakeWakeups: '本小时唤醒次数',
      'intakeKind.session': '来自会话',
      'intakeKind.user': '来自你',
      'intakeKind.system': '通知',
      'intakeKind.watch': '关注的会话',
      'intakeKind.approval': '权限请求',
      'intakeStatus.pending': '等待中',
      'intakeStatus.accepted': '已排队',
      'intakeStatus.consumed': '已读取',
      'intakeStatus.discarded': '已清除',
      'intakeStatus.failed': '失败',
      outbox: 'Fishball 发出的',
      outboxHint: 'Fishball 发给其他会话的消息和它新建的会话。',
      'outboxKind.message': '消息',
      'outboxKind.start': '新会话',
      'outboxKind.redirect': '重定向',
      'outboxStatus.delivered': '已送达',
      'outboxStatus.unconfirmed': '已送达，未确认',
      'outboxStatus.failed': '失败',
      nothingYet: '暂无。',
      sources: '插件信息源',
      sourcesHint: '通过 ctx.fishball 向 Fishball 发送事件的插件。Fishball 未运行或关闭了该插件时，信息源处于关闭状态。',
      sourceOn: '正在接收事件',
      sourceOff: '已关闭',
      'intakeKind.plugin': '插件事件',
      approvals: '权限请求',
      managedSessions: '由 Fishball 管理的会话',
      managedSessionsHint: 'Fishball 负责的会话：它们可以给 Fishball 发消息，权限请求会先交给 Fishball。其他会话都由你自己处理。',
      managedSince: '自 {at}',
      'managedBy.hand-over': '由你交给它',
      'managedBy.send': '由你发送给它',
      'managedBy.message': 'Fishball 发过消息',
      'managedBy.start': 'Fishball 启动',
      'managedBy.prompt-answer': 'Fishball 答复过提示',
      approvalsHint: '受管理会话的权限请求会先交给 Fishball。它只会在你于对话中给出的授权范围内批准低风险请求，其余的交给你：会话事先询问的请求在 Fishball 对话上方的待处理区等你，直接调用则同时在待处理区和该会话中等你。',
      approvalsWaiting: '等待 Fishball 处理',
      'approvalAnswer.allow': 'Fishball 已批准',
      'approvalAnswer.escalate': '已转交给你',
      'approvalAnswer.timeout': '超时未答复，已转交给你',
      'approvalAnswer.withdrawn': '已撤回',
      'approvalAnswer.released': '会话已不再由 Fishball 管理，已转交给你',
      'approvalAnswer.reject': 'Fishball 已拒绝',
      'approvalAnswer.ask': 'Fishball 提出了问题，未获回复',
      'approvalAnswer.to-user': '未经 Fishball 回答，直接转交给你',
      approvalsPile: '在待处理区等你处理：{count}',
      'approvalAnswer.pass': '按 Fishball 的一次性批准运行',
      'approvalAnswer.pass-user': '按你的一次性批准运行',
      'approvalAnswer.grant': 'Fishball 已批准并授予长期许可',
      'approvalAnswer.grant-used': '按 Fishball 的长期许可运行',
      'approvalAnswer.answer': 'Fishball 已回答问题',
      approvalsGrants: '生效中的长期许可：{count}',
      'approvalOutcome.allowed-once': '允许一次',
      'approvalOutcome.rejected': '已拒绝',
      'approvalOutcome.cancelled': '已取消',
      'approvalOutcome.unavailable': '无人答复',
      'approvalOutcome.answered-by-fishball': '由 Fishball 回答',
      'approvalOutcome.answered-in-pile': '由你在待处理区回答',
      'approvalOutcome.answered-in-session': '在其会话中回答',
      'approvalOutcome.closed': '已关闭',
      'approvalOutcome.back-to-session': '已回到其会话',
      plugins: 'Fishball 的插件',
      pluginToggle: '在 Fishball 中使用 {name}',
      uninstall: '卸载',
      uninstallLabel: '从 Fishball 卸载 {name}',
      removing: '本回合结束后卸载',
      'pluginError.remove-failed': '卸载失败；它仍已安装并保持关闭',
      installTitle: '仅为 Fishball 安装插件',
      installHint: '包名（可带版本）、Git 地址、tarball URL 或文件夹的绝对路径。它会安装到 Fishball 自己的文件夹，而不是 DSH，并只为 Fishball 开启。',
      installSpecLabel: '包',
      install: '安装',
      'installError.not-bundle': '这个包不是 DSH 插件。',
      'installError.ambiguous-install': 'pnpm 改动了不止一个包，因此没有安装。',
      'installError.incompatible-version': '这个包不支持当前的 DSH 版本。',
      'installError.cancelled': '安装已取消。',
      'installError.build-blocked': 'pnpm 拦下了需要你批准的安装脚本。',
      'installError.operation-error': 'pnpm 无法安装它，输出见下方。',
      'installError.no-profile': '安装需要 DSH 配置。',
      installForFishballOnly: '仅为 Fishball 安装',
      installForFishballDescription: '安装到 Fishball 自己的文件夹；其他会话不会获得它',
      installPlaceholder: '包名、包名@1.2.0、Git 地址或 /绝对路径',
      installTrust: '插件拥有这台电脑的完全访问权限。请只安装你信任的插件。',
      installChecking: '正在检查这个包…',
      installConfirm: '为 Fishball 安装',
      installSource: '来源：{source}',
      defaultRegistry: 'pnpm 使用的源',
      alsoInDsh: '这个包也安装在 DSH 中。Fishball 会安装自己的一份，与 DSH 的分开。',
      shippedByDsh: 'DSH 自带同名插件。Fishball 会安装自己的一份，并使用它而不是 DSH 的。',
      cancelTooLate: '已无法取消：安装正在完成。',
      'installError.too-large': '包名过长。',
      'installPhase.waiting': '正在开始…',
      'installPhase.installing': '正在安装…',
      'installPhase.applying': '正在完成…',
      'installPhase.cancelling': '正在取消…',
      installAttempt: '（第 {index} 个源，共 {total} 个）',
      showOutput: '安装输出',
      cancelInstall: '取消安装',
      installDone: '{name} {version} 已为 Fishball 安装并开启。',
      installDoneOff: '已安装，但无法开启：',
      openPluginPage: '打开它的页面',
      installRetry: '重试',
      allowScripts: '允许这些脚本并重试',
      pendingScripts: '想要运行安装脚本的包：',
      back: '返回',
      'inspectProblem.invalid-spec': 'DSH 不接受这个包规格。',
      'inspectProblem.already-installed': '这个包已经安装。',
      'inspectProblem.not-found': '没有找到这个包。',
      'inspectProblem.not-a-package': '这不是一个包。',
      'inspectProblem.not-a-bundle': '这个包不是 DSH 插件。',
      'inspectProblem.network': '无法连接到源。',
      'inspectProblem.unknown': '无法检查这个包。',
      'installError.unavailable': 'Fishball 未运行。',
      'installError.invalid-spec': 'DSH 不接受这个包规格。请使用包名、文件夹的绝对路径、git 地址或 tarball URL。',
      'installError.already-installed': '这个插件已为 Fishball 安装。',
      installFailed: '操作未成功。',
      pending: '本回合结束后生效',
      waiting: '启动中…',
      'pluginError.row-id-conflict': '它有两个部分同名，不能仅为 Fishball 运行',
      'pluginError.limit-reached': '仅为 Fishball 运行的插件过多',
      pluginErrorOther: '为 Fishball 启动失败',
      changedByfishball: '由 Fishball 更改',
      changedByuser: '由你更改',
      'tool.unchecked': '未检查',
      'tool.hidden': '已隐藏',
      'tool.other-sessions': '供其他会话使用',
      'tool.plugin-off': '已关闭',
      remove: '移除',
      'pluginError.edits-other-rows': '它会修改其他插件，不能仅为 Fishball 运行',
      'pluginError.no-rows': '没有可为 Fishball 运行的内容',
      'pluginError.row-failed': '为 Fishball 启动失败',
      'pluginError.leaks-service': '只能在 DSH 自己的界面中使用，不能仅为 Fishball 运行',
      'pluginError.no-profile': '需要 DSH 配置',
      changeFailed: '该更改未被接受。',
      tabTitle: 'Fishball',
      refresh: '刷新',
      refreshFailed: '无法重新读取插件列表。请再试一次刷新。',
      pluginsSummary: 'Fishball 中已开启：{on} 个。等待你处理：{needs} 个。',
      pluginsWhere: '在插件列表的 Fishball 标签页中管理它们。',
      recommended: '推荐插件',
      recommendedHint: '与 Fishball 配合良好的插件。安装会在你确认后放入 Fishball 自己的文件夹，DSH 的其他会话不受影响。',
      recommendedFirst: '优先推荐',
      recommendedNote: '它们能显著改善 Fishball 的使用体验。',
      'recommendedCategory.context': '上下文管理',
      'recommendedCategory.memory': '记忆',
      'recommendedCategory.channel': '渠道',
      'recommendedCategory.pet': '宠物',
      recommendedPetNote: '宠物只在 DSH 自己的界面中绘制，而仅为 Fishball 运行的插件没有浏览器部分，所以这里无法列出。',
      recommendedSource: '来源',
      recommendedInstallLabel: '为 Fishball 安装 {name}',
      recommendedTurnOn: '在 Fishball 中开启',
      recommendedTurnOnLabel: '在 Fishball 中开启 {name}',
      'recommendedState.installed': '已安装',
      'recommendedState.dsh-on': 'Fishball 中已开启',
      'recommendedState.dsh-off': '已装在 DSH，Fishball 中关闭',
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
      welcomeTitle: '欢迎使用 Fishball',
      welcomeIntro: '插件能让 Fishball 做得更多：',
      welcomeSee: '查看推荐插件',
      installForFishball: '为 Fishball 安装',
      'group.builtin': '内置',
      'group.dsh': 'DSH 插件',
      'group.fishball': '仅为 Fishball 安装',
      'group.own': 'Fishball',
      'group.tools': '来自未知插件的工具',
      'dsh.on': 'DSH 中已开启',
      'dsh.off': 'DSH 中已关闭',
      'dsh.builtin': '内置',
      'dsh.none': '仅 Fishball',
      'dsh.fishball': 'Fishball',
      runsOnlyInFishball: '仅在 Fishball 中运行',
      onInFishball: 'Fishball 中已开启',
      offInFishball: 'Fishball 中已关闭',
      toolsWait: '{count} 个等待你处理',
      backToList: '插件',
      backToListLabel: '返回 Fishball 列表',
      toolsCount: '{count} 个工具',
      detailsTitle: '详情',
      viewPlugin: '查看 {name}',
      inDsh: '在 DSH 中',
      'inDsh.on': '对所有会话开启',
      'inDsh.off': '已安装，已关闭',
      'inDsh.builtin': '内置',
      'inDsh.none': '未安装在 DSH',
      'inDsh.fishball': 'dsh-fishball 的一部分',
      openInDsh: '在 DSH 中打开',
      lastChange: '更改',
      neverChanged: '尚未更改',
      changedAt: '{who} · {when}',
      'who.user': '由你',
      'who.fishball': '由 Fishball',
      tools: '工具',
      noTools: '没有工具。',
      'tool.visible': '可见',
      'tool.allowed': '你已允许',
      settingsTitle: 'Fishball 的设置',
      settingsShared: '此插件在 DSH 中已开启，所有会话共用一份，使用 DSH 的设置。请在 DSH 的页面中修改。',
      settingsUnused: '你为 Fishball 做的设置会保留，但此插件在 DSH 中运行时不会使用。',
      settingsNone: '此插件没有可供 Fishball 修改的设置。',
      settingsOwnError: '插件自身的设置无效：{message}',
      settingsChanged: '已更改',
      settingsReset: '重置',
      settingsResetAll: '全部重置',
      settingsSaved: '已保存。在 Fishball 当前回合结束后生效。',
      settingsFailed: '未能保存。',
      settingsInvalid: '此值不被接受。',
      settingsReadOnly: '仅显示：这类设置不能在这里修改。',
      settingsListHint: '每行一项。',
      settingsRow: '部分：{row}',
      secretSet: '已设置',
      secretUnset: '未设置',
      secretHint: '输入新值以替换。它不会显示，Fishball 也看不到。',
      secretClear: '清除',
      pageLoadFailed: '无法加载此页面。',
      experimental: '实验性',
      'group.allowed': '你允许的、未在上方列出的工具',
      resetField: '重置 {name}',
      clearField: '清除 {name}',
      settingsRowUnavailable: '无法读取部分 {row} 的设置。',
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
      'field.intakeRowsShown': '本页显示的队列行数',
      'field.outboxShown': '本页显示的发件箱条目',
      'field.watchesShown': '本页和 list_watches 显示的关注数',
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
      pileTitle: '等你处理（{count}）',
      pileOwnName: 'Fishball',
      pileBack: '返回',
      questionAnswer: '回答',
      whyRun: '{who} 想运行 {command}',
      whyUseOn: '{who} 想使用 {tool}：{argument}',
      whyUse: '{who} 想使用 {tool}',
      whyQuestion: '{who} 问你：{question}',
      whyPlan: '{who} 请你审阅它的计划',
      'cardKind.asked': '事先询问',
      'cardKind.direct': '直接调用',
      'cardKind.own': 'Fishball',
      cardOwnTitle: 'Fishball 请求',
      'cardKind.question': '问题',
      'cardKind.plan-review': '计划审阅',
      cardContinued: '会话已继续，你的回答会作为回复送达',
      questionOther: '你自己的回答（可选）',
      questionSubmit: '发送回答',
      planApprove: '批准',
      planKeep: '继续规划',
      planFeedback: '给会话的反馈（可选）',
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
      cardArgumentsCut: '参数已截断。',
      cardQuotes: '你在该会话中的要求',
      cardThread: '与 Fishball 的讨论',
      'threadFrom.agent': '会话',
      'threadFrom.fishball': 'Fishball',
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
      tagAskedFishball: '已询问 Fishball',
      'tagAnswer.allow': '允许一次',
      'tagAnswer.reject': '已拒绝',
      'tagAnswer.ask': '提了一个问题',
      tagSentToYou: '已转交给你',
      'tagAnswer.grant': '已授予长期许可',
      'tagAnswer.answer': '已回答',
      'tagAnswer.approve': '已批准计划',
      'tagAnswer.keep-planning': '继续规划',
      tagGrant: '由 Fishball 的长期许可允许：{what}',
      tagPrompt: 'Fishball 已答复：{decision}',
      grantExact: '完全相同的 {tool} 调用',
      grantsTitle: '长期许可（{count}）',
      grantEnds: '{at} 到期',
      grantUses: '已使用 {count} 次',
      grantUsedOnce: '已使用 1 次',
      grantPaused: 'Fishball 或“权限请求”关闭期间暂停',
      revoke: '撤销',
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
      // Motion is the only thing that stops: the pill and its count stay.
      `@media (prefers-reduced-motion:reduce){.${CLS.badge},.${CLS.wag},.${CLS.swim}{animation:none}}`,
      `.${MODEL.pickerClass}{display:flex;flex-wrap:wrap;gap:12px;align-items:center}`,
      `.${MODEL.pickerClass} select{flex:1;min-width:0}`,
      `.${MODEL.settingsClass} select{width:100%;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);padding:8px 12px}`,
      `.${MODEL.gateClass}{${DOCK_CARD_WIDTH};${DOCK_CARD_LOOK};padding:12px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;font:var(--dsw-font-xs-13)}`,
      `.${CLS.row}{display:flex;gap:12px;align-items:baseline}`,
      `.${CLS.label}{min-width:120px;color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.code}{font-family:var(--ds-font-family-code);overflow-wrap:anywhere}`,
      `.${CLS.list}{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}`,
      `.${CLS.list} li{padding:2px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-family:var(--ds-font-family-code)}`,
      `.${CLS.name}{position:relative;display:inline-block;font-family:${WORDMARK.fontFamily};font-weight:${WORDMARK.fontWeight};letter-spacing:${WORDMARK.letterSpacing};line-height:${WORDMARK.lineHeight};top:${WORDMARK.lift}}`,
      // Overlaid on the corner, so it takes no layout space and cannot push the sidebar controls.
      `.${CLS.tag}{position:absolute;right:${BRAND_TAG.right};bottom:${BRAND_TAG.bottom};padding:0 ${BRAND_TAG.paddingX};border-radius:${BRAND_TAG.radius};background:${BRAND_TAG.fill};color:${BRAND_TAG.textColor};font:${BRAND_TAG.fontWeight} ${BRAND_TAG.fontSize}/${BRAND_TAG.lineHeight} ${BRAND_TAG.fontFamily};box-shadow:${BRAND_TAG.ring},${BRAND_TAG.shadow};white-space:nowrap;pointer-events:none}`,
      `.${CLS.grow}{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}`,
      `.${CLS.muted}{color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.field}{display:flex;flex-direction:column;gap:6px;margin-top:8px}`,
      // DSH's input colours (dsh-client-ui-primitives SettingsValueField): --dsw-alias-border-primary is not defined in dialogs.
      `.${CLS.note}{width:100%;box-sizing:border-box;padding:8px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;resize:vertical}`,
      `.${CLS.entries}{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}`,
      // The pile, the ask_fishball row and the turn tags (revision 11, S37's fixture look), in DSH's theme tokens
      // so they follow light and dark. The pile's height comes from pileMaxHeightVh, set inline.
      `.${CLS.pileDock}{${PILE_DOCK_WIDTH};min-width:0}`,
      `.${CLS.pile}{margin:0;overflow:auto;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:${PILE.fill};color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}`,
      `.${CLS.pileHead}{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;padding:8px 12px;border:0;border-bottom:.5px solid var(--dsw-alias-border-l2);background:${PILE.fill};color:var(--dsw-alias-label-primary);font:inherit;font-weight:600;text-align:left;cursor:pointer}`,
      `.${CLS.pileHead}:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}`,
      `.${CLS.card}{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-top:.5px solid var(--dsw-alias-border-l2)}`,
      `.${CLS.entries}>:first-child>.${CLS.revealInner}>.${CLS.card}{border-top:0}`,
      // The reveal (rev11-pile-list): a one-row grid from 0fr to 1fr, so the box's height moves and the
      // entries around it reflow with it. Its content is clipped only while it moves, so focus rings
      // and the pinned titles work once it is open.
      `.${CLS.reveal}{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows ${PILE_LIST.revealMs}ms ${PILE_LIST.easing},opacity ${PILE_LIST.revealMs}ms ${PILE_LIST.easing}}`,
      `.${CLS.reveal}[data-fishball-reveal="${PILE_LIST.reveal.hidden}"],.${CLS.reveal}[data-fishball-reveal="${PILE_LIST.reveal.closing}"]{grid-template-rows:0fr;opacity:0}`,
      `.${CLS.revealInner}{min-width:0;min-height:0}`,
      `.${CLS.reveal}:not([data-fishball-reveal="${PILE_LIST.reveal.open}"])>.${CLS.revealInner}{overflow:hidden}`,
      `@media (prefers-reduced-motion: reduce){.${CLS.reveal}{transition:none}}`,
      `.${CLS.pileRow}{display:flex;align-items:center;gap:${PILE_LIST.rowGapPx}px;cursor:pointer}`,
      `.${CLS.rowMain}{display:flex;flex:1;flex-direction:column;min-width:0;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}`,
      `.${CLS.rowMain}:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}`,
      `.${CLS.rowLine}{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}`,
      `.${CLS.rowControls}{display:flex;flex:none;flex-direction:column;align-items:flex-end;gap:4px;cursor:auto}`,
      `.${CLS.detail},.${CLS.detailBody}{display:flex;flex-direction:column;gap:6px}`,
      `.${CLS.cardHead}{display:flex;flex-wrap:wrap;align-items:center;gap:8px}`,
      `.${CLS.title}{color:var(--dsw-alias-label-primary);font-weight:500;overflow-wrap:anywhere}`,
      `.${CLS.pre}{margin:0;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);font-family:var(--ds-font-family-code);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${CLS.quote}{margin:0;padding:2px 8px;border-left:3px solid color-mix(in srgb,${FISH_MARK.eyeColor} 50%,transparent);white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${CLS.thread}{display:flex;flex-direction:column;gap:2px;margin:0;padding-left:16px;white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${CLS.actions}{display:flex;flex-wrap:wrap;align-items:center;gap:8px}`,
      `.${CLS.askRow}{display:flex;flex-direction:column;gap:6px;padding:6px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}`,
      `.${CLS.turnTags}{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}`,
      `.${CLS.fishTag}{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border:.5px solid color-mix(in srgb,${FISH_MARK.eyeColor} 35%,transparent);border-radius:999px;background:color-mix(in srgb,${FISH_MARK.eyeColor} 12%,transparent);color:var(--dsw-alias-label-primary);font-size:12px}`,
      // The managed-session banner and sidebar mark (item 30), in DSH's theme tokens for light and dark.
      // Width and spacing as DSH's Todo dock (DSH_COMPOSER): no margin of its own, so the composer stack's gap spaces it.
      `.${CLS.managedBanner}{${DOCK_CARD_WIDTH};display:flex;align-items:center;gap:${MANAGED_BANNER.gapPx}px;padding:${MANAGED_BANNER.paddingYPx}px ${MANAGED_BANNER.paddingEndPx}px ${MANAGED_BANNER.paddingYPx}px ${MANAGED_BANNER.paddingStartPx}px;${DOCK_CARD_LOOK};font-size:${MANAGED_BANNER.fontPx}px}`,
      `.${CLS.managedText}{flex:1;min-width:0}`,
      // The welcome card (revision 12) shares the banner's width and look; it stacks its lines.
      `.${CLS.welcome}{${DOCK_CARD_WIDTH};display:flex;flex-direction:column;gap:${WELCOME.gapPx}px;padding:${WELCOME.paddingYPx}px ${WELCOME.paddingEndPx}px ${WELCOME.paddingYPx}px ${WELCOME.paddingStartPx}px;${DOCK_CARD_LOOK};font-size:${WELCOME.fontPx}px}`,
      `.${CLS.welcomeLine}{display:flex;align-items:center;gap:${WELCOME.headGapPx}px}`,
      // Recommended plugins on the settings page: one compact row per plugin, the description cut to one line.
      `.${CLS.recCategory}{display:flex;align-items:center;gap:${RECOMMENDED.categoryGapPx}px;margin:0}`,
      `.${CLS.recRow}{display:flex;align-items:center;gap:${RECOMMENDED.rowGapPx}px;padding:${RECOMMENDED.rowPaddingYPx}px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}`,
      `.${CLS.recDesc}{overflow:hidden;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap}`,
      `.${CLS.managedRow}{display:inline-flex;align-items:center;justify-content:center;width:${MANAGED_ROW.cellPx}px;height:${MANAGED_ROW.cellPx}px;color:var(--dsw-alias-label-primary)}`,
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
      // Fishball's colour on its own controls (revision 10a). A switch is a button too: only its "on" track changes.
      // Enabled buttons only: a disabled one keeps DSH's own disabled look (review L8).
      `.${MCLS.accent} button:not([role=switch]):not(:disabled){background:${FISHBALL_COLOUR.fill};color:${FISHBALL_COLOUR.text}}`,
      `.${MCLS.accent} button:not([role=switch]):hover:not(:disabled){background:${FISHBALL_COLOUR.fillHover}}`,
      // Fishball's switches (owner's choice): magenta when on, and a small fish on the knob in both
      // states, so one reads as Fishball's wherever it appears, DSH's pages included. DSH's switch
      // is a button[role=switch] with one span knob (dsh-client-ui-primitives Switch, rc.2).
      `.${MCLS.accent} [role=switch][aria-checked="true"]{background:${FISHBALL_COLOUR.accent}}`,
      // [aria-checked] outranks DSH's off-state knob rule, whose `background` shorthand would clear the fish.
      `.${MCLS.accent} [role=switch][aria-checked] > span{background-color:${FISHBALL_SWITCH.knob};background-image:${FISHBALL_SWITCH.fish};background-position:center;background-repeat:no-repeat;background-size:${FISHBALL_SWITCH.fishSize}}`,
      `.${MCLS.accent}{display:inline-flex;align-items:center;gap:8px}`,
      `.${MCLS.menuIcon}{display:inline-flex;color:${FISHBALL_COLOUR.accent}}`,
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
      let snapshot = { status: STATUS.starting, sessionId: null, error: null, limits: {}, hiddenTools: [] }
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
    const recover = (action) => post(API.recovery, { action })

    /** Unread replies from the Host snapshot: a whole number, 0 until the first frame arrives. */
    const unreadCount = (state) => state.unread?.count ?? 0

    /** Which brand icon you chose; Fishball's own until the Host says otherwise. */
    const brandStyleOf = (state) => state.preferences?.brandStyle ?? BRAND_STYLE.fishball

    /** Fishball's fish: wags while anything is unread. */
    function FishballIcon({ size, unread }) {
      return h('svg', { width: size, height: size, viewBox: FISH_MARK.viewBox, className: unread ? `${CLS.mark} ${CLS.wag}` : CLS.mark, 'aria-hidden': true, 'data-fishball-mark': true },
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

    /** DSH's orca: the stock mark, swimming while anything is unread. */
    function OrcaIcon({ size, unread }) {
      const swims = unread && window.matchMedia(MOTION_QUERY).matches
      return h('svg', {
        width: size, height: size * FISH_LOGO_VIEWBOX.height / FISH_LOGO_VIEWBOX.width, viewBox: `0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`,
        fill: 'none', className: unread ? CLS.swim : undefined, 'aria-hidden': true, 'data-fishball-orca': true,
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
          count > 0 ? h('span', { className: CLS.badge, 'data-fishball-badge': true }, count > UNREAD_BADGE.max ? t('unreadMany', { max: UNREAD_BADGE.max }) : String(count)) : null)
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

    /** How to open Fishball's page under Plugins, or undefined when no service can. */
    function settingsOpener(ctx) {
      const navigation = ctx.get(SERVICE.pluginNavigation)
      if (navigation !== undefined) return () => navigation.openBundle(PACKAGE_NAME)
      const layout = ctx.get(SERVICE.layout)
      return layout === undefined ? undefined : () => layout.selectPanel(PLUGINS_PANEL)
    }

    function openSettings(ctx) {
      settingsOpener(ctx)?.()
    }

    /** Statuses in which a running agent holds the session, so the brand opens its chat. */
    const CHAT_STATUSES = Object.freeze([STATUS.live, STATUS.starting])

    /**
     * How to open Fishball now: its chat while an agent holds the session (live, or still
     * running its setup turn, whose approval prompts appear only in that chat), else its
     * settings. Undefined when the service that would do it is missing, so the brand leaves
     * the click to the shell.
     */
    function fishballOpener(ctx) {
      const state = stateSource.get()
      if (!CHAT_STATUSES.includes(state.status) || !state.sessionId) return settingsOpener(ctx)
      const workspace = ctx.get(SERVICE.uiWorkspace)
      return workspace === undefined ? undefined : () => workspace.openSession(state.sessionId)
    }

    function openFishball(ctx) {
      fishballOpener(ctx)?.()
    }

    function makeBrandName(ctx, t) {
      return function FishballBrandName() {
        const ref = React.useRef(null)
        // Subscribed only to keep the shared state stream open while the brand is shown:
        // the click handler reads the latest snapshot when it runs.
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
            const open = fishballOpener(ctx)
            if (open === undefined) return
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            open()
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

    /** Status, recovery actions and hidden tools; rendered above the limits on Fishball's Plugins page. */
    function makeStatus(ctx, t) {
      return function FishballStatus() {
        const state = useFishball()
        const [recoverFailed, setRecoverFailed] = React.useState(false)
        const status = state.status ?? STATUS.starting
        const offered = OFFERED[status] ?? []
        const run = async (action) => { setRecoverFailed(!(await recover(action))) }
        return h('div', { className: CLS.section, 'data-fishball-settings': true },
          h('div', { className: CLS.row }, h('span', { className: CLS.label }, t('status')), h('span', { 'data-fishball-status': status }, t('status.' + status))),
          state.sessionId ? h('div', { className: CLS.row }, h('span', { className: CLS.label }, t('session')), h('span', { className: CLS.code }, state.sessionId)) : null,
          state.cwd ? h('div', { className: CLS.row }, h('span', { className: CLS.label }, t('folder')), h('span', { className: CLS.code }, state.cwd)) : null,
          state.error ? h('div', { className: CLS.row }, h('span', { className: CLS.label }, t('error')), h('span', { className: CLS.code }, state.error.code)) : null,
          h('div', { className: CLS.row },
            status === STATUS.live ? h(Button, { type: 'button', size: 'sm', onClick: () => openFishball(ctx) }, t('openChat')) : null,
            offered.includes(ACTION.retry) ? h(Button, { type: 'button', size: 'sm', onClick: () => run(ACTION.retry) }, t('retry')) : null,
            offered.includes(ACTION.adopt) ? h(Button, { type: 'button', size: 'sm', variant: 'primary', onClick: () => run(ACTION.adopt) }, t('adopt')) : null),
          recoverFailed ? h('div', { role: 'alert' }, t('recoverFailed')) : null)
      }
    }

    /**
     * The plugins on Fishball's settings page (DESIGN §10d): one line of counts. The plugins
     * themselves are managed in the Fishball tab of DSH's Plugins page; DSH offers no way to
     * select that tab from here (spike S28), so the page names it instead of linking to it.
     */
    function makePluginsSummary(t) {
      return function FishballPluginsSummary() {
        const catalog = useFishball().catalog
        if (!catalog) return null
        return h('div', { className: CLS.section, 'data-fishball-plugins-summary': true },
          h('h3', null, t('plugins')),
          h('p', null, t('pluginsSummary', { on: catalog.plugins.filter((plugin) => plugin.on).length, needs: catalog.plugins.filter(needsYou).length })),
          h('p', { className: CLS.muted }, t('pluginsWhere')))
      }
    }

    /**
     * The welcome card's link asks the settings page to bring "Recommended plugins" into view
     * (DESIGN §10f). The page mounts only after DSH opens it, so the request waits here until the
     * section takes it.
     */
    const recommendedFocus = (() => {
      let requestedAt = null
      return {
        request: () => { requestedAt = Date.now() },
        take: () => { const fresh = requestedAt !== null && Date.now() - requestedAt <= RECOMMENDED.focusMs; requestedAt = null; return fresh },
      }
    })()

    /** One recommended plugin's action (DESIGN §10f table): a reason, a state, Install or Turn on. */
    function RecommendedAction({ item, t, onFailed }) {
      if (item.blocked) return h(Tag, { tone: 'danger' }, pluginErrorText(t, item.blocked))
      if (item.state === RECOMMENDED.state.install) {
        return h('span', { className: MCLS.accent }, h(Button, { type: 'button', size: 'sm', variant: 'primary', 'aria-label': t('recommendedInstallLabel', { name: item.packageName }), onClick: () => installRequest.open(INSTALL_FROM.settings, item.spec) }, t('install')))
      }
      const state = h(Tag, { tone: 'neutral' }, t('recommendedState.' + item.state))
      if (item.state !== RECOMMENDED.state.dshOff) return state
      // Your own switch, as on the Fishball tab (POST plugins); it applies when Fishball's turn ends.
      const turnOn = async () => onFailed(!(await post(API.plugins, { plugin: item.plugin, on: true })))
      return h(React.Fragment, null, state,
        h('span', { className: MCLS.accent }, h(Button, { type: 'button', size: 'sm', variant: 'primary', 'aria-label': t('recommendedTurnOnLabel', { name: item.packageName }), onClick: turnOn }, t('recommendedTurnOn'))))
    }

    /** One compact row: package name, its description on one line (full text on hover), Source, and the action. */
    function RecommendedRow({ item, t }) {
      const [failed, setFailed] = React.useState(false)
      const description = t('recommendedDesc.' + item.packageName)
      return h('li', { className: CLS.recRow, 'data-fishball-recommended': item.packageName, 'data-state': item.blocked ? 'blocked' : item.state },
        h('div', { className: CLS.grow },
          h('span', { className: CLS.code }, item.packageName),
          h('span', { className: CLS.recDesc, title: description }, description),
          failed ? h('span', { role: 'alert' }, t('changeFailed')) : null),
        h('a', { href: item.source, target: '_blank', rel: 'noopener noreferrer' }, t('recommendedSource')),
        h(RecommendedAction, { item, t, onFailed: setFailed }))
    }

    /** The "Recommended first" badge in Fishball's colour (the turn tags' pill). */
    const recommendedBadge = (t) => h('span', { className: CLS.fishTag }, t('recommendedFirst'))

    /**
     * Recommended plugins on Fishball's settings page (DESIGN §10f): the categories in order, the
     * highlighted ones with their badge and note, Pet with its note. States come from the Host's
     * snapshot, which reads them from the catalog, so they change live.
     */
    function makeRecommended(t) {
      return function FishballRecommended() {
        const recommended = useFishball().recommended
        const ref = React.useRef(null)
        const loaded = Boolean(recommended)
        React.useEffect(() => {
          if (loaded && recommendedFocus.take()) ref.current?.scrollIntoView(RECOMMENDED.scroll)
        }, [loaded])
        if (!recommended) return null
        return h('div', { className: CLS.section, ref, 'data-fishball-recommended-section': true },
          h('h3', null, t('recommended')),
          h('p', { className: CLS.muted }, t('recommendedHint')),
          recommended.categories.map(({ category, plugins }) => {
            const highlighted = recommended.highlighted.includes(category)
            return h('div', { key: category, 'data-fishball-recommended-category': category },
              h('h4', { className: CLS.recCategory }, t('recommendedCategory.' + category), highlighted ? recommendedBadge(t) : null),
              highlighted ? h('p', { className: CLS.muted }, t('recommendedNote')) : null,
              plugins.length === 0
                ? h('p', { className: CLS.muted }, t('recommendedPetNote'))
                : h('ul', { className: CLS.entries }, plugins.map((item) => h(RecommendedRow, { key: item.packageName, item, t }))))
          }))
      }
    }

    /**
     * The welcome card's state for this page load: the session it was shown in, and whether it was
     * closed. Kept outside the component because DSH draws the dock only inside its composer bar,
     * which a panel (a question) can replace; the card must come back with it, while the Host's
     * flag is already false (DESIGN §10f).
     */
    const welcomeState = valueStore({ shownIn: null, closed: false })
    const useWelcomeState = () => React.useSyncExternalStore(welcomeState.subscribe, welcomeState.get)

    /**
     * The one-time welcome card above Fishball's composer (DESIGN §10f). It reports itself shown
     * as soon as it renders, so it never comes back after this page load, and stays until you
     * close it, follow its link, or open another session's chat.
     */
    function makeWelcome(ctx, t) {
      return function FishballWelcome({ sessionId }) {
        const state = useFishball()
        const { shownIn, closed } = useWelcomeState()
        const eligible = Boolean(sessionId) && sessionId === state.sessionId && state.status === STATUS.live && state.welcome?.show === true && Boolean(state.recommended)
        React.useEffect(() => {
          if (!eligible || shownIn !== null || closed) return
          welcomeState.set({ shownIn: sessionId, closed: false })
          // A report lost to a network failure only means the card shows once more next time.
          void post(API.welcomeSeen, {})
        }, [eligible, shownIn, closed])
        // Another session's chat ends it: the dock is drawn per session.
        React.useEffect(() => { if (shownIn !== null && sessionId !== shownIn && !closed) welcomeState.set({ shownIn, closed: true }) }, [sessionId, shownIn, closed])
        if (shownIn === null || closed || sessionId !== shownIn || !state.recommended) return null
        const close = () => welcomeState.set({ shownIn, closed: true })
        // Read when drawn, as the other openers are: the service may arrive after this module.
        const openPage = settingsOpener(ctx)
        const Icon = brandIconOf(state)
        const { categories, highlighted } = state.recommended
        const see = () => { recommendedFocus.request(); close(); openPage() }
        return h('section', { className: CLS.welcome, 'aria-label': t('welcomeTitle'), 'data-fishball-welcome': true },
          h('div', { className: CLS.welcomeLine },
            h(Icon, { size: WELCOME.iconPx, unread: false }),
            h('strong', { className: CLS.managedText }, t('welcomeTitle')),
            h('button', { type: 'button', className: MCLS.iconButton, 'aria-label': t('close'), onClick: close }, h(IconCloseOutlineRegular, { size: WELCOME.closeIconPx }))),
          h('span', null, t('welcomeIntro')),
          h('ul', { className: CLS.entries }, categories.map(({ category }) => h('li', { key: category, className: CLS.welcomeLine },
            t('recommendedCategory.' + category), highlighted.includes(category) ? recommendedBadge(t) : null))),
          h('span', { className: CLS.muted }, t('recommendedNote')),
          // Where no service can open the settings page, there is nothing to link to (Reading, §10f).
          openPage ? h('div', null, h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: see }, t('welcomeSee'))) : null)
      }
    }

    /**
     * Install for Fishball (DESIGN §10d revision 10a): one request store shared by the item in
     * DSH's Add plugin menu and the Fishball tab's button. The dialog lives in the shell overlay,
     * so it outlives the menu that opened it (as "Send to Fishball" does).
     */
    const installRequest = (() => {
      const store = valueStore(null)
      let count = 0
      // spec: a package already chosen (a recommended plugin, DESIGN §10f); the dialog checks it at once.
      return { ...store, open: (from, spec = null) => store.set({ from, spec, id: ++count }), close: () => store.set(null) }
    })()
    const useInstallRequest = () => React.useSyncExternalStore(installRequest.subscribe, installRequest.get)

    /** Which plugin's page the Fishball tab shows (null: the list); the install dialog opens a new plugin's page through it. */
    const managerView = (() => {
      const store = valueStore(null)
      return { ...store, show: store.set }
    })()
    const useManagerView = () => React.useSyncExternalStore(managerView.subscribe, managerView.get)
    /** Counts the Fishball tab's refreshes, so an open plugin page reads its data again too. */
    const managerRefreshes = valueStore(0)
    const useManagerRefreshes = () => React.useSyncExternalStore(managerRefreshes.subscribe, managerRefreshes.get)

    /** Where a checked package comes from, in words (DSH's inspection: registry, folder, Git host or tarball host). */
    function installSource(subject, spec, t) {
      if (subject.kind === SPEC_KIND_REGISTRY) return subject.registry ?? t('defaultRegistry')
      return subject.host ?? spec
    }

    /** "Install for Fishball only" in DSH's Add plugin menu, laid out like DSH's own items, with Fishball's mark in its colour. */
    function makeAddMenuItem(t) {
      return function FishballAddMenuItem({ onDismiss }) {
        return h(MenuItemButton, {
          icon: h('span', { className: MCLS.menuIcon }, h(FishballIcon, { size: ADD_MENU.iconSize, unread: false })),
          onSelect: () => { onDismiss?.(); installRequest.open(INSTALL_FROM.menu) },
        }, h('span', { className: MCLS.copy },
          h('span', null, t('installForFishballOnly')),
          h('span', { className: MCLS.copyDesc }, t('installForFishballDescription'))))
      }
    }

    /** The install dialog while one is open; a new request starts a fresh flow. */
    function makeInstallDialog(t, listen) {
      return function FishballInstallDialog() {
        const request = useInstallRequest()
        if (request === null) return null
        return h(InstallFlow, { key: request.id, from: request.from, initialSpec: request.spec, t, listen })
      }
    }

    /**
     * One install, following DSH's own dialog: the spec, DSH's check of what it names, a
     * confirmation, progress with DSH's install output and Cancel, then the result. DSH's dialog
     * is not exported (S31), so its screens are rebuilt from DSH's components; the process behind
     * them is DSH's own, inherited for Fishball's folder. Your click on Install approves it.
     */
    function InstallFlow({ from, initialSpec, t, listen }) {
      const id = React.useId()
      const [step, setStep] = React.useState(INSTALL_STEP.edit)
      const [spec, setSpec] = React.useState(initialSpec ?? '')
      const [problem, setProblem] = React.useState(null)
      const [subject, setSubject] = React.useState(null)
      const [progress, setProgress] = React.useState({ phase: null, attempt: null, output: '' })
      const [outcome, setOutcome] = React.useState(null)
      const [note, setNote] = React.useState(null)
      const requestId = React.useRef(null)
      const catalog = useFishball().catalog
      const installing = step === INSTALL_STEP.installing
      React.useEffect(() => {
        if (!installing) return undefined
        const own = (event) => event?.requestId === requestId.current
        const offState = listen(INSTALL_EVENT.state, (event) => { if (own(event)) setProgress((previous) => ({ ...previous, phase: event.phase, attempt: event.attempt ?? previous.attempt })) })
        // DSH sends output in chunks; the screen keeps the newest INSTALL_LOG_LINES lines (review L8).
        const offLog = listen(INSTALL_EVENT.log, (event) => { if (own(event) && event.text) setProgress((previous) => ({ ...previous, output: (previous.output + event.text).split(LIST_SEPARATOR).slice(-INSTALL_LOG_LINES).join(LIST_SEPARATOR) })) })
        return () => { offState(); offLog() }
      }, [installing])
      const cancel = async () => {
        if (requestId.current === null) return
        const answer = await send(API.installCancel, { requestId: requestId.current })
        if (answer.answer?.outcome === CANCEL_TOO_LATE) setNote('cancelTooLate')
      }
      // Closing while it runs asks DSH's process to stop, as DSH's own dialog does.
      const close = () => { if (installing) void cancel(); installRequest.close() }
      const refuse = (key, reason) => { setProblem({ key, reason }); setStep(INSTALL_STEP.edit) }
      const check = async () => {
        if (spec.trim() === '') return
        setProblem(null)
        setStep(INSTALL_STEP.checking)
        const answer = await send(API.installInspect, { spec: spec.trim() })
        if (!answer.ok) return refuse(INSTALL_ERRORS.has(answer.code) ? 'installError.' + answer.code : 'installFailed')
        const inspection = answer.answer.inspection
        const shipped = inspection.status !== INSPECT_ACCEPTED && inspection.problem === INSPECT_SHIPPED
        if (inspection.status !== INSPECT_ACCEPTED && !shipped) {
          return refuse(INSPECT_PROBLEMS.has(inspection.problem) ? 'inspectProblem.' + inspection.problem : 'inspectProblem.unknown', inspection.reason)
        }
        if (inspection.bundle === false) return refuse('inspectProblem.not-a-bundle')
        // Installed in DSH's profile too: read from the catalog's DSH plugins (review M5).
        const inDsh = inspection.name !== undefined && catalog?.plugins.some((plugin) => DSH_LISTED.has(plugin.dsh) && plugin.packageName === inspection.name)
        setSubject(shipped ? { kind: null, shipped: true } : { ...inspection, inDsh })
        setStep(INSTALL_STEP.confirm)
      }
      // A chosen package goes straight to DSH's check, as if you had typed it and pressed Install (§10f).
      React.useEffect(() => { if (initialSpec) void check() }, [])
      const install = async (approvedBuilds) => {
        requestId.current = crypto.randomUUID()
        setProgress({ phase: null, attempt: null, output: '' })
        setNote(null)
        setStep(INSTALL_STEP.installing)
        const answer = await send(API.install, { spec: spec.trim(), requestId: requestId.current, ...(approvedBuilds === undefined ? {} : { approvedBuilds }) })
        setOutcome(answer.ok ? answer.answer : { code: answer.code, pendingBuilds: answer.answer?.pendingBuilds ?? [] })
        setStep(answer.ok ? INSTALL_STEP.done : INSTALL_STEP.failed)
      }
      const accent = (props, label) => h('span', { className: MCLS.accent }, h(Button, { type: 'button', variant: 'primary', ...props }, label))
      const outline = (props, label) => h(Button, { type: 'button', variant: 'outline', ...props }, label)
      const title = subject?.name ?? spec.trim()
      const screens = {
        [INSTALL_STEP.edit]: () => ({
          body: [
            h('p', { key: 'hint', className: MCLS.hint }, t('installHint')),
            h('div', { key: 'field', className: MCLS.field },
              h('label', { htmlFor: id, className: MCLS.label }, t('installSpecLabel')),
              h(Input, {
                id, value: spec, placeholder: t('installPlaceholder'), 'data-modal-autofocus': true, 'aria-invalid': problem !== null || undefined,
                onChange: (event) => { setSpec(event.target.value); setProblem(null) },
                // Enter installs, except while an input method is composing (as DSH's field does).
                onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void check() },
              }),
              problem ? h('p', { role: 'alert', className: MCLS.hint }, t(problem.key), problem.reason ? ` ${problem.reason}` : '') : null),
            h('p', { key: 'trust', className: MCLS.trust }, t('installTrust')),
          ],
          footer: [outline({ key: 'cancel', onClick: close }, t('cancel')), accent({ key: 'go', disabled: spec.trim() === '', onClick: check }, t('install'))],
        }),
        [INSTALL_STEP.checking]: () => ({
          body: [h('p', { key: 'checking', role: 'status' }, t('installChecking'))],
          footer: [outline({ key: 'cancel', onClick: close }, t('cancel'))],
        }),
        [INSTALL_STEP.confirm]: () => ({
          body: [
            h('div', { key: 'subject', className: MCLS.subject },
              h('span', { className: MCLS.icon, 'aria-hidden': true }, h(PluginArtworkDefault, { size: MANAGER.artSize })),
              h('div', { className: MCLS.main },
                h('div', { className: MCLS.titleRow }, h('span', { className: MCLS.title }, title), subject.version ? h(Tag, { tone: 'neutral', className: MCLS.tag }, subject.version) : null),
                subject.description ? h('p', { className: MCLS.detailDesc }, subject.description) : null,
                subject.kind ? h('p', { className: MCLS.hint }, t('installSource', { source: installSource(subject, spec.trim(), t) })) : null)),
            subject.inDsh ? h('p', { key: 'dsh', className: MCLS.hint }, t('alsoInDsh')) : null,
            subject.shipped ? h('p', { key: 'shipped', className: MCLS.hint }, t('shippedByDsh')) : null,
            h('p', { key: 'trust', className: MCLS.trust }, t('installTrust')),
          ],
          footer: [outline({ key: 'back', onClick: () => setStep(INSTALL_STEP.edit) }, t('back')), accent({ key: 'go', onClick: () => install() }, t('installConfirm'))],
        }),
        [INSTALL_STEP.installing]: () => ({
          body: [
            h('p', { key: 'phase', role: 'status' }, t('installPhase.' + (progress.phase ?? 'waiting')), progress.phase === INSTALL_PHASE_INSTALLING && progress.attempt?.total > 1 ? ` ${t('installAttempt', { index: progress.attempt.index, total: progress.attempt.total })}` : ''),
            progress.output !== '' ? h('pre', { key: 'log', className: MCLS.log, 'aria-label': t('showOutput') }, progress.output) : null,
            note ? h('p', { key: 'note', role: 'status', className: MCLS.hint }, t(note)) : null,
          ],
          footer: [outline({ key: 'cancel', onClick: () => void cancel() }, t('cancelInstall'))],
        }),
        [INSTALL_STEP.done]: () => ({
          body: [
            h('p', { key: 'done', role: 'status' }, t('installDone', { name: outcome.name, version: outcome.version ?? '' })),
            outcome.on ? null : h('p', { key: 'off', role: 'alert' }, t('installDoneOff'), ' ', pluginErrorText(t, outcome.code)),
          ],
          footer: [
            outline({ key: 'close', onClick: close }, t('close')),
            // DSH offers no way to select the Fishball tab from its own menu (S28): only the tab opens the page.
            // Only once the tab lists it, so the page never opens by surprise later (review L8).
            from === INSTALL_FROM.tab && catalog?.plugins.some((plugin) => plugin.plugin === outcome.plugin)
              ? accent({ key: 'open', onClick: () => { managerView.show(outcome.plugin); close() } }, t('openPluginPage'))
              : null,
          ],
        }),
        [INSTALL_STEP.failed]: () => ({
          body: [
            h('p', { key: 'failed', role: 'alert' }, t(INSTALL_ERRORS.has(outcome.code) ? 'installError.' + outcome.code : 'installFailed')),
            outcome.code === BUILD_BLOCKED ? h('p', { key: 'scripts', className: MCLS.hint }, t('pendingScripts'), ' ', outcome.pendingBuilds.join(', ')) : null,
            progress.output !== '' ? h('pre', { key: 'log', className: MCLS.log, 'aria-label': t('showOutput') }, progress.output) : null,
          ],
          footer: [
            outline({ key: 'back', onClick: () => setStep(INSTALL_STEP.edit) }, t('back')),
            outcome.code === BUILD_BLOCKED
              ? accent({ key: 'scripts', onClick: () => install(outcome.pendingBuilds) }, t('allowScripts'))
              : accent({ key: 'retry', onClick: () => install() }, t('installRetry')),
          ],
        }),
      }
      const screen = screens[step]()
      return h(Modal, { open: true, onClose: close, closeLabel: t('close'), title: t('installTitle'), footer: h(React.Fragment, null, ...screen.footer) },
        h('div', { className: MCLS.dialog, 'data-fishball-install': step }, ...screen.body))
    }

    /** A token count for display, or a fallback word. */
    const countText = (value, t, fallback) => (value === null || value === undefined ? t(fallback) : Number(value).toLocaleString())

    /**
     * The context window (DESIGN §6): your two values, what is in use, the threshold and
     * the current size. Empty fields mean unset; the Host checks a value against the model.
     */
    function makeContextWindow(t) {
      return function FishballContextWindow() {
        const state = useFishball()
        const view = state.contextWindow
        const baseId = React.useId()
        const stored = (field) => (view?.[field] == null ? '' : String(view[field]))
        const [draft, setDraft] = React.useState(null)
        const [saving, setSaving] = React.useState(false)
        const [problem, setProblem] = React.useState(null)
        if (!view) return null
        const text = (field) => (draft?.[field] ?? stored(field))
        // Digits only and within the safe-integer range, which the Host's check also requires.
        const invalid = (field) => text(field).trim() !== '' && !(WHOLE_NUMBER.test(text(field).trim()) && Number.isSafeInteger(Number(text(field).trim())))
        const dirty = draft !== null && CONTEXT_FIELDS.some((field) => text(field) !== stored(field))
        const save = async () => {
          setSaving(true)
          const body = Object.fromEntries(CONTEXT_FIELDS.map((field) => [field, text(field).trim() === '' ? null : Number(text(field).trim())]))
          const { ok, code } = await send(API.contextWindow, body)
          setSaving(false)
          if (ok) { setDraft(null); setProblem(null) } else setProblem(CONTEXT_ERRORS.has(code) ? 'contextError.' + code : 'contextSaveFailed')
        }
        const info = (label, value, fallback) => h('div', { className: CLS.row }, h('span', { className: CLS.label }, t(label)), h('span', null, countText(value, t, fallback)))
        return h('div', { className: CLS.section, 'data-fishball-context': true },
          h('h3', null, t('contextWindow')),
          h('p', { className: CLS.muted }, t('contextHint')),
          info('contextModel', view.modelWindow, 'contextUnknown'),
          info('contextEffective', view.effectiveWindow, 'contextUnknown'),
          info('contextThreshold', view.threshold, 'contextUnknown'),
          info('contextPressure', view.pressureTokens, 'contextUnknown'),
          info('contextOutput', view.outputCap, 'contextNone'),
          view.error ? h('div', { role: 'status' }, CONTEXT_ERRORS.has(view.error) ? t('contextError.' + view.error) : t('contextSaveFailed')) : null,
          view.compactionOff ? h('div', { role: 'status' }, t('contextCompactionOff')) : null,
          CONTEXT_FIELDS.map((field) => h(SettingsValueField, {
            key: field,
            id: `${baseId}-${field}`,
            label: t('contextField.' + field),
            text: text(field),
            overridden: stored(field) !== '',
            invalid: invalid(field),
            overriddenLabel: t('overridden'),
            resetLabel: t('contextDefault'),
            invalidLabel: t('contextInvalid'),
            disabled: saving,
            numeric: true,
            onEdit: (next) => setDraft({ ...(draft ?? {}), [field]: next }),
            onReset: () => setDraft({ ...(draft ?? {}), [field]: '' }),
          })),
          problem ? h('div', { role: 'alert' }, t(problem)) : null,
          h('div', { className: CLS.row },
            h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: !dirty || saving || CONTEXT_FIELDS.some(invalid), onClick: save }, saving ? t('saving') : t('save'))))
      }
    }

    /**
     * The host's model picker is not a public component and its selection RPC also changes
     * DSH's global default. Reuse its read-only catalog, with native keyboard-accessible fields
     * and our own save command instead, so Fishball never changes another session's model.
     */
    const sameModelChoice = (left, right) => left?.provider === right?.provider
      && left?.model === right?.model && left?.reasoningEffort === right?.reasoningEffort

    // Validate only the display contract we consume. A malformed 2xx is a failed refresh,
    // not permission to discard the last usable list. Providers/efforts remain host-owned.
    const modelEntry = (entry) => typeof entry?.id === 'string' && entry.id.length > 0
      && typeof entry.name === 'string' && entry.name.length > 0
    const validModelCatalog = (catalog) => Array.isArray(catalog?.groups) && Array.isArray(catalog.failures)
      && catalog.groups.every((group) => modelEntry(group) && Array.isArray(group.models)
        && group.models.every((model) => modelEntry(model) && (model.reasoning === undefined
          || (Array.isArray(model.reasoning?.efforts) && model.reasoning.efforts.every(modelEntry)))))
      && catalog.failures.every((failure) => modelEntry(failure) && typeof failure.message === 'string')

    function makeModelSettings(t) {
      return function FishballModelSettings() {
        const state = useFishball()
        const baseId = React.useId()
        const [draft, setDraft] = React.useState(null)
        const [catalog, setCatalog] = React.useState(null)
        const [refresh, setRefresh] = React.useState(MODEL.refreshStart)
        const [loading, setLoading] = React.useState(true)
        const [saving, setSaving] = React.useState(false)
        const [problem, setProblem] = React.useState(null)
        React.useEffect(() => {
          let current = true
          setLoading(true)
          setProblem(null)
          fetch(apiUrl(API.models), MODEL.request).then(async (response) => {
            if (!response.ok) throw new Error()
            const answer = await response.json()
            if (answer?.ok !== true || !validModelCatalog(answer.catalog)) throw new Error()
            if (current) { setCatalog(answer.catalog); setProblem(null) }
          }).catch(() => { if (current) setProblem('modelLoadFailed') })
            .finally(() => { if (current) setLoading(false) })
          return () => { current = false }
        }, [refresh])
        const selection = draft ?? state.modelSelection
        const valueOf = (choice) => choice ? JSON.stringify([choice.provider, choice.model]) : MODEL.empty
        const options = catalog?.groups.flatMap((group) => group.models.map((model) => ({ group, model }))) ?? []
        const available = (choice) => options.some(({ group, model }) => group.id === choice?.provider && model.id === choice?.model)
        const chosen = options.find(({ group, model }) => group.id === selection?.provider && model.id === selection?.model)
        // Keep the saved identity even while a different draft is selected, or the refreshed
        // catalog is empty. Catalog availability is never a command to clear consent/state.
        const missing = [state.modelSelection, selection].filter((choice, index, choices) => choice && !available(choice)
          && choices.findIndex((candidate) => valueOf(candidate) === valueOf(choice)) === index)
        const efforts = chosen?.model.reasoning?.efforts ?? []
        const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(state.modelSelection)
        const save = async () => {
          const requested = draft
          const previous = stateSource.get()
          setSaving(true)
          const { ok, answer } = await send(API.model, requested)
          const current = stateSource.get()
          const confirmed = ok && answer?.ok === true && answer.state?.sessionId === previous.sessionId
            && sameModelChoice(answer.state.modelSelection, requested)
          const streamed = current.sessionId === previous.sessionId && sameModelChoice(current.modelSelection, requested)
          // The POST receipt is authoritative too. Dropping the draft while waiting only for
          // SSE reverted a successful Save to null/old selection when that stream was stalled.
          // Merge just this field so unrelated newer state is not rolled back; an already
          // observed different model/session wins over this older in-flight receipt.
          if (confirmed && current.sessionId === previous.sessionId
            && (streamed || sameModelChoice(current.modelSelection, previous.modelSelection))) {
            stateSource.publish({ ...current, modelSelection: answer.state.modelSelection })
          }
          setSaving(false)
          if (ok && (confirmed || streamed)) { setDraft(null); setProblem(null) } else setProblem('modelSaveFailed')
          // Never treat a draft or a bare HTTP 2xx as confirmation of dedicated consent.
        }
        return h('section', { className: CLS.section + ' ' + MODEL.settingsClass, 'data-fishball-model-settings': true },
          h('h3', null, t('modelTitle')),
          h('p', { className: CLS.muted }, t('modelHint')),
          h('label', { htmlFor: baseId + MODEL.fieldSuffix }, t('modelChoose')),
          h('div', { className: MODEL.pickerClass, 'aria-busy': loading }, h('select', {
            id: baseId + MODEL.fieldSuffix, 'data-fishball-model-select': true,
            value: valueOf(selection), disabled: loading || saving,
            onChange: (event) => {
              if (event.target.value === MODEL.empty) { setDraft(null); return }
              const [provider, model] = JSON.parse(event.target.value)
              setDraft({ provider, model })
            },
          }, h('option', { value: MODEL.empty }, t('modelChoose')),
          missing.map((choice) => h('option', { key: valueOf(choice), value: valueOf(choice), disabled: true },
            [choice.provider, choice.model].join(MODEL.routeSeparator) + ' (' + t('modelUnavailableOption') + ')')),
          catalog?.groups.map((group) => h('optgroup', { key: group.id, label: group.name },
            group.models.map((model) => h('option', { key: model.id, value: valueOf({ provider: group.id, model: model.id }) }, model.name))))),
          h(Button, { type: 'button', size: 'sm', variant: 'ghost', 'data-fishball-model-refresh': true,
            title: t('modelRefreshHint'), disabled: loading || saving, onClick: () => setRefresh((previous) => previous + MODEL.refreshStep) },
          loading ? t('modelRefreshing') : t('modelRefresh'))),
          efforts.length > 0 ? h(React.Fragment, null,
            h('label', { htmlFor: baseId + MODEL.effortSuffix }, t('modelEffort')),
            h('select', {
              id: baseId + MODEL.effortSuffix, 'data-fishball-model-effort': true,
              value: selection?.reasoningEffort ?? MODEL.empty, disabled: loading || saving,
              onChange: (event) => setDraft({ provider: selection.provider, model: selection.model,
                ...(event.target.value === MODEL.empty ? {} : { reasoningEffort: event.target.value }) }),
            }, h('option', { value: MODEL.empty }, t('modelEffortDefault')),
            efforts.map((effort) => h('option', { key: effort.id, value: effort.id }, effort.name)))) : null,
          loading ? h('p', { role: 'status' }, t('modelLoading')) : null,
          !loading && catalog && options.length === 0 ? h('p', { role: 'status' }, t('modelEmpty')) : null,
          !loading && catalog && missing.length > 0 ? h('p', { role: 'status' }, t('modelUnavailable')) : null,
          catalog?.failures.map((failure) => h('p', { key: failure.id, role: 'status' }, failure.name + ': ' + failure.message)),
          problem ? h('p', { role: 'alert' }, t(problem)) : null,
          h('div', { className: CLS.row },
            h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: !dirty || !chosen || loading || saving, onClick: save }, saving ? t('saving') : t('save'))))
      }
    }

    /** A model-setting prompt remains usable while DSH makes the editor and submit paths inert. */
    /** Dedicated owner controls; no session-management tool exposes these actions. */
    function makeProviderSyncSettings(t) {
      return function FishballProviderSyncSettings() {
        const [pair, setPair] = React.useState({ state: PROVIDER_SYNC_UI.inactive })
        const [invitation, setInvitation] = React.useState('')
        const [outgoing, setOutgoing] = React.useState('')
        const [plan, setPlan] = React.useState(null)
        const [selected, setSelected] = React.useState([])
        const [consent, setConsent] = React.useState(false)
        const [result, setResult] = React.useState(null)
        const [busy, setBusy] = React.useState(false)
        const [problem, setProblem] = React.useState(false)
        const active = React.useRef(false)
        const invoke = async (action, payload = {}) => {
          if (active.current) return
          active.current = true; setBusy(true); setProblem(false)
          if (action !== 'confirm') { setPlan(null); setSelected([]); setConsent(false); setResult(null) }
          try {
            const response = await send(PROVIDER_SYNC_UI.path, { action, ...payload })
            if (!response.ok || response.answer?.ok !== true || !response.answer.result) {
              setProblem(true); setPlan(null); setConsent(false); return
            }
            const answer = response.answer.result
            if (action === 'preview') { setPlan(answer); setSelected([]); setConsent(false); setResult(null) }
            else if (action === 'confirm') { setResult(answer); setPlan(null); setSelected([]); setConsent(false) }
            else if (action === 'begin') { setPair({ ...answer, peer: answer.identity, state: PROVIDER_SYNC_UI.pendingTarget }); setInvitation('') }
            else { setPair(answer); if (action === 'invite') setOutgoing(answer.invitation); if (action === 'close') { setOutgoing(''); setInvitation('') } }
          } finally { active.current = false; setBusy(false) }
        }
        const button = (key, action, payload, disabled = false) => h(Button, { type: 'button', size: 'sm', variant: 'ghost',
          disabled: busy || disabled, onClick: () => invoke(action, payload) }, t(key))
        const peer = pair.peer ?? pair.identity
        return h('section', { className: CLS.section, 'data-fishball-provider-sync': true, 'aria-busy': busy },
          h('h3', null, t('syncTitle')), h('p', { className: CLS.muted }, t('syncHint')),
          h('p', { role: 'status' }, pair.state),
          peer ? h('p', null, t('syncIdentity') + ': ' + peer.runtimeId + ' / ' + peer.profileId) : null,
          h('div', { className: CLS.row }, button('syncInvite', 'invite'), button('syncStatus', 'status'), button('syncClose', 'close')),
          outgoing ? h('label', null, t('syncInvitation'), h('textarea', { readOnly: true, value: outgoing, rows: PROVIDER_SYNC_UI.invitationRows })) : null,
          h('label', null, t('syncPaste'), h('textarea', { value: invitation, disabled: busy, rows: PROVIDER_SYNC_UI.invitationRows,
            onChange: (event) => setInvitation(event.target.value) })),
          button('syncBegin', 'begin', { invitation }, !invitation.trim()),
          pair.state === PROVIDER_SYNC_UI.pendingSource ? button('syncApprove', 'approve', { pairId: pair.pairId }) : null,
          pair.state === PROVIDER_SYNC_UI.pendingTarget ? button('syncFinish', 'finish', { pairId: pair.pairId }) : null,
          button('syncPreview', 'preview', {}, pair.state !== PROVIDER_SYNC_UI.paired || pair.role === 'target'),
          plan ? h('div', { 'data-fishball-sync-preview': true },
            h('p', null, plan.source?.profileId + ' → ' + plan.target?.profileId),
            PROVIDER_SYNC_UI.groups.map((group) => h('section', { key: group }, h('h4', null, t('syncGroup.' + group)),
              h('ul', null, (plan.groups?.[group] ?? []).map((item) => h('li', { key: item.id },
                group === 'add' ? h('label', null, h('input', { type: 'checkbox', checked: selected.includes(item.id), disabled: busy,
                  onChange: (event) => { setSelected((previous) => event.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id)); setConsent(false) } }), item.name + ' (' + item.id + ')') : item.name + ' (' + item.id + ')',
                ' — ' + PROVIDER_SYNC_UI.mask,
                item.api ? h('span', null, ' — ' + item.api) : null,
                item.endpoint ? h('span', null, ' — ' + item.endpoint) : null,
                item.models?.length ? h('span', null, ' — ' + item.models.join(', ')) : null,
                item.reason ? h('span', null, ' — ' + item.reason) : null))))),
            h('label', null, h('input', { type: 'checkbox', checked: consent, disabled: busy,
              onChange: (event) => setConsent(event.target.checked) }), t('syncConsent')),
            button('syncConfirm', 'confirm', { previewId: plan.previewId, ids: selected, confirmed: true }, !consent || selected.length === 0)) : null,
          result ? h('div', { 'data-fishball-sync-result': true }, h('p', { role: 'status' }, t(result.complete ? 'syncComplete' : 'syncPartial')),
            h('ul', null, result.results.map((item) => h('li', { key: item.id }, item.id + ': ' + item.status + ' / ' + item.config + ' / ' + item.key)))) : null,
          problem ? h('p', { role: 'alert' }, t('syncFailed')) : null)
      }
    }

    function makeModelGate(ctx, t) {
      return function FishballModelGate({ sessionId }) {
        const state = useFishball()
        if (!sessionId || sessionId !== state.sessionId || state.modelSelection) return null
        return h('div', { className: MODEL.gateClass, 'data-fishball-model-gate': true },
          h('span', { className: CLS.grow, role: 'status' }, t('modelRequired')),
          h(Button, { type: 'button', size: 'sm', variant: 'primary', onClick: () => openSettings(ctx) }, t('openSettings')))
      }
    }

    /** The tools Fishball never uses, as data from the Host. */
    function makeHiddenTools(t) {
      return function FishballHiddenTools() {
        const state = useFishball()
        return h('div', { className: CLS.section },
          h('h3', null, t('hiddenTools')),
          h('p', null, t('hiddenToolsHint')),
          h('ul', { className: CLS.list }, (state.hiddenTools ?? []).map((name) => h('li', { key: name }, name))))
      }
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
     * "Send to Fishball" (DESIGN §5b): one request store shared by the session-row menu entry
     * and the header action; the dialog lives in the shell overlay so it outlives the menu.
     */
    const sendRequest = (() => {
      const store = valueStore(null)
      return { ...store, open: (sessionId, title) => store.set({ sessionId, title }), close: () => store.set(null) }
    })()
    const useSendRequest = () => React.useSyncExternalStore(sendRequest.subscribe, sendRequest.get)

    /** Whether a session can be sent: Fishball runs, and it is not Fishball's own session. */
    const isOtherSession = (state, sessionId) => Boolean(sessionId) && sessionId !== state.sessionId
    const canSend = (state, sessionId) => state.status === STATUS.live && isOtherSession(state, sessionId)
    /** Your Send to Fishball and Tell Fishball when finished belong to their Fishball plugins, and hide while it is off (revision 10c). */
    const canMessage = (state, sessionId) => canSend(state, sessionId) && featureOn(state, FEATURE.messages)
    const canWatch = (state, sessionId) => canSend(state, sessionId) && featureOn(state, FEATURE.watching)

    function makeSendMenuItem(t) {
      return function FishballSendMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
        const state = useFishball()
        const [, setMenuOpen] = useMenuOpenState()
        if (!canMessage(state, sessionId)) return null
        return h(MenuItemButton, { onSelect: () => { setMenuOpen(false); sendRequest.open(sessionId, displayTitle) } }, t('sendToFishball'))
      }
    }

    function makeSendHeaderAction(t) {
      return function FishballSendHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!canMessage(state, sessionId)) return null
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => sendRequest.open(sessionId, '') }, t('sendToFishball'))
      }
    }

    function makeSendDialog(t) {
      return function FishballSendDialog() {
        const request = useSendRequest()
        if (request === null) return null
        return h(SendForm, { key: request.sessionId, request, t })
      }
    }

    /** One request's dialog: the note and in-flight state die with it. */
    function SendForm({ request, t }) {
      const [note, setNote] = React.useState('')
      const [sending, setSending] = React.useState(false)
      const [problem, setProblem] = React.useState(null)
      const close = () => { if (!sending) sendRequest.close() }
      const confirm = async () => {
        setSending(true)
        const { ok, code } = await send(API.send, { sessionId: request.sessionId, note })
        setSending(false)
        if (ok) sendRequest.close()
        else setProblem(SEND_ERRORS.has(code) ? 'sendError.' + code : 'sendFailed')
      }
      return h(Modal, {
        open: true,
        onClose: close,
        closeLabel: t('close'),
        title: request.title ? t('sendTitle', { title: request.title }) : t('sendToFishball'),
        footer: h(React.Fragment, null,
          h(Button, { type: 'button', variant: 'outline', disabled: sending, onClick: close }, t('cancel')),
          h(Button, { type: 'button', variant: 'primary', disabled: sending, onClick: confirm }, sending ? t('sending') : t('send'))),
      },
        h('p', { className: CLS.muted }, t('sendHint')),
        h('label', { className: CLS.field },
          h('span', null, t('sendNoteLabel')),
          h('textarea', { className: CLS.note, value: note, rows: 4, 'data-modal-autofocus': true, disabled: sending, onChange: (event) => { setNote(event.target.value); setProblem(null) } })),
        problem ? h('div', { role: 'alert' }, t(problem)) : null)
    }

    /** The queue and the outbox (DESIGN §10): counts and recent entries, no message text. */
    function makeIntake(t) {
      return function FishballIntake() {
        const state = useFishball()
        const intake = state.intake
        const outbox = state.outbox
        if (!intake || !outbox) return null
        const row = (label, value) => h('div', { className: CLS.row }, h('span', { className: CLS.label }, t(label)), h('span', null, String(value)))
        return h(React.Fragment, null,
          h('div', { className: CLS.section, 'data-fishball-intake': true },
            h('h3', null, t('intake')),
            h('p', { className: CLS.muted }, t('intakeHint')),
            row('intakeQueued', intake.queued),
            row('intakeFailed', intake.failed),
            row('intakeWakeups', intake.wakeupsThisHour),
            intake.items.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, intake.items.map((item) => h('li', { key: item.intakeId },
              h(Tag, { tone: 'neutral' }, t('intakeKind.' + item.kind)), ' ',
              h('span', { className: CLS.code }, item.sourceIdentity), ' ',
              h(Tag, { tone: item.status === 'failed' ? 'danger' : 'info' }, t('intakeStatus.' + item.status)), ' ',
              h('span', { className: CLS.muted }, item.createdAt))))),
          h('div', { className: CLS.section, 'data-fishball-outbox': true },
            h('h3', null, t('outbox')),
            h('p', { className: CLS.muted }, t('outboxHint')),
            outbox.entries.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, outbox.entries.map((entry) => h('li', { key: entry.key },
              h(Tag, { tone: 'neutral' }, t('outboxKind.' + entry.kind)), ' ',
              h('span', { className: CLS.code }, entry.targetSessionId ?? entry.folder ?? ''), ' ',
              h(Tag, { tone: entry.status === 'failed' ? 'danger' : 'info' }, t('outboxStatus.' + entry.status)), ' ',
              h('span', { className: CLS.muted }, entry.at))))))
      }
    }

    /**
     * Whether YOU have an active watch on a session (the entries then say so). A watch Fishball
     * or the session set up (e.g. per-turn) is separate: yours is still offered.
     */
    const isWatched = (state, sessionId) => (state.watches?.watches ?? []).some((watch) => watch.targetSessionId === sessionId && watch.status === WATCH_ACTIVE && watch.createdBy?.kind === WATCH_BY_USER)

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
    const watchNotice = requestNotice(API.watches, WATCH_ERRORS, 'watchError.', 'watchFailed')

    function makeWatchMenuItem(t) {
      return function FishballWatchMenuItem({ sessionId, useMenuOpenState }) {
        const state = useFishball()
        const [, setMenuOpen] = useMenuOpenState()
        if (!canWatch(state, sessionId)) return null
        // Already watched: the entry says so; choosing it again returns the same watch.
        const watched = isWatched(state, sessionId)
        return h(MenuItemButton, { onSelect: () => { setMenuOpen(false); void watchNotice.request({ sessionId }) } }, watched ? t('watching') : t('watchSession'))
      }
    }

    function makeWatchHeaderAction(t) {
      return function FishballWatchHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!canWatch(state, sessionId)) return null
        const watched = isWatched(state, sessionId)
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: watched, onClick: () => void watchNotice.request({ sessionId }) }, watched ? t('watching') : t('watchSession'))
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

    /** Hand over / Take back (DESIGN §5e, §10e) and its refusal. */
    const manageNotice = requestNotice(API.managed, MANAGE_ERRORS, 'manageError.', 'manageFailed')
    const isManagedSession = (state, sessionId) => (state.managed ?? []).some((entry) => entry.sessionId === sessionId)
    /**
     * Offered where Send to Fishball is (Fishball live, never its own session) once the Host lists
     * managed sessions; hidden while Session messages is off (Q-r11-plugins-off; managed sessions stay managed).
     */
    const canManage = (state, sessionId) => Array.isArray(state.managed) && canMessage(state, sessionId)
    /** The entry's text and action: Hand over on a session that is yours, Take back on a managed one. */
    const manageChoice = (state, sessionId) => {
      const managed = isManagedSession(state, sessionId)
      return { label: managed ? 'takeBack' : 'handOver', run: () => manageNotice.request({ sessionId, managed: !managed }) }
    }

    function makeManageMenuItem(t) {
      return function FishballManageMenuItem({ sessionId, useMenuOpenState }) {
        const state = useFishball()
        const [, setMenuOpen] = useMenuOpenState()
        if (!canManage(state, sessionId)) return null
        const choice = manageChoice(state, sessionId)
        return h(MenuItemButton, { onSelect: () => { setMenuOpen(false); void choice.run() } }, t(choice.label))
      }
    }

    /** The Hand over / Take back button, shared by the session header and the managed banner so they cannot drift. */
    const manageButton = (t, state, sessionId) => {
      const choice = manageChoice(state, sessionId)
      return h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => void choice.run() }, t(choice.label))
    }

    function makeManageHeaderAction(t) {
      return function FishballManageHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!canManage(state, sessionId)) return null
        return manageButton(t, state, sessionId)
      }
    }

    /**
     * Whether a session shows the managed-session marks (item 30): it is managed, and Take back is
     * offered (canManage: Fishball live, Session messages on, never Fishball's own session). The
     * user's answers hide both the banner and the sidebar icon whenever Take back would be hidden.
     */
    const showsManagedMarks = (state, sessionId) => canManage(state, sessionId) && isManagedSession(state, sessionId)

    /**
     * The banner above a managed session's composer (DESIGN §10e item 30): the mark the Sidebar
     * icon setting chose, "Managed by Fishball", and Take back, the menu entry's own action, so a
     * refusal opens the same dialog. The mark never wags here: unread replies are Fishball's own.
     */
    function makeManagedBanner(t) {
      return function FishballManagedBanner({ sessionId }) {
        const state = useFishball()
        if (!showsManagedMarks(state, sessionId)) return null
        const Icon = brandIconOf(state)
        return h('div', { className: CLS.managedBanner, 'data-fishball-managed-banner': sessionId },
          h(Icon, { size: MANAGED_BANNER.iconPx, unread: false }),
          h('span', { className: CLS.managedText }, t('managedBanner')),
          manageButton(t, state, sessionId))
      }
    }

    /**
     * The managed mark in a sidebar row (DESIGN §10e item 30). DSH mounts this seat only while the
     * row is idle; its own light shows otherwise. The seat gives only the row's sessionId, so the
     * managed list comes from the state stream every Fishball entry shares.
     */
    function makeManagedRowMark(t) {
      return function FishballManagedRowMark({ sessionId }) {
        const state = useFishball()
        if (!showsManagedMarks(state, sessionId)) return null
        const Icon = brandIconOf(state)
        return h('span', { className: CLS.managedRow, role: 'img', 'aria-label': t('managedBanner'), 'data-fishball-managed-row': sessionId },
          h(Icon, { size: MANAGED_ROW.iconPx, unread: false }))
      }
    }

    /** The watches section (DESIGN §10): each watch with who set it up, and Remove. */
    function makeWatches(t) {
      return function FishballWatches() {
        const state = useFishball()
        const [problem, setProblem] = React.useState(null)
        const view = state.watches
        if (!view) return null
        const remove = async (watchId) => {
          const { ok, code } = await send(API.watchesRemove, { watchId })
          setProblem(ok ? null : WATCH_ERRORS.has(code) ? 'watchError.' + code : 'watchFailed')
        }
        return h('div', { className: CLS.section, 'data-fishball-watches': true },
          h('h3', null, t('watches')),
          h('p', { className: CLS.muted }, t('watchesHint')),
          problem ? h('div', { role: 'alert' }, t(problem)) : null,
          view.watches.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, view.watches.map((watch) => h('li', { key: watch.id },
            h('span', { className: CLS.code }, watch.targetSessionId), ' ',
            h(Tag, { tone: 'neutral' }, t('watchCondition.' + watch.condition)), ' ',
            h(Tag, { tone: 'neutral' }, t('watchBy.' + watch.createdBy.kind)), ' ',
            h(Tag, { tone: watch.status === WATCH_ACTIVE ? 'info' : 'neutral' }, t('watchStatus.' + watch.status)), ' ',
            watch.firedCount > 0 ? h('span', { className: CLS.muted }, t('watchFired', { count: watch.firedCount })) : null, ' ',
            watch.status === WATCH_ACTIVE ? h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => void remove(watch.id) }, t('remove')) : null))))
      }
    }

    /** Plugin sources (DESIGN §8, §10): each registered source and whether it accepts events. */
    function makeSources(t) {
      return function FishballSources() {
        const state = useFishball()
        const view = state.sources
        if (!view) return null
        return h('div', { className: CLS.section, 'data-fishball-sources': true },
          h('h3', null, t('sources')),
          h('p', { className: CLS.muted }, t('sourcesHint')),
          view.sources.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, view.sources.map((source) => h('li', { key: source.identity },
            h('span', { className: CLS.name }, source.title), ' ',
            h('span', { className: CLS.code }, source.identity), ' ',
            h(Tag, { tone: source.enabled ? 'info' : 'neutral' }, t(source.enabled ? 'sourceOn' : 'sourceOff'))))))
      }
    }

    /** Permission requests (DESIGN §10): waiting ones, then the recent audit. Never the arguments. */
    function makeApprovals(t) {
      return function FishballApprovals() {
        const state = useFishball()
        const view = state.approvals
        if (!view) return null
        return h('div', { className: CLS.section, 'data-fishball-approvals': true },
          h('h3', null, t('approvals')),
          h('p', { className: CLS.muted }, t('approvalsHint')),
          h(ManagedSessions, { state, t }),
          h(QuestionMode, { state, t }),
          (state.pile ?? []).length > 0 ? h('p', { 'data-fishball-pile-count': state.pile.length }, t('approvalsPile', { count: state.pile.length })) : null,
          (state.grants ?? []).length > 0 ? h('p', { 'data-fishball-grants-count': state.grants.length }, t('approvalsGrants', { count: state.grants.length })) : null,
          view.pending.length > 0 ? h('ul', { className: CLS.entries }, view.pending.map((p) => h('li', { key: p.id },
            h(Tag, { tone: 'info' }, t('approvalsWaiting')), ' ', h('span', { className: CLS.code }, p.toolName), ' ', h('span', { className: CLS.muted }, p.sessionId)))) : null,
          view.recent.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, view.recent.map((entry) => h('li', { key: entry.key },
            h(Tag, { tone: entry.answer === 'allow' ? 'danger' : 'neutral' }, t(entry.answer === AUDIT_PASS.answer && entry.passBy === AUDIT_PASS.byUser ? AUDIT_PASS.userKey : 'approvalAnswer.' + entry.answer)), ' ',
            h('span', { className: CLS.code }, entry.toolName), ' ',
            h('span', { className: CLS.muted }, entry.sessionId), ' ',
            h('span', { className: CLS.muted }, t('approvalOutcome.' + entry.finalOutcome)), ' ',
            entry.rationale ? h('span', null, entry.rationale) : null))))
      }
    }

    /**
     * The managed sessions (DESIGN §10e "Settings page"; the user's answers 2026-11-01): newest
     * first, each with its title, how it became managed and since when, and Take back under the
     * same rule as the menu entry (canManage). The list shows even when Take back cannot.
     * A session whose title is not known yet shows its id instead.
     */
    function ManagedSessions({ state, t }) {
      const entries = [...(state.managed ?? [])].sort((a, b) => (a.since < b.since ? 1 : a.since > b.since ? -1 : 0))
      return h(React.Fragment, null,
        h('h4', null, t('managedSessions')),
        h('p', { className: CLS.muted }, t('managedSessionsHint')),
        entries.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries, 'data-fishball-managed': true }, entries.map((entry) => h('li', { key: entry.sessionId },
          entry.title ? h('span', null, entry.title) : h('span', { className: CLS.code }, entry.sessionId), ' ',
          h(Tag, { tone: 'neutral' }, t('managedBy.' + entry.by)), ' ',
          h('span', { className: CLS.muted }, t('managedSince', { at: new Date(entry.since).toLocaleString() })), ' ',
          canManage(state, entry.sessionId) ? h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => void manageNotice.request({ sessionId: entry.sessionId, managed: false }) }, t('takeBack')) : null))))
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
     * The entries to draw: the current ones, and for one reveal each one that just left, at its old
     * place and marked leaving, so it closes instead of vanishing (DESIGN §10e: rows leaving).
     * @returns [{ item, leaving }].
     */
    function useLeaving(items, keyOf) {
      const [previous, setPrevious] = React.useState(items)
      // [{ item, index, until }]: entries that left, with the time their close ends.
      const [left, setLeft] = React.useState([])
      if (items !== previous) {
        // Adjusted while rendering (React's pattern for state derived from a prop change), so the entry
        // that left is never unmounted first, which would lose its open state and skip its close.
        const now = new Set(items.map(keyOf))
        const until = Date.now() + revealMs()
        const gone = previous.map((item, index) => ({ item, index, until })).filter(({ item }) => !now.has(keyOf(item)))
        const goneKeys = new Set(gone.map(({ item }) => keyOf(item)))
        setPrevious(items)
        if (gone.length > 0) setLeft((current) => [...current.filter(({ item }) => !goneKeys.has(keyOf(item))), ...gone])
      }
      React.useEffect(() => {
        if (left.length === 0) return undefined
        const next = Math.min(...left.map((entry) => entry.until))
        const timer = setTimeout(() => setLeft((current) => current.filter((entry) => entry.until > Date.now())), Math.max(0, next - Date.now()))
        return () => clearTimeout(timer)
      }, [left])
      const now = new Set(items.map(keyOf))
      const drawn = items.map((item) => ({ item, leaving: false }))
      // An entry that came back is drawn once, as current.
      for (const { item, index } of left) if (!now.has(keyOf(item))) drawn.splice(Math.min(index, drawn.length), 0, { item, leaving: true })
      return drawn
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

    /** JSON text indented for reading; text that does not parse (cut arguments) as it is. */
    function readableJson(text) {
      try { return JSON.stringify(JSON.parse(text), null, JSON_INDENT) } catch { return text }
    }

    /** A labelled line of text from another session or from Fishball (plain text, never markup: §10c framing rule). */
    const labelled = (label, text) => h('div', null, h('span', { className: CLS.muted }, label + ': '), text)

    /** The session's title, or its id styled as code while it has none (as the managed list does). */
    const sessionTitle = (card) => h('span', { className: card.title ? CLS.title : `${CLS.title} ${CLS.code}` }, card.title || card.sessionId)

    /**
     * One permission request in full, in your pile's detail (DESIGN §10e): the session, the tool,
     * the exact arguments, the agent's reason, Fishball's note, the quoted messages and the thread.
     * Every text comes from another session or from Fishball, so all of it is drawn as plain text.
     * One of Fishball's own requests is labelled Fishball, with its list (the unchecked tools, or the
     * changed settings) under the arguments, one entry per line.
     */
    function PileCard({ card, t, onDone }) {
      const own = card.kind === OWN_CARD_KIND
      return h('div', { className: CLS.detailBody },
        h('div', { className: CLS.cardHead },
          own ? h('span', { className: CLS.title }, t('cardOwnTitle')) : sessionTitle(card),
          CARD_KINDS.has(card.kind) ? h(Tag, { tone: 'neutral' }, t('cardKind.' + card.kind)) : null,
          h('span', { className: CLS.code }, card.toolName)),
        h('pre', { className: CLS.pre }, readableJson(card.arguments)),
        card.argumentsStatus === ARGUMENTS_COMPLETE ? null : h('span', { className: CLS.muted }, t('cardArgumentsCut')),
        own && (card.detail ?? []).length > 0 ? h('ul', { className: CLS.thread, 'data-fishball-card-detail': card.detail.length }, card.detail.map((entry, index) => h('li', { key: index }, entry))) : null,
        card.why ? labelled(t('cardReason'), card.why) : null,
        card.note ? labelled(t('cardFishballNote'), card.note) : null,
        card.quotes.length > 0 ? h('div', null, h('div', { className: CLS.muted }, t('cardQuotes')), card.quotes.map((quote) => h('blockquote', { key: quote.id, className: CLS.quote }, quote.text))) : null,
        card.thread.length > 0 ? h('div', null, h('div', { className: CLS.muted }, t('cardThread')),
          h('ol', { className: CLS.thread }, card.thread.map((entry, index) => h('li', { key: index }, labelled(t('threadFrom.' + entry.from), entry.text))))) : null,
        h(CardAnswer, { requestId: card.requestId, t, onDone }))
    }

    /** POST your answer on a question card. @returns null when accepted, else the refusal's text. */
    async function answerQuestionCard(questionId, body, t) {
      const { ok, code, answer } = await send(API.questionsAnswer, { questionId, ...body })
      if (ok) return null
      return QUESTION_ERRORS.has(code) ? t('questionError.' + code, { reason: answer?.reason ?? '' }) : t('cardFailed')
    }

    /**
     * One question or plan review in full, in your pile's detail (DESIGN §10e, rev11g): a question
     * shows its form with the answer controls DSH's own card has (one choice, several choices, your
     * own text); a plan review shows the plan with Approve, and Keep planning with a feedback field,
     * which the session's own panel does not offer (S36). Every text comes from the session or from
     * Fishball, so it is drawn as plain text.
     */
    function QuestionCard({ card, t, onDone }) {
      const [choices, setChoices] = React.useState({})
      const [feedback, setFeedback] = React.useState('')
      const { busy, problem, run } = useSubmit()
      const planReview = card.kind === QUESTION_VIEW.planReview
      const submit = (body) => run(() => answerQuestionCard(card.questionId, body, t), onDone)
      const choiceOf = (id) => choices[id] ?? { selected: [], custom: '' }
      // Functional, so two changes before a re-render (a toggle and typing) both count.
      const update = (id, change) => setChoices((current) => {
        const choice = current[id] ?? { selected: [], custom: '' }
        return { ...current, [id]: { ...choice, ...change(choice) } }
      })
      const answers = () => card.questions.map((question) => {
        const { selected, custom } = choiceOf(question.id)
        const text = custom.trim()
        // As DSH's card: on a single-select question your own text replaces the choice.
        return { id: question.id, selected: text !== '' && question.multiSelect !== true ? [] : selected, ...(text === '' ? {} : { custom: text }) }
      })
      const button = (key, variant, onClick, label) => cardButton(t, busy, key, variant, onClick, label)
      return h('div', { className: CLS.detailBody },
        h('div', { className: CLS.cardHead },
          sessionTitle(card),
          h(Tag, { tone: 'neutral' }, t('cardKind.' + card.kind)),
          card.continued ? h(Tag, { tone: 'info' }, t('cardContinued')) : null),
        card.note ? labelled(t('cardFishballNote'), card.note) : null,
        planReview ? h(React.Fragment, null,
          h('div', null, card.questions[0].question),
          card.questions[0].detail ? h('pre', { className: CLS.pre }, card.questions[0].detail) : null,
          h('div', { className: CLS.field },
            h('label', { htmlFor: card.requestId + '-feedback', className: CLS.muted }, t('planFeedback')),
            h(Input, { id: card.requestId + '-feedback', value: feedback, onChange: (event) => setFeedback(event.target.value) })),
          h('div', { className: CLS.actions },
            button('approve', 'primary', () => void submit({ approve: true }), 'planApprove'),
            button('keep', 'secondary', () => void submit(feedback.trim() === '' ? { approve: false } : { feedback: feedback.trim() }), 'planKeep')))
          : h(React.Fragment, null,
            card.questions.map((question) => {
              const choice = choiceOf(question.id)
              const multi = question.multiSelect === true
              const toggle = (label, on) => update(question.id, (current) => ({ selected: multi ? (on ? [...current.selected, label] : current.selected.filter((entry) => entry !== label)) : (on ? [label] : []) }))
              return h('fieldset', { key: question.id, className: CLS.field, 'data-fishball-question': question.id },
                h('legend', null, question.header ? `${question.header}${TURN_TAGS.separator}${question.question}` : question.question),
                (question.options ?? []).map((option) => h('label', { key: option.label, className: CLS.row },
                  h('input', { type: multi ? 'checkbox' : 'radio', name: card.requestId + '-' + question.id, checked: choice.selected.includes(option.label), disabled: busy, onChange: (event) => toggle(option.label, event.target.checked) }),
                  ' ', option.label, option.description ? h('span', { className: CLS.muted }, ` ${option.description}`) : null)),
                h(Input, { 'aria-label': t('questionOther'), placeholder: t('questionOther'), value: choice.custom, onChange: (event) => { const custom = event.target.value; update(question.id, () => ({ custom })) } }))
            }),
            h('div', { className: CLS.actions }, button('send', 'primary', () => void submit({ answers: answers() }), 'questionSubmit'))),
        problemLine(problem))
    }

    /**
     * A card's main argument (DESIGN §10e row, the builder's reading): a shell tool's command, as
     * prefix grants read it, otherwise its first text argument; none when the arguments are cut and
     * do not parse.
     */
    function mainArgument(card) {
      let value
      try { value = JSON.parse(card.arguments) } catch { return '' }
      if (value === null || typeof value !== 'object') return ''
      const commandKey = PILE_LIST.commandArgument[card.toolName]
      const text = commandKey === undefined ? Object.values(value).find((entry) => typeof entry === 'string') : value[commandKey]
      return typeof text === 'string' ? text : ''
    }

    /** Who asks, in words: the session's title (its id while it has none), or Fishball for its own requests. */
    const cardWho = (t, card) => (card.kind === OWN_CARD_KIND ? t('pileOwnName') : card.title || card.sessionId)

    /** A row's first line after who asks: the tool and its main argument, the question's header, or "Plan review". */
    function requestLine(t, card) {
      if (card.kind === QUESTION_VIEW.planReview) return t('cardKind.' + card.kind)
      if (card.kind === QUESTION_VIEW.question) return card.questions[0]?.header || t('cardKind.' + card.kind)
      const argument = mainArgument(card)
      return argument ? `${card.toolName} ${argument}` : card.toolName
    }

    /**
     * A row's second line, why it needs you (DESIGN §10e): Fishball's note; on Fishball's own cards its
     * request's reason; otherwise a plain line built from the request. Fishball's note replaces the
     * plain line as soon as the snapshot carries it.
     */
    function whyLine(t, card) {
      if (card.note) return card.note
      if (card.kind === OWN_CARD_KIND && card.why) return card.why
      const who = cardWho(t, card)
      if (card.kind === QUESTION_VIEW.planReview) return t('whyPlan', { who })
      if (card.kind === QUESTION_VIEW.question) return t('whyQuestion', { who, question: card.questions[0]?.question || requestLine(t, card) })
      const argument = mainArgument(card)
      if (argument && PILE_LIST.commandArgument[card.toolName] !== undefined) return t('whyRun', { who, command: argument })
      return argument ? t('whyUseOn', { who, tool: card.toolName, argument }) : t('whyUse', { who, tool: card.toolName })
    }

    /**
     * The buttons beside a row (DESIGN §10e): Allow once / Reject on a permission request (Reject at
     * once, with no note: the note is only in the detail), Approve / Keep planning (no feedback) on a
     * plan review, and Answer on a question, which opens the detail.
     */
    function RowButtons({ card, t, onOpen }) {
      const { busy, problem, run } = useSubmit()
      const button = (key, variant, onClick, label) => cardButton(t, busy, key, variant, onClick, label)
      const plan = (body) => () => void run(() => answerQuestionCard(card.questionId, body, t))
      const decide = (decision) => () => void run(() => answerCard(card.requestId, decision, '', t))
      const buttons = card.kind === QUESTION_VIEW.question ? [button('answer', 'primary', onOpen, 'questionAnswer')]
        : card.kind === QUESTION_VIEW.planReview ? [button('approve', 'primary', plan({ approve: true }), 'planApprove'), button('keep', 'secondary', plan({ approve: false }), 'planKeep')]
          : [button('allow', 'primary', decide(CARD_DECISION.allow), 'allowOnce'), button('reject', 'secondary', decide(CARD_DECISION.reject), 'reject')]
      return h(React.Fragment, null, h('div', { className: CLS.actions }, buttons), problemLine(problem))
    }

    /**
     * One request as a compact row (DESIGN §10e): two lines cut with an ellipsis, and its buttons.
     * A click anywhere on it but its buttons opens the detail; the lines are one button, so the
     * keyboard opens it too. @param focus - take the focus when drawn (the detail just closed).
     */
    function PileRow({ card, t, onOpen, focus }) {
      const main = React.useRef(null)
      const controls = React.useRef(null)
      React.useEffect(() => { if (focus) main.current?.focus() }, [focus])
      const open = () => onOpen(card.requestId)
      return h('div', { className: CLS.pileRow, 'data-fishball-row': card.requestId, onClick: (event) => { if (!controls.current?.contains(event.target)) open() } },
        h('button', { ref: main, type: 'button', className: CLS.rowMain, 'aria-expanded': false },
          h('span', { className: CLS.rowLine, 'data-fishball-row-request': true },
            card.kind === OWN_CARD_KIND ? h('span', { className: CLS.title }, t('pileOwnName')) : sessionTitle(card), TURN_TAGS.separator, requestLine(t, card)),
          h('span', { className: `${CLS.rowLine} ${CLS.muted}`, 'data-fishball-row-why': true }, whyLine(t, card))),
        h('div', { ref: controls, className: CLS.rowControls }, h(RowButtons, { card, t, onOpen: open })))
    }

    /**
     * One request opened in place of the list (DESIGN §10e detail): Back, a click anywhere outside it,
     * Escape while the focus is in it, or an answer taken go back to the list. The focus moves to Back
     * when it opens. @param onClose - (returnFocus) => void; a click outside keeps the focus where you
     * clicked, so it never takes it back from the composer.
     */
    function PileDetail({ card, t, active, onClose }) {
      const root = React.useRef(null)
      React.useEffect(() => { root.current?.querySelector('button')?.focus({ preventScroll: true }) }, [])
      React.useEffect(() => {
        // Only while open: a closing detail stays drawn for its close, and must not close the next one.
        if (!active) return undefined
        // The card's own box (its padding) and the pile's (its scroll bar) belong to the detail's window.
        const outside = (event) => {
          const inside = root.current?.closest(PILE_LIST.cardBox)?.contains(event.target) || event.target.matches?.(PILE_LIST.scrollArea)
          if (!inside) onClose(false)
        }
        document.addEventListener('pointerdown', outside, true)
        return () => document.removeEventListener('pointerdown', outside, true)
      }, [active, onClose])
      const back = () => onClose(true)
      // Escape while an input method composes (Chinese, for one) only ends the composition.
      const onKeyDown = (event) => { if (event.key === PILE_LIST.escapeKey && !event.nativeEvent.isComposing) { event.stopPropagation(); back() } }
      return h('div', { ref: root, role: 'region', 'aria-label': cardWho(t, card), className: CLS.detail, 'data-fishball-detail': card.requestId, onKeyDown },
        h('button', { type: 'button', className: MCLS.crumb, onClick: back }, h(IconChevronLeftOutlineRegular, { size: MANAGER.crumbIconSize }), t('pileBack')),
        h(QUESTION_KINDS.has(card.kind) ? QuestionCard : PileCard, { card, t, onDone: () => onClose(true, card.requestId) }))
    }

    /**
     * One card's place in the list: its row, or its detail while it is open. It is drawn while the list
     * shows, or while it is the open one, and closes when it leaves the pile.
     */
    function PileEntry({ card, t, leaving, listShown, isOpen, onOpen, onClose, focus }) {
      return h(Reveal, { as: 'li', shown: !leaving && (listShown || isOpen), 'data-fishball-card': card.requestId, 'data-fishball-card-kind': card.kind },
        h('div', { className: CLS.card },
          h(Reveal, { shown: !isOpen }, h(PileRow, { card, t, onOpen, focus })),
          h(Reveal, { shown: isOpen }, h(PileDetail, { card, t, active: isOpen, onClose }))))
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

    /** What a grant covers, in words: "npm test*", or "exact bash call" (never the arguments, which the Host does not keep). */
    const grantWhat = (t, grant) => (grant.kind === GRANT_VIEW.prefix ? grant.prefix + GRANT_VIEW.wildcard : t('grantExact', { tool: grant.toolName }))

    /** POST your Revoke. @returns null when accepted, else the refusal's text. */
    async function revokeGrant(grantId, t) {
      const { ok, code } = await send(API.grantsRevoke, { grantId })
      if (ok) return null
      return t(GRANT_ERRORS.has(code) ? 'grantError.' + code : 'cardFailed')
    }

    /**
     * One active grant beside the pile (DESIGN §10e, item 19): its session, tool, prefix or exact
     * call, end time, uses and Revoke; a paused grant says so. The prefix is Fishball's text and the
     * title another session's, so both are drawn as plain text.
     */
    function GrantRow({ grant, t }) {
      const { busy, problem, run } = useSubmit()
      return h('div', { className: CLS.card },
        h('div', { className: CLS.cardHead },
          sessionTitle(grant),
          h('span', { className: CLS.code }, grant.toolName),
          grant.paused ? h(Tag, { tone: 'neutral' }, t('grantPaused')) : null),
        h('div', { className: CLS.code }, grantWhat(t, grant)),
        h('div', { className: CLS.muted }, `${t('grantEnds', { at: new Date(grant.expiresAt).toLocaleString() })}${TURN_TAGS.separator}${grant.uses === GRANT_USES.once ? t('grantUsedOnce') : t('grantUses', { count: grant.uses })}`),
        h('div', { className: CLS.actions }, cardButton(t, busy, 'revoke', 'secondary', () => void run(() => revokeGrant(grant.grantId, t)), 'revoke')),
        problemLine(problem))
    }

    const cardKey = (card) => card.requestId
    // One empty list for a snapshot without cards or grants: useLeaving compares lists by identity.
    const NO_ENTRIES = Object.freeze([])
    const grantKey = (grant) => grant.grantId

    /** Shared section disclosure. A native button supplies Enter/Space without custom key handlers. */
    function PileSection({ title, expanded, onToggle, children }) {
      const id = React.useId()
      return h('section', { 'aria-label': title },
        h('button', { type: 'button', className: CLS.pileHead, 'aria-expanded': expanded, 'aria-controls': id, onClick: onToggle },
          h(IconChevronLeftOutlineRegular, { size: PILE.chevronPx, 'aria-hidden': true, style: { transform: `rotate(${expanded ? PILE.expandedRotationDeg : PILE.collapsedRotationDeg}deg)` } }), title),
        h('div', { id }, h(Reveal, { shown: expanded }, children)))
    }

    /**
     * Your pile above Fishball's composer (DESIGN §10e, items 14-16; rev11-pile-list): "Waiting for
     * you (n)" over a list of compact rows, shown only in Fishball's own session and only while it
     * holds a card or a grant. One row at a time opens into its detail, in place of the list: the other
     * rows and the grants hide until it closes, and a request that arrives meanwhile only changes the
     * count. If the open request leaves the pile, the detail closes. The active grants are a second
     * section in the same pinned area (Q-r11-grants-place). Its height is the limit pileMaxHeightVh;
     * past it the area scrolls, the list and the detail alike, so the composer stays in view.
     */
    function makePile(t) {
      return function FishballPile({ sessionId }) {
        const state = useFishball()
        const live = state.pile ?? NO_ENTRIES
        const liveGrants = state.grants ?? NO_ENTRIES
        // Cards you just answered in their detail: hidden at once, before the snapshot drops them, so
        // the answered row never shows again with live buttons. Ids are unique, so none comes back.
        const [answered, setAnswered] = React.useState(NO_ENTRIES)
        const shownCards = React.useMemo(() => (answered.length === 0 ? live : live.filter((card) => !answered.includes(card.requestId))), [live, answered])
        const cards = useLeaving(shownCards, cardKey)
        const grants = useLeaving(liveGrants, grantKey)
        const [openId, setOpenId] = React.useState(null)
        const [focusId, setFocusId] = React.useState(null)
        // Snapshot updates must not reopen a section the user folded. Keep these choices here,
        // outside the reveals that temporarily hide grants while a request detail is open.
        const [requestsExpanded, setRequestsExpanded] = React.useState(PILE.requestsExpanded)
        const [grantsExpanded, setGrantsExpanded] = React.useState(PILE.grantsExpanded)
        const scroller = React.useRef(null)
        // Derived, so a request that left the pile closes its detail at once (P5).
        const open = openId !== null && live.some((card) => card.requestId === openId) ? openId : null
        // The detail starts at the top of the scrolling area once the rows above it have closed.
        React.useEffect(() => {
          if (open === null) return undefined
          const timer = setTimeout(() => { if (scroller.current) scroller.current.scrollTop = 0 }, revealMs())
          return () => clearTimeout(timer)
        }, [open])
        // The open id as last drawn, so closing knows which row takes the focus back.
        const drawnOpen = React.useRef(open)
        drawnOpen.current = open
        const onOpen = React.useCallback((requestId) => { setFocusId(null); setOpenId(requestId) }, [])
        /** @param answeredId - the card you answered in the detail: it leaves, so the pile takes the focus. */
        const onClose = React.useCallback((returnFocus, answeredId) => {
          setFocusId(returnFocus && answeredId === undefined ? drawnOpen.current : null)
          if (answeredId !== undefined) {
            setAnswered((current) => [...current, answeredId])
            scroller.current?.focus({ preventScroll: true })
          }
          setOpenId(null)
        }, [])
        if (!sessionId || sessionId !== state.sessionId) return null
        const title = t('pileTitle', { count: live.length })
        const grantsTitle = t('grantsTitle', { count: liveGrants.length })
        const toggleRequests = () => {
          setRequestsExpanded((expanded) => !expanded)
          setOpenId(null)
          setFocusId(null)
        }
        return h(Reveal, { shown: live.length > 0 || liveGrants.length > 0, className: CLS.pileDock },
          h('section', { ref: scroller, tabIndex: -1, className: CLS.pile, style: { maxHeight: `${state.limits.pileMaxHeightVh}${PILE.heightUnit}` }, 'data-fishball-pile': live.length, 'data-fishball-grants': liveGrants.length, 'data-fishball-pile-open': open ?? undefined },
            h(Reveal, { shown: live.length > 0 }, h(PileSection, { title, expanded: requestsExpanded, onToggle: toggleRequests },
              h('ul', { className: CLS.entries }, cards.map(({ item: card, leaving }) => h(PileEntry, { key: card.requestId, card, t, leaving, listShown: open === null, isOpen: open === card.requestId, onOpen, onClose, focus: open === null && focusId === card.requestId }))))),
            h(Reveal, { shown: liveGrants.length > 0 && open === null }, h(PileSection, { title: grantsTitle, expanded: grantsExpanded, onToggle: () => setGrantsExpanded((expanded) => !expanded) },
              h('ul', { className: CLS.entries }, grants.map(({ item: grant, leaving }) => h(Reveal, { as: 'li', key: grant.grantId, shown: !leaving, 'data-fishball-grant': grant.grantId }, h(GrantRow, { grant, t }))))))))
      }
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

    /**
     * A tag's words: "Sent to you", "Allowed by Fishball's grant: …" for a call a grant covered,
     * "Answered by Fishball: …" for a prompt Fishball answered (answer_prompt, rev11e), or "Asked
     * Fishball" with the answer (DESIGN §7a.3; client wording constants).
     */
    const tagText = (t, tag) => {
      if (tag.kind === TURN_TAGS.sentToYou) return t('tagSentToYou')
      if (tag.kind === TURN_TAGS.prompt && TAG_ANSWERS.has(tag.answer)) return t('tagPrompt', { decision: t('tagAnswer.' + tag.answer) })
      if (tag.kind === TURN_TAGS.grant && tag.grant) return t('tagGrant', { what: grantWhat(t, tag.grant) })
      // A question's tag shows Fishball's answer in its own words, read by the Host from the session log (§9).
      if (tag.kind === TURN_TAGS.question) return `${t('tagAskedFishball')}${TURN_TAGS.separator}${tag.answerText || t('tagAnswer.answer')}`
      if (tag.kind === TURN_TAGS.planReview && PLAN_TAG_ANSWERS.has(tag.answer)) return `${t('tagAskedFishball')}${TURN_TAGS.separator}${t('tagAnswer.' + tag.answer)}`
      return TAG_ANSWERS.has(tag.answer) ? `${t('tagAskedFishball')}${TURN_TAGS.separator}${t('tagAnswer.' + tag.answer)}` : t('tagAskedFishball')
    }

    /**
     * Tags in a turn's tail (DESIGN §10e, S37): every answer Fishball gave in that turn. A turn
     * knows its start and end seq, not its call ids, so it shows the records whose seq lies inside
     * it; a running turn has no end yet. The tail shows in folded turns too.
     */
    function makeTurnTags(t) {
      return function FishballTurnTags({ sessionId, turn }) {
        const state = useFishball()
        const from = turn?.start?.seq
        if (!sessionId || typeof from !== 'number') return null
        const to = turn?.end?.seq ?? Number.POSITIVE_INFINITY
        const tags = (state.tags ?? []).filter((tag) => tag.sessionId === sessionId && tag.seq > from && tag.seq < to).sort((a, b) => a.seq - b.seq)
        if (tags.length === 0) return null
        return h('div', { className: CLS.turnTags, 'data-fishball-tags': tags.length }, tags.map((tag) => h('span', { key: tag.key, className: CLS.fishTag, 'data-fishball-tag': tag.kind },
          h(FishballIcon, { size: TURN_TAGS.iconSize, unread: false }),
          tagText(t, tag))))
      }
    }

    /**
     * Reports that Fishball's chat is on screen. DSH has no "is this session shown" signal
     * for plugins, but the session header's actions are rendered only for the session being
     * shown, so this renders nothing and, while mounted for Fishball's own session in a visible
     * tab, tells the Host that its replies are read: once on arrival and again for each reply
     * that comes in while it stays open. A hidden tab does not count as reading.
     */
    function FishballReadReporter({ sessionId }) {
      const state = useFishball()
      const [visible, setVisible] = React.useState(document.visibilityState === VISIBLE)
      React.useEffect(() => {
        const update = () => setVisible(document.visibilityState === VISIBLE)
        document.addEventListener(VISIBILITY_EVENT, update)
        return () => document.removeEventListener(VISIBILITY_EVENT, update)
      }, [])
      const unread = unreadCount(state)
      const shown = Boolean(sessionId) && sessionId === state.sessionId
      React.useEffect(() => {
        if (shown && visible && unread > 0) void post(API.read, {})
      }, [shown, visible, unread])
      return null
    }

    /** Settings: switch the sidebar back to DeepSeek's icon and word logo (your choice, stored by the Host). */
    function makeBrandStyle(t) {
      return function FishballBrandStyle() {
        const state = useFishball()
        const [failed, setFailed] = React.useState(false)
        const deepseek = brandStyleOf(state) === BRAND_STYLE.deepseek
        const choose = async (on) => setFailed(!(await post(API.brand, { style: on ? BRAND_STYLE.deepseek : BRAND_STYLE.fishball })))
        return h('div', { className: CLS.section, 'data-fishball-brand-style': brandStyleOf(state) },
          h('h3', null, t('brandStyle')),
          h('p', { className: CLS.muted }, t('brandStyleHint')),
          h('div', { className: CLS.row },
            h('span', { className: CLS.grow }, t('brandStyleDeepseek')),
            h(Switch, { checked: deepseek, label: t('brandStyleDeepseek'), onChange: choose })),
          failed ? h('div', { role: 'alert' }, t('changeFailed')) : null)
      }
    }

    function makeHeaderAction(ctx, t) {
      return function FishballHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!sessionId || sessionId !== state.sessionId) return null
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => openSettings(ctx) }, t('openSettings'))
      }
    }

    /** DSH's staged form over the row's live config; Save writes through ctx.settings. */
    function limitsSection(scope) {
      const form = new SettingsFormModel(scope, LIMIT_FIELDS.map((field) => settingsNumberField(field)))
      const store = form.bind(() => ({ ...form.shell(), fields: Object.fromEntries(LIMIT_FIELDS.map((field) => [field, form.field(field)])) }))
      return { store, actions: form.actions(), dispose: () => form.dispose() }
    }

    /** Fishball's whole settings page: status, context window, plugins, limits form, hidden tools. */
    function makeSettingsPage(section, Status, ModelSettings, ProviderSyncSettings, Recommended, BrandStyle, ContextWindow, Intake, Watches, Approvals, Sources, Plugins, HiddenTools, t) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballSettings(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        const baseId = React.useId()
        if (props.view === SUMMARY_VIEW) return null
        const disabled = !state.writable || state.saving
        return h(React.Fragment, null,
          h(Status),
          h(ModelSettings),
          h(ProviderSyncSettings),
          h(Recommended),
          h(BrandStyle),
          h(ContextWindow),
          h(Intake),
          h(Watches),
          h(Approvals),
          h(Sources),
          h(Plugins),
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
          h(HiddenTools))
      }
    }

    function mountStyles() {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    /** Keep the hide rule for Fishball's own row in step with the session id the Host reports. */
    function hideOwnRow() {
      const style = document.createElement('style')
      style.id = OWN_ROW.styleId
      document.head.appendChild(style)
      const update = () => {
        const { sessionId } = stateSource.get()
        style.textContent = sessionId ? OWN_ROW.selector(sessionId) : ''
      }
      update()
      const unsubscribe = stateSource.subscribe(update)
      return () => { unsubscribe(); style.remove() }
    }

    /**
     * DSH's single slots cannot elect per session. Hide its model seat by the public slot
     * wrapper, scoped to Fishball's conversation, rather than replacing the host component
     * (which would replace it in ordinary chats too). !important beats its inline display:contents.
     */
    function hideModelSeat() {
      const style = document.createElement('style')
      style.id = MODEL.styleId
      document.head.appendChild(style)
      const update = () => {
        const { sessionId } = stateSource.get()
        style.textContent = sessionId ? MODEL.seatSelector(sessionId) + '{display:none !important}' : MODEL.empty
      }
      update()
      const unsubscribe = stateSource.subscribe(update)
      return () => { unsubscribe(); style.remove() }
    }

    /** Keep the block alive even when the dock is not mounted (settings, dialogs, or another chat). */
    function requireModel(conversation, t) {
      let ownedSession
      let ownedBlock
      const clear = () => {
        if (ownedSession && conversation.blocks.storeFor(ownedSession).getSnapshot() === ownedBlock) {
          conversation.blocks.set(ownedSession, undefined)
        }
        ownedSession = undefined
        ownedBlock = undefined
      }
      const update = () => {
        const { sessionId, modelSelection } = stateSource.get()
        if (sessionId !== ownedSession || modelSelection) clear()
        if (sessionId && !modelSelection && ownedSession !== sessionId) {
          ownedSession = sessionId
          ownedBlock = { reason: t('modelRequired') }
          conversation.blocks.set(sessionId, ownedBlock)
        }
      }
      update()
      const unsubscribe = stateSource.subscribe(update)
      return () => { unsubscribe(); clear() }
    }

    /** Load a script once; the promise settles when it has run. */
    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = () => resolve()
        script.onerror = () => { script.remove(); reject(new Error(src)) }
        document.head.appendChild(script)
      })
    }

    /**
     * Fishball's session id for the messenger's rows (a React hook). It selects the id alone, so
     * rows in every session re-render only when the id changes, not on each state event.
     */
    const useAssistantSessionId = () => React.useSyncExternalStore(stateSource.subscribe, () => stateSource.get().sessionId)

    /**
     * Mount the Messenger look while the Host reports it on, dispose it when off. Its file is
     * fetched at most once per page: a module already registered (a remount of this half) is
     * reused, because DSH refuses a second registration of the same id; so a page keeps the
     * messenger code it first loaded until it reloads. A failed load or mount is not retried on
     * every state event (the same failure would repeat): it is tried again when the look is
     * turned off and on, or on reload.
     */
    function followMessenger(ctx) {
      let fork
      let loading
      let wanted = false
      /** Bumped on every change, so a load that finishes after the look went off mounts nothing. */
      let generation = 0
      const messengerModule = () => {
        try { return Promise.resolve(require(MESSENGER_MODULE)) } catch { /* not registered yet */ }
        loading ??= loadScript(apiUrl(API.messengerClient)).then(() => require(MESSENGER_MODULE))
        loading.catch(() => { loading = undefined })
        return loading
      }
      const update = () => {
        const on = stateSource.get().look?.messenger === true
        if (on === wanted) return
        wanted = on
        const current = ++generation
        if (!on) { fork?.dispose(); fork = undefined; return }
        messengerModule()
          .then((plugin) => { if (current === generation) fork = ctx.plugin(plugin, { useAssistantSessionId, mark: FISH_MARK }) })
          .catch((error) => console.warn('fishball: the Messenger look could not be loaded', error))
      }
      update()
      const unsubscribe = stateSource.subscribe(update)
      return () => { unsubscribe(); generation++; fork?.dispose(); fork = undefined }
    }

    // The plugin manager (DESIGN §10d): the Fishball tab of DSH's Plugins page, and a tag and a
    // switch on DSH's own page for each plugin. Every change goes to Fishball's side only.

    /** Unchecked tools wait for your Allow (DESIGN §7); a plugin with any, or with an error, needs you. */
    const waitingTools = (plugin) => plugin.tools.filter((tool) => tool.status === TOOL_STATUS.unchecked).length
    const needsYou = (plugin) => waitingTools(plugin) > 0 || plugin.lastError !== null
    const offersToggle = (plugin) => plugin.actions.includes(PLUGIN_OFFER.enable) || plugin.actions.includes(PLUGIN_OFFER.disable)
    /** DSH's Installed tab lists DSH plugins only, so only they open there. */
    const DSH_LISTED = new Set(MANAGER.groups.find((group) => group.id === MANAGER.dshGroup).dsh)
    /** The value at a path of a plain value, or undefined. */
    const valueAt = (value, path) => path.reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), value)
    /** Set a value at a path, creating the objects on the way. */
    function setAt(target, path, value) {
      let node = target
      for (const key of path.slice(0, -1)) node = node[key] ??= {}
      node[path[path.length - 1]] = value
    }

    /**
     * The plugin manager's components (DESIGN §10d). Display text from DSH's metadata is read
     * through DSH's own locale service, as its Plugins page reads it (review M3).
     * @param resolveText - ctx.locale.resolveText (LocalizedText -> string in the UI language).
     */
    function makeManager(t, resolveText) {
      const localized = (text) => (text === undefined || text === null ? undefined : resolveText(text))
      const pluginTitle = (plugin) => localized(plugin.meta?.title) || plugin.title
      const pluginDescription = (plugin) => localized(plugin.meta?.description) || plugin.description || ''

      /** One catalog plugin from the snapshot (undefined for no key or an unknown one). */
      function useCatalogPlugin(key) {
        const catalog = useFishball().catalog
        return key === undefined ? undefined : catalog?.plugins.find((plugin) => plugin.plugin === key)
      }

      /** The plugin's icon tile: its own icon, DSH's artwork for some built-ins, the fish for the Messenger look, else DSH's default. */
      function PluginIcon({ plugin }) {
        const art = plugin.hasIcon ? h('img', { src: apiUrl(`${API.pluginsIcon}?plugin=${encodeURIComponent(plugin.plugin)}`), alt: '', loading: 'lazy' })
          : plugin.plugin === MANAGER.messengerKey ? h(FishballIcon, { size: MANAGER.artSize, unread: false })
            : h(MANAGER.builtinArt[plugin.plugin] ?? PluginArtworkDefault, { size: MANAGER.artSize })
        return h('span', { className: MCLS.icon, 'aria-hidden': true }, art)
      }

      /** The tags after a plugin's title (DESIGN §10d): its DSH state, where it runs, and anything pending or wrong. */
      function PluginTags({ plugin, t }) {
        const tag = (tone, text) => h(Tag, { key: text, tone, className: MCLS.tag }, text)
        const waiting = waitingTools(plugin)
        return [
          tag('neutral', t('dsh.' + plugin.dsh)),
          plugin.packageName?.startsWith(MANAGER.experimentalPrefix) ? tag('info', t('experimental')) : null,
          plugin.dsh === MANAGER.dshOff && plugin.runs === MANAGER.runsInFishball ? tag('info', t('runsOnlyInFishball')) : null,
          plugin.removing ? tag('info', t('removing')) : null,
          plugin.on !== plugin.applied && !plugin.removing ? tag('info', t('pending')) : null,
          plugin.waiting ? tag('info', t('waiting')) : null,
          // Why it cannot run in Fishball's tree, known before trying (the Host offers no switch then).
          plugin.blocked && plugin.blocked !== plugin.lastError ? tag('danger', pluginErrorText(t, plugin.blocked)) : null,
          plugin.lastError ? tag('danger', pluginErrorText(t, plugin.lastError)) : null,
          waiting > 0 ? tag('danger', t('toolsWait', { count: waiting })) : null,
        ]
      }

      /** Fishball's own on/off for one plugin (POST plugins); none while the Host offers no toggle. */
      function FishballSwitch({ plugin, t, onResult }) {
        if (!offersToggle(plugin)) return null
        // Fishball's own switch, in Fishball's colour wherever it appears (revision 10a).
        return h('span', { className: MCLS.accent }, h(Switch, { checked: plugin.on, label: t('pluginToggle', { name: pluginTitle(plugin) }), onChange: async (on) => onResult(await post(API.plugins, { plugin: plugin.plugin, on })) }))
      }

      /** One card of the list, like a card on DSH's Installed tab; the whole card opens the plugin's page. */
      function PluginCard({ plugin, t, onOpen, onResult }) {
        const title = pluginTitle(plugin)
        const description = pluginDescription(plugin)
        return h('li', { className: MCLS.card, 'data-fishball-plugin': plugin.plugin, onClick: () => onOpen(plugin.plugin) },
          h('div', { className: MCLS.cardHead },
            h(PluginIcon, { plugin }),
            h('div', { className: MCLS.main },
              h('div', { className: MCLS.titleRow },
                h('button', { type: 'button', className: MCLS.title, 'aria-label': t('viewPlugin', { name: title }), onClick: (event) => { event.stopPropagation(); onOpen(plugin.plugin) } }, title),
                h(PluginTags, { plugin, t })),
              description ? h('div', { className: MCLS.desc }, description) : null),
            // The switch acts on its own; a click on it must not also open the page.
            h('span', { onClick: (event) => event.stopPropagation() }, h(FishballSwitch, { plugin, t, onResult }))))
      }

      /** One tool and its state for Fishball; an allowance you gave can be removed here (DESIGN §7). */
      function ToolLine({ tool, allowance, t, onResult }) {
        const allowed = allowance !== undefined && tool.status === TOOL_STATUS.visible
        return h('li', { className: MCLS.row },
          h('code', null, tool.name),
          h(Tag, { tone: TAG_TONE[tool.status] ?? 'neutral', className: MCLS.tag }, t(allowed ? 'tool.allowed' : 'tool.' + tool.status)),
          allowance !== undefined ? h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: async () => onResult(await post(API.toolApprovals, { toolKey: allowance })) }, t('remove')) : null)
      }

      /**
       * "Install for Fishball" where DSH's own Add plugin sits: DSH hides its toolbar on a
       * contributed tab and offers no slot in the page header, so the button is rendered into the
       * header row through a portal (owner's request: the page looks like DSH's). The header is
       * found from the tab panel: the row holding the page title (`h1`). If DSH's markup changes and
       * it is not found, the button stays at the top of the tab instead.
       */
      /**
       * Refresh, as on DSH's own list: reads Fishball's plugin list again (and an open plugin page).
       * Disabled with a spinner until the read settles and at least refreshMinMs passed, so the
       * spinner never flashes; repeated clicks meanwhile are ignored (DSH's rules).
       */
      function RefreshButton({ t, onResult }) {
        const [busy, setBusy] = React.useState(false)
        const refresh = async () => {
          setBusy(true)
          const [answer] = await Promise.all([send(API.pluginsRefresh, {}), new Promise((resolve) => setTimeout(resolve, MANAGER.refreshMinMs))])
          managerRefreshes.set(managerRefreshes.get() + 1)
          setBusy(false)
          onResult(answer.ok, 'refreshFailed')
        }
        return h('button', { type: 'button', className: MCLS.iconButton, 'aria-label': t('refresh'), title: t('refresh'), 'aria-busy': busy, disabled: busy, onClick: refresh },
          busy ? h('span', { className: MCLS.spin, 'aria-hidden': true }, h(IconLoadingOutlineRegular, { size: MANAGER.refreshIconSize })) : h(IconRefreshOutlineRegular, { size: MANAGER.refreshIconSize }))
      }

      function InstallHeaderAction({ t, onInstall, onResult }) {
        const anchor = React.useRef(null)
        const [slot, setSlot] = React.useState(null)
        React.useLayoutEffect(() => {
          const panel = anchor.current?.closest('[role=tabpanel]')
          const head = panel?.parentElement?.querySelector('h1')?.parentElement?.parentElement
          if (!head) return undefined
          const container = document.createElement('div')
          container.className = MCLS.headerActions
          head.appendChild(container)
          setSlot(container)
          return () => { container.remove(); setSlot(null) }
        }, [])
        const button = h(React.Fragment, null,
          h(RefreshButton, { t, onResult }),
          h('span', { className: MCLS.accent }, h(Button, { type: 'button', size: 'sm', variant: 'primary', className: MCLS.addButton, onClick: onInstall }, h(IconPlusOutlineRegular, { size: MANAGER.addIconSize }), t('installForFishball'))))
        // The anchor stays in the tab only to find the header; its class sets display, so it is hidden inline once the button moved.
        return h('span', { ref: anchor, className: MCLS.bar, style: slot === null ? undefined : { display: 'none' } }, slot === null ? button : createPortal(button, slot))
      }

      /** The list (version 1): groups by origin, like DSH's Installed tab, then any tool whose plugin is unknown. */
      function PluginList({ catalog, t, onOpen, onResult, onInstall }) {
        const allowances = new Map(catalog.allowedTools.map((tool) => [tool.toolName, tool.key]))
        // Allowances whose tool is not listed anywhere (its plugin is off, or it registers later) keep a Remove here (review M2).
        const shown = new Set([...catalog.plugins.flatMap((plugin) => plugin.tools.map((tool) => tool.name)), ...catalog.otherTools.map((tool) => tool.name)])
        const unlisted = catalog.allowedTools.filter((tool) => !shown.has(tool.toolName))
        return h(React.Fragment, null,
          h(InstallHeaderAction, { t, onInstall, onResult }),
          MANAGER.groups.map((group) => {
            const plugins = catalog.plugins.filter((plugin) => group.dsh.includes(plugin.dsh))
            if (plugins.length === 0) return null
            return h('section', { key: group.id, className: MCLS.group },
              h('h3', { className: MCLS.groupTitle }, t('group.' + group.id)),
              h('ul', { className: MCLS.cards }, plugins.map((plugin) => h(PluginCard, { key: plugin.plugin, plugin, t, onOpen, onResult }))))
          }),
          catalog.otherTools.length === 0 ? null : h('section', { className: MCLS.group },
            h('h3', { className: MCLS.groupTitle }, t('group.tools')),
            h('ul', { className: MCLS.rows }, catalog.otherTools.map((tool) => h(ToolLine, { key: tool.name, tool, allowance: allowances.get(tool.name), t, onResult })))),
          unlisted.length === 0 ? null : h('section', { className: MCLS.group },
            h('h3', { className: MCLS.groupTitle }, t('group.allowed')),
            h('ul', { className: MCLS.rows }, unlisted.map((tool) => h('li', { key: tool.key, className: MCLS.row },
              h('code', null, tool.toolName),
              h('span', { className: MCLS.hint }, tool.module),
              h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: async () => onResult(await post(API.toolApprovals, { toolKey: tool.key })) }, t('remove')))))))
      }

      /**
       * The plugin page's data from the Host (GET plugins/detail), read again when the plugin's
       * snapshot entry changes (a switch, an apply, a save) and after a save of this page.
       */
      function usePluginDetail(plugin) {
        const [result, setResult] = React.useState({ value: null, failed: false })
        const [revision, setRevision] = React.useState(0)
        const refreshes = useManagerRefreshes()
        const stamp = JSON.stringify([plugin.on, plugin.applied, plugin.settings, plugin.changedBy, plugin.lastError, plugin.dsh])
        React.useEffect(() => {
          let current = true
          fetch(apiUrl(`${API.pluginsDetail}?plugin=${encodeURIComponent(plugin.plugin)}`))
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then((body) => { if (current) setResult({ value: body.detail, failed: false }) })
            .catch(() => { if (current) setResult((previous) => ({ value: previous.value, failed: true })) })
          return () => { current = false }
        }, [plugin.plugin, stamp, revision, refreshes])
        return { ...result, reload: () => setRevision((count) => count + 1) }
      }

      /**
       * The fields of a schema JSON envelope ({ uid, refs }, schemastery toJSON), in declaration
       * order, each with the way the form draws it. A root that is not an object is shown only.
       */
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

      /** A field's label row: its name, and "Changed" with Reset for a field you changed (as DSH's value field shows). */
      function FieldHead({ id, label, changed, onReset, disabled, t }) {
        return h('div', { className: MCLS.fieldHead },
          // A control without an id of its own (the switch, a shown-only value) gets a plain caption.
          id === undefined ? h('span', { className: MCLS.label }, label) : h('label', { htmlFor: id, className: MCLS.label }, label),
          changed ? h(React.Fragment, null, h(Tag, { tone: 'neutral' }, t('settingsChanged')), h('button', { type: 'button', className: MCLS.reset, disabled, 'aria-label': t('resetField', { name: label }), onClick: onReset }, t('settingsReset'))) : null)
      }

      /** One field of the form, drawn for its kind. */
      function SettingsField({ field, id, row, draft, changed, invalid, disabled, onEdit, onReset, t }) {
        const label = field.path.join('.')
        const current = valueAt(row.value, field.path)
        const text = draft !== undefined ? draft : fieldText(field, current)
        const labelled = field.kind === FIELD_KIND.choice || field.kind === FIELD_KIND.list
        const head = h(FieldHead, { id: labelled ? id : undefined, label, changed, onReset, disabled, t })
        const hint = field.description ? h('p', { className: MCLS.hint }, field.description) : null
        if (field.kind === FIELD_KIND.text || field.kind === FIELD_KIND.number) {
          return h(SettingsValueField, {
            id, label, text, numeric: field.kind === FIELD_KIND.number, hint: field.description, invalid, invalidLabel: t('settingsInvalid'),
            overridden: changed, overriddenLabel: t('settingsChanged'), resetLabel: t('settingsReset'), onReset, disabled, onEdit,
          })
        }
        if (field.kind === FIELD_KIND.secret) {
          const slot = row.secrets.find((candidate) => JSON.stringify(candidate.path) === field.key)
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
       * One row's settings form (DESIGN §10d "The form"). Edits are drafts until Save; Reset on a
       * field drops your value for it; Reset all drops every value of the row. The Host checks the
       * whole config and answers an invalid field's path, which the form marks.
       */
      function SettingsRowForm({ plugin, row, showRow, t, onSaved }) {
        const baseId = React.useId()
        const fields = React.useMemo(() => formFields(row.schema), [row.schema])
        const [drafts, setDrafts] = React.useState({})
        const [resets, setResets] = React.useState([])
        const [saving, setSaving] = React.useState(false)
        const [message, setMessage] = React.useState(null)
        const edit = (field, value) => {
          setDrafts({ ...drafts, [field.key]: value })
          setResets(resets.filter((key) => key !== field.key))
          setMessage(null)
        }
        const reset = (field) => {
          const next = { ...drafts }
          delete next[field.key]
          setDrafts(next)
          setResets([...new Set([...resets, field.key])])
          setMessage(null)
        }
        const save = async (body) => {
          setSaving(true)
          const answer = await send(API.pluginsSettings, { plugin, row: row.row, ...body })
          setSaving(false)
          if (answer.ok) { setDrafts({}); setResets([]); setMessage({ kind: FORM_MESSAGE.saved }); onSaved() }
          else setMessage(answer.code === SETTINGS_INVALID ? { kind: FORM_MESSAGE.invalid, path: answer.path ?? [] } : { kind: FORM_MESSAGE.failed })
        }
        const submit = () => {
          const values = {}
          for (const field of fields) {
            if (!Object.hasOwn(drafts, field.key)) continue
            // An empty secret field means "keep the stored secret".
            if (field.kind === FIELD_KIND.secret && drafts[field.key] === '') continue
            const value = fieldValue(field, drafts[field.key])
            if (value === undefined) { setMessage({ kind: FORM_MESSAGE.invalid, path: field.path }); return }
            setAt(values, field.path, value)
          }
          const reset = resets.map((key) => JSON.parse(key))
          // Only an emptied secret was edited: nothing to send (review L3).
          if (Object.keys(values).length === 0 && reset.length === 0) { setDrafts({}); return }
          void save({ ...(Object.keys(values).length > 0 ? { values } : {}), ...(reset.length > 0 ? { reset } : {}) })
        }
        const dirty = Object.keys(drafts).length > 0 || resets.length > 0
        // The Host names the failing field's path, which can lie inside a field (a list item): the field containing it is marked (review L7).
        const isInvalid = (field) => message?.kind === FORM_MESSAGE.invalid && field.path.every((key, index) => message.path[index] === key)
        const marked = fields.some(isInvalid)
        return h('div', { className: MCLS.section, 'data-fishball-settings-row': row.row },
          showRow ? h('p', { className: MCLS.hint }, t('settingsRow', { row: row.row })) : null,
          row.error ? h('p', { role: 'status', className: MCLS.hint }, t('settingsOwnError', { message: row.error })) : null,
          h('div', { className: MCLS.fields }, fields.map((field) => h(SettingsField, {
            key: field.key,
            field,
            id: `${baseId}-${field.key}`,
            row,
            draft: drafts[field.key],
            changed: Object.hasOwn(drafts, field.key) || (valueAt(row.user, field.path) !== undefined && !resets.includes(field.key)),
            invalid: isInvalid(field),
            disabled: saving,
            onEdit: (value) => edit(field, value),
            onReset: () => reset(field),
            t,
          }))),
          message?.kind === FORM_MESSAGE.saved ? h('div', { role: 'status', className: MCLS.hint }, t('settingsSaved')) : null,
          message?.kind === FORM_MESSAGE.failed ? h('div', { role: 'alert' }, t('settingsFailed')) : null,
          // A field the Host named is marked on the field itself; say it here only when no drawn field contains it.
          message?.kind === FORM_MESSAGE.invalid && !marked ? h('div', { role: 'alert' }, t('settingsInvalid')) : null,
          h('div', { className: MCLS.formActions },
            Object.keys(row.user).length > 0 ? h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: saving, onClick: () => void save({ reset: [[]] }) }, t('settingsResetAll')) : null,
            h('span', { className: MCLS.accent }, h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: saving || !dirty, onClick: submit }, saving ? t('saving') : t('save')))))
      }

      /** Settings for Fishball on the plugin page; a plugin on in DSH uses DSH's settings (DESIGN §10d). */
      function SettingsSection({ plugin, detail, t }) {
        const body = (() => {
          if (detail.value === null) return detail.failed ? h('p', { role: 'alert' }, t('pageLoadFailed')) : null
          if (detail.value.shared) {
            return h(React.Fragment, null,
              h('p', { className: MCLS.hint }, t('settingsShared')),
              plugin.settings === MANAGER.settingsUnused ? h('p', { className: MCLS.hint }, t('settingsUnused')) : null)
          }
          const rows = detail.value.rows.filter((row) => row.editable)
          // A row whose module or config could not be read says so instead of disappearing (review M5).
          const broken = detail.value.rows.filter((row) => !row.editable && row.error !== null)
          const notes = broken.map((row) => h('p', { key: row.row, role: 'status', className: MCLS.hint }, t('settingsRowUnavailable', { row: row.row })))
          if (rows.length === 0) return notes.length > 0 ? notes : h('p', { className: MCLS.hint }, t('settingsNone'))
          return [...notes, ...rows.map((row) => h(SettingsRowForm, { key: row.row, plugin: plugin.plugin, row, showRow: rows.length > 1, t, onSaved: detail.reload }))]
        })()
        return h('section', { className: MCLS.section },
          h('h4', { className: MCLS.sectionTitle }, t('settingsTitle')),
          // A failed refresh keeps the last page on screen, and says it may be out of date (review L4).
          detail.failed && detail.value !== null ? h('p', { role: 'alert' }, t('pageLoadFailed')) : null,
          body)
      }

      /**
       * While a plugin's page is open, DSH's page header and tab row are hidden, as DSH hides them
       * on its own plugin pages (owner's request: the page looks like DSH's). They are the tab
       * panel's siblings in DSH's page (dsh-client-ui-plugin-manager, rc.2); each gets its own
       * display back when the page closes. If DSH's markup changes, nothing is hidden.
       */
      function useHiddenPageChrome(anchor) {
        React.useLayoutEffect(() => {
          const panel = anchor.current?.closest('[role=tabpanel]')
          const siblings = panel?.parentElement ? [...panel.parentElement.children].filter((element) => element !== panel) : []
          const before = siblings.map((element) => element.style.display)
          for (const element of siblings) element.style.display = 'none'
          return () => siblings.forEach((element, index) => { element.style.display = before[index] })
        }, [])
      }

      /**
       * A plugin's page (page A), laid out like DSH's own plugin page (dsh-client-ui-plugin-manager
       * .detail, rc.2): the back link, the icon with the actions, the title block, then sections.
       */
      function PluginPage({ plugin, catalog, t, openPackage, onBack, onResult }) {
        const anchor = React.useRef(null)
        useHiddenPageChrome(anchor)
        const detail = usePluginDetail(plugin)
        const title = pluginTitle(plugin)
        const description = pluginDescription(plugin)
        const allowances = new Map(catalog.allowedTools.map((tool) => [tool.toolName, tool.key]))
        const last = detail.value?.history[0]
        const changed = last !== undefined ? t('changedAt', { who: t('who.' + last.by), when: new Date(last.at).toLocaleString() })
          : plugin.changedBy ? t('changedBy' + plugin.changedBy) : t('neverChanged')
        const fact = (label, value) => h('div', null, h('dt', null, label), h('dd', null, value))
        return h('div', { ref: anchor, className: MCLS.detail, 'data-fishball-plugin-page': plugin.plugin },
          h('div', { className: MCLS.detailTop },
            h('button', { type: 'button', className: MCLS.crumb, 'aria-label': t('backToListLabel'), onClick: onBack }, h(IconChevronLeftOutlineRegular, { size: MANAGER.crumbIconSize }), t('backToList')),
            h('div', { className: MCLS.detailHead },
              h(PluginIcon, { plugin }),
              h('div', { className: MCLS.detailActions },
                plugin.actions.includes(PLUGIN_OFFER.uninstall)
                  ? h(Button, { type: 'button', size: 'sm', variant: 'outline', 'aria-label': t('uninstallLabel', { name: title }), onClick: async () => onResult(await post(API.pluginsRemove, { plugin: plugin.plugin })) }, t('uninstall'))
                  : null,
                h(FishballSwitch, { plugin, t, onResult })))),
          h('div', { className: MCLS.detailMain },
            h('div', { className: MCLS.titleRow },
              h('h3', { className: MCLS.detailTitle }, title),
              plugin.version ? h(Tag, { tone: 'neutral', className: MCLS.tag }, plugin.version) : null,
              h(PluginTags, { plugin, t })),
            plugin.packageName ? h('p', { className: MCLS.detailName }, h('code', null, plugin.packageName)) : null,
            description ? h('p', { className: MCLS.detailDesc }, description) : null),
          h('div', { className: MCLS.sections },
            h('section', { className: MCLS.detailSection },
              h('div', { className: MCLS.sectionHead },
                h('h4', { className: MCLS.sectionTitle }, t('tools')),
                plugin.tools.length > 0 ? h('span', { className: MCLS.sectionCount }, t('toolsCount', { count: plugin.tools.length })) : null),
              plugin.tools.length === 0 ? h('p', { className: MCLS.hint }, t('noTools'))
                : h('ul', { className: MCLS.rows }, plugin.tools.map((tool) => h(ToolLine, { key: tool.name, tool, allowance: allowances.get(tool.name), t, onResult })))),
            h(SettingsSection, { plugin, detail, t }),
            h('section', { className: MCLS.detailSection },
              h('h4', { className: MCLS.sectionTitle }, t('detailsTitle')),
              h('dl', { className: MCLS.facts },
                fact(t('inDsh'), h(React.Fragment, null, t('inDsh.' + plugin.dsh), DSH_LISTED.has(plugin.dsh) && plugin.packageName ? h(React.Fragment, null, ' · ', h('button', { type: 'button', className: MCLS.link, onClick: () => openPackage(plugin.packageName) }, t('openInDsh'))) : null)),
                fact(t('lastChange'), changed)))))
      }

      /** The Fishball tab (`plugins.tab`): the list, or one plugin's page, and the install dialog. */
      function makeFishballTab(t) {
        return function FishballTab({ openPackage }) {
          const state = useFishball()
          const open = useManagerView()
          // The text of the last action that failed, or null; a later success clears it.
          const [failed, setFailed] = React.useState(null)
          const catalog = state.catalog
          if (!catalog) return h('div', { className: MCLS.panel }, h('p', { className: MCLS.hint }, t('status.' + (state.status ?? STATUS.starting))))
          const onResult = (ok, failure = 'changeFailed') => setFailed(ok ? null : failure)
          const plugin = open === null ? undefined : catalog.plugins.find((entry) => entry.plugin === open)
          return h('div', { className: MCLS.panel, 'data-fishball-manager': true },
            failed ? h('div', { role: 'alert' }, t(failed)) : null,
            plugin !== undefined
              ? h(PluginPage, { key: plugin.plugin, plugin, catalog, t, openPackage, onBack: () => managerView.show(null), onResult })
              : h(PluginList, { catalog, t, onOpen: managerView.show, onResult, onInstall: () => installRequest.open(INSTALL_FROM.tab) }))
        }
      }

      /** The DSH plugin a bundle page shows, as Fishball's catalog knows it (DSH plugins are keyed by package name). */
      const bundlePlugin = (subject) => (subject?.kind === MANAGER.bundleSubject ? subject.pkg?.name : undefined)

      /** DSH's page for a plugin: a tag with its state in Fishball (`plugins.detail.badge`). */
      function makeDetailBadge(t) {
        return function FishballDetailBadge({ subject }) {
          const plugin = useCatalogPlugin(bundlePlugin(subject))
          if (plugin === undefined) return null
          // A plugin that cannot run in Fishball says why here too, as there is no switch (review 10b #9).
          if (plugin.blocked && !plugin.on) return h(Tag, { tone: 'danger', className: MCLS.tag }, pluginErrorText(t, plugin.blocked))
          const text = plugin.dsh === MANAGER.dshOff && plugin.runs === MANAGER.runsInFishball ? 'runsOnlyInFishball' : plugin.on ? 'onInFishball' : 'offInFishball'
          return h(Tag, { tone: plugin.on ? 'info' : 'neutral', className: MCLS.tag }, t(text))
        }
      }

      /** DSH's page for a plugin: Fishball's own switch at its head (`plugins.detail.actions`), labelled so it is not taken for DSH's. */
      function makeDetailAction(t) {
        return function FishballDetailAction({ subject }) {
          const plugin = useCatalogPlugin(bundlePlugin(subject))
          if (plugin === undefined || !offersToggle(plugin)) return null
          // No caption: the fish on the knob marks it as Fishball's (its label names it for screen readers).
          return h(FishballSwitch, { plugin, t, onResult: () => {} })
        }
      }

      return { FishballTab: makeFishballTab(t), DetailBadge: makeDetailBadge(t), DetailAction: makeDetailAction(t) }
    }

    exports.name = PACKAGE_NAME
    exports.inject = ['slots', 'locale', 'configForms']
    exports.apply = function apply(ctx) {
      const t = ctx.locale.bind(NS)
      /**
       * DSH's Host events the browser receives (its install progress, revision 10a), when the
       * remote service is there; without it the dialog shows no progress lines.
       */
      const listenToHost = (name, listener) => {
        const remote = ctx.get(SERVICE.remote)
        return typeof remote?.$on === 'function' ? remote.$on(name, listener) : () => {}
      }
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'fishball: dictionaries')
      ctx.effect(mountStyles, 'fishball: styles')
      ctx.effect(hideOwnRow, 'fishball: hide own session row')
      ctx.effect(hideModelSeat, 'fishball: hide composer model seat')
      ctx.inject(['conversation'], (scope) => {
        scope.effect(() => requireModel(scope.conversation, t), 'fishball: require dedicated model')
      })
      ctx.effect(() => followMessenger(ctx), 'fishball: messenger look')
      const BrandName = makeBrandName(ctx, t)
      ctx.effect(() => ctx.slots.inject(SLOT.mark, () => ctx.slots.inject(SLOT.name, function* () {
        yield ctx.slots.register({ name: SLOT.mark, priority: BRAND_PRIORITY }, makeMark(t))
        yield ctx.slots.register({ name: SLOT.name, priority: BRAND_PRIORITY }, BrandName)
      })), 'fishball: brand')
      const HeaderAction = makeHeaderAction(ctx, t)
      ctx.effect(() => ctx.slots.inject(SLOT.headerActions, function* () {
        yield ctx.slots.register({ name: SLOT.headerActions, id: HEADER_ACTION_ID, order: HEADER_ACTION_ORDER, locale: NS }, HeaderAction)
        yield ctx.slots.register({ name: SLOT.headerActions, id: READ_HEADER.id, order: READ_HEADER.order, locale: NS }, FishballReadReporter)
        yield ctx.slots.register({ name: SLOT.headerActions, id: SEND_HEADER_ID, order: SEND_HEADER_ORDER, locale: NS }, makeSendHeaderAction(t))
        yield ctx.slots.register({ name: SLOT.headerActions, id: WATCH_HEADER.id, order: WATCH_HEADER.order, locale: NS }, makeWatchHeaderAction(t))
        yield ctx.slots.register({ name: SLOT.headerActions, id: MANAGE_HEADER.id, order: MANAGE_HEADER.order, locale: NS }, makeManageHeaderAction(t))
      }), 'fishball: header actions')
      ctx.effect(() => ctx.slots.inject(SLOT.sessionMenu, function* () {
        yield ctx.slots.register({ name: SLOT.sessionMenu, id: SEND_MENU.id, order: SEND_MENU.order, locale: NS }, makeSendMenuItem(t))
        yield ctx.slots.register({ name: SLOT.sessionMenu, id: WATCH_MENU.id, order: WATCH_MENU.order, locale: NS }, makeWatchMenuItem(t))
        yield ctx.slots.register({ name: SLOT.sessionMenu, id: MANAGE_MENU.id, order: MANAGE_MENU.order, locale: NS }, makeManageMenuItem(t))
      }), 'fishball: session menu')
      ctx.effect(() => ctx.slots.inject(SLOT.overlay, function* () {
        yield ctx.slots.register({ name: SLOT.overlay, id: SEND_MENU.id, locale: NS }, makeSendDialog(t))
        yield ctx.slots.register({ name: SLOT.overlay, id: WATCH_MENU.id, locale: NS }, makeRequestNotice(t, watchNotice, 'watchSession'))
        yield ctx.slots.register({ name: SLOT.overlay, id: MANAGE_MENU.id, locale: NS }, makeRequestNotice(t, manageNotice, 'manageTitle'))
        yield ctx.slots.register({ name: SLOT.overlay, id: ADD_MENU.id, locale: NS }, makeInstallDialog(t, listenToHost))
      }), 'fishball: dialogs')
      // Revision 11 (DESIGN §10e, S37): your pile, the ask_fishball row with your buttons, and the tags in each turn's tail.
      ctx.effect(() => ctx.slots.inject(SLOT.dock, () => ctx.slots.register({ name: SLOT.dock, id: MODEL.gateId, order: MODEL.gateOrder, locale: NS }, makeModelGate(ctx, t))), 'fishball: model setting prompt')
      ctx.effect(() => ctx.slots.inject(SLOT.dock, () => ctx.slots.register({ name: SLOT.dock, id: PILE.id, order: PILE.order, locale: NS }, makePile(t))), 'fishball: pile')
      ctx.effect(() => ctx.slots.inject(SLOT.dock, () => ctx.slots.register({ name: SLOT.dock, id: WELCOME.id, order: WELCOME.order, locale: NS }, makeWelcome(ctx, t))), 'fishball: welcome card')
      ctx.effect(() => ctx.slots.inject(SLOT.dock, () => ctx.slots.register({ name: SLOT.dock, id: MANAGED_BANNER.id, order: MANAGED_BANNER.order, locale: NS }, makeManagedBanner(t))), 'fishball: managed banner')
      ctx.effect(() => ctx.slots.inject(SLOT.rowLeading, () => ctx.slots.register({ name: SLOT.rowLeading, id: MANAGED_ROW.id, locale: NS }, makeManagedRowMark(t))), 'fishball: managed row mark')
      ctx.effect(() => ctx.slots.inject(SLOT.toolview, () => ctx.slots.register({ name: SLOT.toolview, key: ASK_ROW.tool, locale: NS }, makeAskRow(t))), 'fishball: ask_fishball row')
      ctx.effect(() => ctx.slots.inject(SLOT.turnTail, () => ctx.slots.register({ name: SLOT.turnTail, id: TURN_TAGS.id, locale: NS }, makeTurnTags(t))), 'fishball: turn tags')
      // The plugin manager (DESIGN §10d): the Fishball tab, and a tag and a switch on DSH's page for each plugin.
      const manager = makeManager(t, (text) => ctx.locale.resolveText(text))
      ctx.effect(() => ctx.slots.inject(SLOT.addActions, () => ctx.slots.register({ name: SLOT.addActions, id: ADD_MENU.id, locale: NS }, makeAddMenuItem(t))), 'fishball: Add plugin menu item')
      ctx.effect(() => ctx.slots.inject(SLOT.pluginsTab, () => ctx.slots.register({ name: SLOT.pluginsTab, id: MANAGER.tabId, label: () => t('tabTitle'), locale: NS }, manager.FishballTab)), 'fishball: plugin manager tab')
      ctx.effect(() => ctx.slots.inject(SLOT.detailBadge, () => ctx.slots.register({ name: SLOT.detailBadge, id: MANAGER.badgeId, locale: NS }, manager.DetailBadge)), 'fishball: plugin page tag')
      ctx.effect(() => ctx.slots.inject(SLOT.detailActions, () => ctx.slots.register({ name: SLOT.detailActions, id: MANAGER.actionId, locale: NS }, manager.DetailAction)), 'fishball: plugin page switch')
      ctx.effect(() => {
        const section = limitsSection(ctx.configForms.get(ENTRY_ID))
        const Settings = makeSettingsPage(section, makeStatus(ctx, t), makeModelSettings(t), makeProviderSyncSettings(t), makeRecommended(t), makeBrandStyle(t), makeContextWindow(t), makeIntake(t), makeWatches(t), makeApprovals(t), makeSources(t), makePluginsSummary(t), makeHiddenTools(t), t)
        const stopServing = ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject(SLOT.bundleConfig, () => ctx.slots.register({ name: SLOT.bundleConfig, key: PACKAGE_NAME, locale: NS }, Settings)))
        return () => { stopServing(); section.dispose() }
      }, 'fishball: settings page')
    }
    return module.exports
  },
})