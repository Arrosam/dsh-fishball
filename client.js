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
    const { BrandWordmark, Button, FISH_LOGO_PATH, FISH_LOGO_VIEWBOX, IconChevronLeftOutlineRegular, IconLoadingOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular, Input, MenuItemButton, Modal, PluginArtworkDefault, PluginArtworkSearch, PluginArtworkTerminal, SettingsForm, SettingsFormModel, SettingsSecretField, SettingsValueField, Switch, Tag, settingsNumberField } = require('@deepseek-ai/dsh-client-ui-primitives')
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
    const API = Object.freeze({ events: 'api/fishball/events', recovery: 'api/fishball/recovery', plugins: 'api/fishball/plugins', pluginsRemove: 'api/fishball/plugins/remove', toolApprovals: 'api/fishball/tool-approvals/remove', contextWindow: 'api/fishball/context-window', send: 'api/fishball/send', watches: 'api/fishball/watches', watchesRemove: 'api/fishball/watches/remove', read: 'api/fishball/read', brand: 'api/fishball/brand', messengerClient: 'api/fishball/messenger/client.js', pluginsDetail: 'api/fishball/plugins/detail', pluginsIcon: 'api/fishball/plugins/icon', pluginsSettings: 'api/fishball/plugins/settings', pluginsRefresh: 'api/fishball/plugins/refresh', installInspect: 'api/fishball/install/inspect', install: 'api/fishball/install', installCancel: 'api/fishball/install/cancel' })
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
    /** The two context-window settings (src/constants.js API.contextWindow body). */
    const CONTEXT_FIELDS = Object.freeze(['contextWindowTokens', 'maxOutputTokens'])
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
    const INSTALL_FROM = Object.freeze({ tab: 'tab', menu: 'menu' })
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
    })
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
    const LIMIT_FIELDS = Object.freeze(['maxQueuedInputs', 'maxActiveWatches', 'maxSourcesPerPlugin', 'maxFishballOnlyPlugins', 'wakeupsPerHour', 'messagesPerHour', 'sessionsPerHour', 'maxPendingApprovals', 'approvalAnswerSeconds', 'argumentExcerptBytes', 'maxMessageBytes', 'auditEntriesKept', 'requestUserMessageBytes', 'rationaleChars', 'approvalsShown', 'intakeRowsShown', 'outboxShown', 'watchesShown', 'readSessionMessages', 'readSessionBytes', 'forwardExcerptBytes', 'pluginHistoryShown', 'settingsPromptValueBytes', 'replyCapShare', 'headroomShare', 'minWindowTokens', 'pluginManagerStartMs', 'defaultReplyCapTokens'])
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
     * The word logo from the fishball repo. The repo ships no image for it: it is the string
     * `wordmark` ("FISHBALL", strings.xml) set in the display face at weight 900 with -0.5px
     * tracking (docs/preview/designs.html `.brand .wm`, Theme.kt displaySmall). The face is
     * the repo's stack and is not downloaded here, so a machine without Archivo falls back to
     * the next family, as the app's own dummy does.
     */
    const WORDMARK = Object.freeze({
      fontFamily: '"Archivo","Helvetica Neue",sans-serif',
      fontWeight: 900,
      letterSpacing: '-0.5px',
      lineHeight: 1,
      /** Lifts the word so the tag below can cover its bottom edge without hiding the letters. */
      lift: '-2px',
    })
    /**
     * The "Deepseek Harness" tag: a tilted sticker overlapping the word logo's bottom-right corner
     * (design 8 of the owner's pick), with a hard magenta drop shadow. A negative `right` pushes it
     * past the word's right edge so its left end no longer covers the mark; the brand button has
     * free room to the right of the word (it grows to the sidebar toggle), so nothing is cut off. It covers the foot of the
     * last letters on purpose: the small plain text it replaced could not be read at sidebar size.
     * The tilt pivots on the bottom-right corner, so the left end swings down below the word.
     * The shell clips the brand name to a 24px-high box (dsh-client-ui-sidebar `.brand`), which
     * cut that end off, so releaseClip() opens the box while the brand is shown. Squeezing the
     * sticker inside the box instead (pivot on the left, or a smaller tilt) covered nearly the
     * whole word, which is worse. The fill and text swap the sidebar's own label colours so the
     * sticker reads on light and dark themes; the ring is the sidebar ground and separates the
     * sticker from the letters it covers; the shadow is the mark's eye magenta
     * (FISH_MARK.eyeColor), the one colour the brand spends.
     */
    const BRAND_TAG = Object.freeze({
      fontSize: '9px', lineHeight: '11px', fontWeight: 800, paddingX: '4px', radius: '1px',
      right: '-16px', bottom: '-2px', rotate: '-5deg', origin: 'right bottom',
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
      fontSize: '10px', fontWeight: 800, top: '-7px', right: '-9px',
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
    const CLS = Object.freeze({ field: 'fb-field', note: 'fb-note', entries: 'fb-entries', section: 'fb-section', row: 'fb-row', label: 'fb-label', code: 'fb-code', list: 'fb-list', name: 'fb-name', tag: 'fb-tag', mark: 'fb-mark', markBox: 'fb-mark-box', swim: 'fb-swim', badge: 'fb-badge', wag: 'fb-wag', grow: 'fb-grow', muted: 'fb-muted' })

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
      approvalsHint: 'Other sessions\' permission requests go to Fishball first. It approves only low-risk requests within an allowance you gave it in its chat, and hands the rest to you in that session.',
      approvalsWaiting: 'Waiting for Fishball',
      'approvalAnswer.allow': 'Approved by Fishball',
      'approvalAnswer.escalate': 'Sent to you',
      'approvalAnswer.timeout': 'No answer in time; sent to you',
      'approvalAnswer.withdrawn': 'Withdrawn',
      'approvalOutcome.allowed-once': 'allowed once',
      'approvalOutcome.rejected': 'rejected',
      'approvalOutcome.cancelled': 'cancelled',
      'approvalOutcome.unavailable': 'no answer',
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
      'field.maxPendingApprovals': 'Permission requests Fishball decides at once',
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
      approvalsHint: '其他会话的权限请求会先交给 Fishball。它只会在你于对话中给出的授权范围内批准低风险请求，其余的交给你在该会话中决定。',
      approvalsWaiting: '等待 Fishball 处理',
      'approvalAnswer.allow': 'Fishball 已批准',
      'approvalAnswer.escalate': '已转交给你',
      'approvalAnswer.timeout': '超时未答复，已转交给你',
      'approvalAnswer.withdrawn': '已撤回',
      'approvalOutcome.allowed-once': '允许一次',
      'approvalOutcome.rejected': '已拒绝',
      'approvalOutcome.cancelled': '已取消',
      'approvalOutcome.unavailable': '无人答复',
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
      'field.maxPendingApprovals': 'Fishball 同时处理的权限请求',
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
      `.${CLS.badge}{position:absolute;top:${UNREAD_BADGE.top};right:${UNREAD_BADGE.right};box-sizing:border-box;min-width:${UNREAD_BADGE.minWidth};height:${UNREAD_BADGE.height};padding:0 ${UNREAD_BADGE.paddingX};border-radius:${UNREAD_BADGE.radius};background:${UNREAD_BADGE.fill};color:${UNREAD_BADGE.textColor};box-shadow:${UNREAD_BADGE.ring};font:${UNREAD_BADGE.fontWeight} ${UNREAD_BADGE.fontSize}/${UNREAD_BADGE.height} sans-serif;text-align:center;white-space:nowrap;pointer-events:none;animation:${UNREAD_BADGE.popAnimation} ${UNREAD_BADGE.cycleSeconds}s ease-in-out infinite}`,
      `.${CLS.wag}{transform-origin:${UNREAD_BADGE.wagOrigin};animation:${UNREAD_BADGE.wagAnimation} ${UNREAD_BADGE.cycleSeconds}s ease-in-out infinite}`,
      `@keyframes ${UNREAD_BADGE.wagAnimation}{${UNREAD_BADGE.wag.map(([at, degrees]) => `${at}%{transform:rotate(${degrees}deg)}`).join('')}}`,
      `@keyframes ${UNREAD_BADGE.popAnimation}{${UNREAD_BADGE.pop.map(([at, scale]) => `${at}%{transform:scale(${scale})}`).join('')}}`,
      `.${CLS.swim}{transform-origin:${ORCA_SWIM.origin};overflow:visible;animation:fb-swim ${UNREAD_BADGE.cycleSeconds}s ease-in-out infinite}`,
      `@keyframes fb-swim{${[...ORCA_SWIM.sway.map(([at, transform]) => [at * SWIM_SHARE, transform]), [100, 'none']].map(([at, transform]) => `${at}%{transform:${transform}}`).join('')}}`,
      // Motion is the only thing that stops: the pill and its count stay.
      `@media (prefers-reduced-motion:reduce){.${CLS.badge},.${CLS.wag},.${CLS.swim}{animation:none}}`,
      `.${CLS.row}{display:flex;gap:12px;align-items:baseline}`,
      `.${CLS.label}{min-width:120px;color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.code}{font-family:var(--ds-font-family-code);overflow-wrap:anywhere}`,
      `.${CLS.list}{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}`,
      `.${CLS.list} li{padding:2px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-family:var(--ds-font-family-code)}`,
      `.${CLS.name}{position:relative;display:inline-block;font-family:${WORDMARK.fontFamily};font-weight:${WORDMARK.fontWeight};letter-spacing:${WORDMARK.letterSpacing};line-height:${WORDMARK.lineHeight};top:${WORDMARK.lift}}`,
      // Overlaid on the corner, so it takes no layout space and cannot push the sidebar controls.
      `.${CLS.tag}{position:absolute;right:${BRAND_TAG.right};bottom:${BRAND_TAG.bottom};padding:0 ${BRAND_TAG.paddingX};border-radius:${BRAND_TAG.radius};background:${BRAND_TAG.fill};color:${BRAND_TAG.textColor};font:${BRAND_TAG.fontWeight} ${BRAND_TAG.fontSize}/${BRAND_TAG.lineHeight} sans-serif;transform:rotate(${BRAND_TAG.rotate});transform-origin:${BRAND_TAG.origin};box-shadow:${BRAND_TAG.ring},${BRAND_TAG.shadow};white-space:nowrap;pointer-events:none}`,
      `.${CLS.grow}{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}`,
      `.${CLS.muted}{color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.field}{display:flex;flex-direction:column;gap:6px;margin-top:8px}`,
      // DSH's input colours (dsh-client-ui-primitives SettingsValueField): --dsw-alias-border-primary is not defined in dialogs.
      `.${CLS.note}{width:100%;box-sizing:border-box;padding:8px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;resize:vertical}`,
      `.${CLS.entries}{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}`,
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
      let source
      const open = () => {
        if (source) return
        source = new EventSource(apiUrl(API.events))
        source.onmessage = (event) => {
          try { snapshot = JSON.parse(event.data) } catch { return }
          for (const listener of listeners) listener()
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

    function makeMark(t) {
      return function Mark({ size }) {
        const state = useFishball()
        const count = unreadCount(state)
        const Icon = BRAND_ICON[brandStyleOf(state)] ?? FishballIcon
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
          const previous = button.getAttribute('aria-label')
          button.setAttribute('aria-label', count > 0 ? t('brandLabelUnread', { count }) : t('brandLabel'))
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
            button.removeEventListener('click', onClick, true)
            if (previous === null) button.removeAttribute('aria-label')
            else button.setAttribute('aria-label', previous)
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
     * Install for Fishball (DESIGN §10d revision 10a): one request store shared by the item in
     * DSH's Add plugin menu and the Fishball tab's button. The dialog lives in the shell overlay,
     * so it outlives the menu that opened it (as "Send to Fishball" does).
     */
    const installRequest = (() => {
      const store = valueStore(null)
      let count = 0
      return { ...store, open: (from) => store.set({ from, id: ++count }), close: () => store.set(null) }
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
        return h(InstallFlow, { key: request.id, from: request.from, t, listen })
      }
    }

    /**
     * One install, following DSH's own dialog: the spec, DSH's check of what it names, a
     * confirmation, progress with DSH's install output and Cancel, then the result. DSH's dialog
     * is not exported (S31), so its screens are rebuilt from DSH's components; the process behind
     * them is DSH's own, inherited for Fishball's folder. Your click on Install approves it.
     */
    function InstallFlow({ from, t, listen }) {
      const id = React.useId()
      const [step, setStep] = React.useState(INSTALL_STEP.edit)
      const [spec, setSpec] = React.useState('')
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
    const canSend = (state, sessionId) => state.status === STATUS.live && Boolean(sessionId) && sessionId !== state.sessionId
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
     * Watch requests and their refusal, in one store outside the menu: a menu entry unmounts when
     * the menu closes, so the refusal is shown by the overlay (makeWatchNotice), not by the entry.
     */
    const watchNotice = (() => {
      let current = null
      const listeners = new Set()
      const set = (next) => { current = next; for (const listener of listeners) listener() }
      return {
        async watch(sessionId) {
          const { ok, code } = await send(API.watches, { sessionId })
          set(ok ? null : WATCH_ERRORS.has(code) ? 'watchError.' + code : 'watchFailed')
        },
        dismiss: () => set(null),
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        get: () => current,
      }
    })()

    function makeWatchMenuItem(t) {
      return function FishballWatchMenuItem({ sessionId, useMenuOpenState }) {
        const state = useFishball()
        const [, setMenuOpen] = useMenuOpenState()
        if (!canWatch(state, sessionId)) return null
        // Already watched: the entry says so; choosing it again returns the same watch.
        const watched = isWatched(state, sessionId)
        return h(MenuItemButton, { onSelect: () => { setMenuOpen(false); void watchNotice.watch(sessionId) } }, watched ? t('watching') : t('watchSession'))
      }
    }

    function makeWatchHeaderAction(t) {
      return function FishballWatchHeaderAction({ sessionId }) {
        const state = useFishball()
        if (!canWatch(state, sessionId)) return null
        const watched = isWatched(state, sessionId)
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: watched, onClick: () => void watchNotice.watch(sessionId) }, watched ? t('watching') : t('watchSession'))
      }
    }

    /** The refusal of the last watch request, as a dialog in the shell overlay. */
    function makeWatchNotice(t) {
      return function FishballWatchNotice() {
        const problem = React.useSyncExternalStore(watchNotice.subscribe, watchNotice.get)
        if (problem === null) return null
        return h(Modal, {
          open: true,
          onClose: watchNotice.dismiss,
          closeLabel: t('close'),
          title: t('watchSession'),
          footer: h(Button, { type: 'button', variant: 'primary', onClick: watchNotice.dismiss }, t('close')),
        }, h('div', { role: 'alert' }, t(problem)))
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
          view.pending.length > 0 ? h('ul', { className: CLS.entries }, view.pending.map((p) => h('li', { key: p.id },
            h(Tag, { tone: 'info' }, t('approvalsWaiting')), ' ', h('span', { className: CLS.code }, p.toolName), ' ', h('span', { className: CLS.muted }, p.sessionId)))) : null,
          view.recent.length === 0 ? h('p', null, t('nothingYet')) : h('ul', { className: CLS.entries }, view.recent.map((entry) => h('li', { key: entry.key },
            h(Tag, { tone: entry.answer === 'allow' ? 'danger' : 'neutral' }, t('approvalAnswer.' + entry.answer)), ' ',
            h('span', { className: CLS.code }, entry.toolName), ' ',
            h('span', { className: CLS.muted }, entry.sessionId), ' ',
            h('span', { className: CLS.muted }, t('approvalOutcome.' + entry.finalOutcome)), ' ',
            entry.rationale ? h('span', null, entry.rationale) : null))))
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
    function makeSettingsPage(section, Status, BrandStyle, ContextWindow, Intake, Watches, Approvals, Sources, Plugins, HiddenTools, t) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballSettings(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        const baseId = React.useId()
        if (props.view === SUMMARY_VIEW) return null
        const disabled = !state.writable || state.saving
        return h(React.Fragment, null,
          h(Status),
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
      }), 'fishball: header actions')
      ctx.effect(() => ctx.slots.inject(SLOT.sessionMenu, function* () {
        yield ctx.slots.register({ name: SLOT.sessionMenu, id: SEND_MENU.id, order: SEND_MENU.order, locale: NS }, makeSendMenuItem(t))
        yield ctx.slots.register({ name: SLOT.sessionMenu, id: WATCH_MENU.id, order: WATCH_MENU.order, locale: NS }, makeWatchMenuItem(t))
      }), 'fishball: session menu')
      ctx.effect(() => ctx.slots.inject(SLOT.overlay, function* () {
        yield ctx.slots.register({ name: SLOT.overlay, id: SEND_MENU.id, locale: NS }, makeSendDialog(t))
        yield ctx.slots.register({ name: SLOT.overlay, id: WATCH_MENU.id, locale: NS }, makeWatchNotice(t))
        yield ctx.slots.register({ name: SLOT.overlay, id: ADD_MENU.id, locale: NS }, makeInstallDialog(t, listenToHost))
      }), 'fishball: dialogs')
      // The plugin manager (DESIGN §10d): the Fishball tab, and a tag and a switch on DSH's page for each plugin.
      const manager = makeManager(t, (text) => ctx.locale.resolveText(text))
      ctx.effect(() => ctx.slots.inject(SLOT.addActions, () => ctx.slots.register({ name: SLOT.addActions, id: ADD_MENU.id, locale: NS }, makeAddMenuItem(t))), 'fishball: Add plugin menu item')
      ctx.effect(() => ctx.slots.inject(SLOT.pluginsTab, () => ctx.slots.register({ name: SLOT.pluginsTab, id: MANAGER.tabId, label: () => t('tabTitle'), locale: NS }, manager.FishballTab)), 'fishball: plugin manager tab')
      ctx.effect(() => ctx.slots.inject(SLOT.detailBadge, () => ctx.slots.register({ name: SLOT.detailBadge, id: MANAGER.badgeId, locale: NS }, manager.DetailBadge)), 'fishball: plugin page tag')
      ctx.effect(() => ctx.slots.inject(SLOT.detailActions, () => ctx.slots.register({ name: SLOT.detailActions, id: MANAGER.actionId, locale: NS }, manager.DetailAction)), 'fishball: plugin page switch')
      ctx.effect(() => {
        const section = limitsSection(ctx.configForms.get(ENTRY_ID))
        const Settings = makeSettingsPage(section, makeStatus(ctx, t), makeBrandStyle(t), makeContextWindow(t), makeIntake(t), makeWatches(t), makeApprovals(t), makeSources(t), makePluginsSummary(t), makeHiddenTools(t), t)
        const stopServing = ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject(SLOT.bundleConfig, () => ctx.slots.register({ name: SLOT.bundleConfig, key: PACKAGE_NAME, locale: NS }, Settings)))
        return () => { stopServing(); section.dispose() }
      }, 'fishball: settings page')
    }
    return module.exports
  },
})