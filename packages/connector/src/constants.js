/**
 * Fixed values owned by Fishball. Runtime-tunable safety limits are NOT here: they are
 * the row's config (src/config.js), which the user edits on the Plugins page.
 */
// PILE_NOTE stays imported from this module for every existing caller. It is shared wording of
// the contract (`./contract`), because the instance's persona reads the same text (M1).
export { PILE_NOTE } from '../contract/pile-note.js'

/** Package identity and log channel. The row id is the plugin's name (design §0.2, D22). */
export const PLUGIN = Object.freeze({
  name: 'fishball-connector',
  logger: 'fishball',
})

/**
 * The main side's name for the isolated Fishball (slim §5.2). Fishball runs in the child, so the
 * main DSH holds no session of its own: this one fixed id is what the bridge's relays name as the
 * sender (src/slim/host/session-port.js) and what every "is this Fishball?" check compares with.
 * It never names a main-DSH session, so no main session can be mistaken for Fishball's.
 */
export const FISHBALL = Object.freeze({ sessionId: 'fishball-isolated' })

/** Lifecycle states published to the page: the main row is either up or its store failed. */
export const STATUS = Object.freeze({
  live: 'live',
  /** The store could not be opened; DSH must restart. */
  failed: 'failed',
})

/** Stable error codes; message text never reaches logs or the browser. */
export const ERROR = Object.freeze({ storeUnreadable: 'store-unreadable' })

/** Actions a catalog plugin offers; which ones depends on its status (src/plugin-catalog.js). */
export const PLUGIN_OFFER = Object.freeze({ enable: 'enable', disable: 'disable', uninstall: 'uninstall' })

/** Why installing or removing a Fishball-installed package failed (add_plugin's `reason`). */
export const PACKAGE_ERROR = Object.freeze({
  invalidSpec: 'invalid-spec',
  alreadyInstalled: 'already-installed',
  notBundle: 'not-bundle',
  ambiguousInstall: 'ambiguous-install',
  incompatibleVersion: 'incompatible-version',
  operationError: 'operation-error',
  noProfile: 'no-profile',
  /** You cancelled the install in the dialog (DSH's install process, revision 10a). */
  cancelled: 'cancelled',
  /** pnpm held back install scripts that need your approval (DSH's pendingBuilds). */
  buildBlocked: 'build-blocked',
  /** The spec is longer than maxMessageBytes (the bound the page's spec always had). */
  tooLarge: 'too-large',
})

/** Who last changed a plugin's Fishball state. */
export const CHANGED_BY = Object.freeze({ fishball: 'fishball', user: 'user' })

/** Why a tool is not shown to Fishball, or that it is (list_plugins, settings). */
export const TOOL_STATUS = Object.freeze({
  visible: 'visible',
  hidden: 'hidden',
  pluginOff: 'plugin-off',
  unchecked: 'unchecked',
  /** Fishball's own tool for other sessions (message_fishball): never visible to Fishball (revision 10c). */
  otherSessions: 'other-sessions',
})

/**
 * Off answer of a route or tool whose Fishball plugin is off (revision 10c): Send to Fishball,
 * Tell Fishball when finished, notify_when_finished.
 */
export const FEATURE_OFF = 'feature-off'
/** A session no longer managed by Fishball (revision 11): message_fishball in flight, release_session. */
export const NOT_MANAGED = 'not-managed'

/** Stable plugin diagnostics (catalog `lastError`, tool results); never message text. */
export const PLUGIN_ERROR = Object.freeze({
  unknownPlugin: 'unknown-plugin',
  limitReached: 'limit-reached',
  editsOtherRows: 'edits-other-rows',
  noRows: 'no-rows',
  rowIdConflict: 'row-id-conflict',
  rowFailed: 'row-failed',
  leaksService: 'leaks-service',
  noProfile: 'no-profile',
  rejected: 'rejected',
  /** Fishball must ask before turning one of its own plugins on (revision 10c): it went off while Fishball was deciding. */
  askFirst: 'ask-first',
  installFailed: 'install-failed',
  restartRequired: 'restart-required',
  /** Only a Fishball-installed plugin can be uninstalled; DSH plugins and built-ins cannot. */
  notRemovable: 'not-removable',
  /** The plugin is being uninstalled; it offers no other action until that is done. */
  removing: 'removing',
  /** Uninstalling a Fishball-installed plugin failed; it stays installed and off. */
  removeFailed: 'remove-failed',
  /** Settings (DESIGN §10d): the plugin is on in DSH, so its settings are DSH's. */
  sharedWithDsh: 'shared-with-dsh',
  /** Settings: the plugin has no row of that id. */
  unknownRow: 'unknown-row',
  /** Settings: the row has no schema, or is the Compaction engine row (set by the context window). */
  noSettings: 'no-settings',
  /** Settings: Fishball may not see or set a secret field; only you do (Q-manager-secrets). */
  secretField: 'secret-field',
  /** Settings: the new complete config fails the row's schema. */
  invalidSettings: 'invalid',
  /** Settings: every value equals the current one. */
  noChange: 'no-change',
})

/**
 * Where a catalog plugin stands in DSH (snapshot `dsh`, DESIGN §10d): on for every session,
 * installed but off, a DSH capability package Fishball mounts itself, or not in DSH at all.
 */
export const PLUGIN_DSH = Object.freeze({ on: 'on', off: 'off', builtin: 'builtin', none: 'none',
  /** One of Fishball's own plugins (revision 10c): part of dsh-fishball itself, listed in the Fishball group. */
  fishball: 'fishball' })

/** Fishball's explicit model choice; never initialized from a session or the DSH default. */
export const MODEL_SELECTION = Object.freeze({ settingsKey: 'model', minIdLength: 1, routeSeparator: '/' })

/** Why a context-window value is refused, or why a stored one cannot apply now. */
export const CONTEXT_ERROR = Object.freeze({
  /** The window cannot hold the reply cap, headroom, retained tail and prompt-plus-tools. */
  windowTooSmall: 'window-too-small',
  /** The reply-length cap does not fit inside the window. */
  outputTooLarge: 'output-too-large',
  /** The model reports no window, so a smaller one cannot be derived from it. */
  modelWindowUnknown: 'model-window-unknown',
})

/** Storage domain names and versions (fail closed on mismatch). */
export const DOMAIN = Object.freeze({ main: 'fishball', version: 1, intake: 'fishball_intake' })

/** Lifecycle of one intake item (DESIGN §5b, §9 fishball_intake.items). */
export const INTAKE_STATUS = Object.freeze({
  /** Recorded durably, not yet in Fishball's inbox. */
  pending: 'pending',
  /** In the inbox and flushed to the session log. */
  accepted: 'accepted',
  /** Fishball's turn took it. */
  consumed: 'consumed',
  /** DSH discarded it from the inbox (a cancel cleared it). */
  discarded: 'discarded',
  /** Could not be delivered; errorCode says why. */
  failed: 'failed',
})

/** Who an intake item came from (the part of its source identity the host works out). */
export const INTAKE_KIND = Object.freeze({
  /** message_fishball from another session's agent. */
  session: 'session',
  /** "Send to Fishball" in the GUI: you forward a session with a note. */
  user: 'user',
  /** A Fishball notice from Fishball itself (e.g. plugins already on with unchecked tools). */
  system: 'system',
  /** A watched session finished (DESIGN §5c). */
  watch: 'watch',
  /** Another session's permission request (DESIGN §7a); never wake-capped (§16). */
  approval: 'approval',
  /** An event from a plugin source (ctx.fishball, DESIGN §8). */
  plugin: 'plugin',
})

/** Stable codes an intake call answers with (never message text). */
export const INTAKE_ERROR = Object.freeze({
  queueFull: 'queue-full',
  tooLarge: 'too-large',
  empty: 'empty',
  fromFishball: 'from-fishball',
  unknownSession: 'unknown-session',
  deliveryFailed: 'delivery-failed',
  featureOff: FEATURE_OFF,
  /** message_fishball from a session no longer managed (taken back while the call was in flight; DESIGN §5b). */
  notManaged: NOT_MANAGED,
})

/** Managed sessions (revision 11, DESIGN §5e, §9 managed registry). */
export const MANAGED = Object.freeze({
  /** Source identity prefix of the notes to Fishball about a change (DESIGN §5e "Notes to Fishball"). */
  sourcePrefix: 'fishball/managed/',
})
/** How a session became managed (§9 `by`); 'prompt-answer': Fishball answered a prompt in it (answer_prompt, rev11e). */
export const MANAGED_BY = Object.freeze({ start: 'start', message: 'message', promptAnswer: 'prompt-answer', handOver: 'hand-over', send: 'send' })
/** What changed, and who did it, in a note to Fishball. */
export const MANAGED_CHANGE = Object.freeze({ handOver: 'hand-over', takeBack: 'take-back', release: 'release' })
/** Stable codes Hand over / Take back and release_session answer with (DESIGN §10e Host API). */
export const MANAGED_ERROR = Object.freeze({
  unknownSession: 'unknown-session',
  isFishball: 'is-fishball',
  notManaged: NOT_MANAGED,
  featureOff: FEATURE_OFF,
})
/**
 * Fishball's decisions audit (§9 `decisions`): rev11a records release; rev11b adds your own
 * Allow once / Reject clicks on a stock prompt for a request that went through Fishball; rev11d
 * adds Fishball's grants and the revokes, yours and Fishball's; rev11e adds Fishball's answer_prompt;
 * rev11f adds Fishball's withdraw_request on its own card (your clicks on its cards use allow-once / reject).
 * rev11g adds answer-question: Fishball's answer to a question or plan review, or yours on its card.
 * rev11h adds Fishball's stop_session and redirect_session.
 */
export const DECISION_ACTION = Object.freeze({ release: 'release', allowOnce: 'allow-once', reject: 'reject', grant: 'grant', revoke: 'revoke', answerPrompt: 'answer-prompt', withdraw: 'withdraw', answerQuestion: 'answer-question', stop: 'stop', redirect: 'redirect' })
export const DECISION_OK = 'ok'

/** Watches (DESIGN §5c, §9 watches). */
export const WATCH_CONDITION = Object.freeze({ finished: 'finished', perTurn: 'per-turn' })
export const WATCH_MODE = Object.freeze({ once: 'once', repeat: 'repeat' })
export const WATCH_STATUS = Object.freeze({ active: 'active', closed: 'closed', targetMissing: 'target-missing' })
/** Who set a watch up: you (GUI), Fishball (watch_session), or another agent (message_fishball). */
export const WATCH_BY = Object.freeze({ user: 'user', assistant: 'assistant', agent: 'agent' })
/** Turn-end reasons that never count as finished (crash closers and fork seeds). */
export const WATCH_IGNORED_REASONS = Object.freeze(['interrupted', 'forked'])
export const WATCH_ERROR = Object.freeze({
  unknownSession: 'unknown-session',
  archived: 'archived',
  isFishball: 'is-fishball',
  limitReached: 'limit-reached',
  unknownWatch: 'unknown-watch',
  notRelated: 'not-related',
  featureOff: FEATURE_OFF,
})
export const WATCH = Object.freeze({
  turnEndEvent: 'turn/end',
  sourcePrefix: 'fishball/watch/',
})

/** ctx.fishball, the extension service (DESIGN §8). */
export const SOURCES = Object.freeze({
  /** The service name plugins inject. */
  service: 'fishball',
  /** A source id: letters, digits, '-', '_' and '.', 1-64 characters. */
  idPattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  /** Bytes of a dedupe key and of a source description. */
  dedupeKeyBytes: 256,
  descriptionBytes: 1024,
  /** Bytes of a source title (shown in notices). */
  sourceTitleBytes: 200,
  separator: '/',
})

/** Permission requests from other sessions (DESIGN §7a). */
export const APPROVAL = Object.freeze({
  /** Request id prefix Fishball sees (apr_<id>). */
  idPrefix: 'apr_',
  /** setTimeout's limit (2^31-1 ms): a longer answer time is clamped to it. */
  maxTimerMs: 2147483647,
  waterfall: 'approval/request',
  assistantEvent: 'assistant/message',
  ptcDispatchEvent: 'tool/ptc-dispatch-start',
  toolCallBlock: 'tool-call',
  /** The log event of one model tool call; its seq places a tag in its turn (S37). */
  toolCallEvent: 'tool/call',
  turnStartEvent: 'turn/start',
  /** A turn ended: the session's passes, to-you tickets, wording marks and open threads end (§7a.3, §9). */
  turnEndEvent: 'turn/end',
  userEvent: 'user/message',
  userSources: Object.freeze(['user', 'user-rpc']),
})
/** Fishball's answer (answer_approval, DESIGN §7a.3). */
export const APPROVAL_DECISION = Object.freeze({ allow: 'allow', grant: 'grant', reject: 'reject', ask: 'ask', escalate: 'escalate' })
/**
 * How a request ended, as audited (§9). released: the session left management while the
 * request waited (§5e). to-user: a call that went to your prompt through a to-you ticket.
 * pass: a call a one-time pass covered (no Fishball step). ask: the thread ended on Fishball's
 * question (the turn ended before the session replied). grant: Fishball answered with a standing
 * grant (the call itself runs as on allow). grant-used: a call a standing grant covered (no Fishball step).
 * answer (rev11g): Fishball answered a question or plan review (a question's row, kind question).
 */
export const APPROVAL_ANSWER = Object.freeze({ allow: 'allow', grant: 'grant', reject: 'reject', ask: 'ask', escalate: 'escalate', timeout: 'timeout', withdrawn: 'withdrawn', released: 'released', toUser: 'to-user', pass: 'pass', grantUsed: 'grant-used', answer: 'answer' })
/**
 * Whether the session asked first (ask_fishball), made the call directly, or Fishball answered its
 * showing prompt (answer_prompt, rev11e) (§9 audit `kind`); or the request is Fishball's own
 * (rev11f, §7a.11): its card in your pile has this kind too. question (rev11g): a managed session's
 * question or plan review (§7a.10), audited with the question's own ends (QUESTION_END).
 */
export const REQUEST_KIND = Object.freeze({ asked: 'asked', direct: 'direct', prompt: 'prompt', own: 'own', question: 'question' })
/** What a pass-table entry lets through (§7a.3 passes, §7a.6 to-you tickets). */
export const PASS_KIND = Object.freeze({ pass: 'pass', toYou: 'to-you' })
/** Who wrote one entry of a request's thread (§9 request threads). */
export const THREAD_FROM = Object.freeze({ agent: 'agent', fishball: 'fishball' })
/**
 * ask_fishball's answers (DESIGN §7a.2). When Fishball escalates, does not answer in time or
 * cannot be told, the request becomes your card and the agent keeps waiting for your answer
 * (rev11c, §7a.6), so there is no answer code for it.
 */
export const ASK_RESULT = Object.freeze({
  allowed: 'allowed',
  rejected: 'rejected',
  question: 'question',
  unavailable: 'unavailable',
  overCapacity: 'over-capacity',
  noLongerManaged: 'no-longer-managed',
})
/** ask_fishball refusals: nothing reached Fishball. */
export const ASK_ERROR = Object.freeze({
  notUserMessage: 'not-user-message',
  tooLarge: 'too-large',
  expired: 'expired',
  invalid: 'invalid-request',
  empty: 'empty',
  cancelled: 'cancelled',
})
export const APPROVAL_RISK = Object.freeze({ low: 'low', high: 'high' })
/** Your answer on a card in the pile or on the running ask_fishball row (§7a.6, §10e). */
export const CARD_DECISION = Object.freeze({ allow: 'allow', reject: 'reject' })
/**
 * How a card left the pile: your answer, Fishball going off, the session leaving management, its
 * call cancelled, its turn ended, or (a direct call's card, rev11e) the prompt in its session
 * answered first. `restarted` is the end of a card rebuilt from the store at start (T08, src/pile.js):
 * the call it waited on ended with the restart, so it can never be answered in this process.
 * The reason words and the closure line are src/card-lifecycle.js's; a card in
 * the pile has no end time, so none of these is a timer.
 */
export const CARD_END = Object.freeze({
  user: 'user', off: 'off', released: 'released', cancelled: 'cancelled', sessionEnded: 'session-ended',
  dismissed: 'dismissed', back: 'back-to-session', unavailable: 'unavailable', withdrawn: 'withdrawn',
  inSession: 'in-session', restarted: 'restarted',
})
/**
 * Which pile a stored card belongs to (T08, src/pile.js): the three piles a plugin instance runs,
 * the broker's approval cards, the question router's and Fishball's own questions' (T09). A card
 * restored into a pile carries its scope, so no pile reads another's cards.
 */
export const PILE_SCOPE = Object.freeze({ approvals: 'approvals', questions: 'questions', ownQuestions: 'own-questions' })
/**
 * Prompts already showing (DESIGN §7a.9, rev11e): the broker's pass-through registry, listed by
 * list_frozen_sessions and answered by answer_prompt (allow or reject only, §7a.9).
 */
export const PROMPT = Object.freeze({
  /** Prompt id prefix Fishball sees (prm_<id>). */
  idPrefix: 'prm_',
  decisions: Object.freeze([APPROVAL_DECISION.allow, APPROVAL_DECISION.reject]),
})
/**
 * Managed sessions' questions and plan reviews (DESIGN §7a.10, rev11g, spike S36). DSH's own names
 * (dsh-user-questions, dsh-tool-ask-user, dsh-plan-mode) are kept here as data.
 */
export const QUESTION = Object.freeze({
  /** Question id prefix Fishball sees (qst_<id>). */
  idPrefix: 'qst_',
  /** DSH's answerer waterfall; the router is prepended on it, as the broker is on approval/request. */
  waterfall: 'user-questions/request',
  /** The question tool and the plan-review tool (the audit's and the card's tool names). */
  askTool: 'ask_user_question',
  planTool: 'exit_plan_mode',
  /** The plan-review intent's kind (S36). */
  planIntent: 'plan-review',
  /** DSH's projection of timed questions; a `continued` one survives a restart (S36 Q4). */
  projection: 'userQuestions',
  continuedState: 'continued',
  /** The source kind of a late reply to a continued question (the user's in the session, or Fishball's). */
  replySource: 'user-question-reply',
  /** The timed tool's parameter: a request header listing it means the calls that follow are timed. */
  timedParameter: 'timeout',
  /** DSH's error codes (dsh-user-questions). */
  timedOut: 'ASK_TIMED_OUT',
  aborted: 'ASK_ABORTED',
  replyQueued: 'REPLY_QUEUED',
  errorName: 'UserQuestionError',
  /** Resume repair's result for a call a restart interrupted (dsh-session): a timed question stays continued. */
  outcomeUnknown: 'TOOL_OUTCOME_UNKNOWN',
  /** Intake source of the question notice (never wake-capped: kind approval, Reading). */
  sourceIdentity: 'fishball/question',
  requestHeaderEvent: 'request/header',
  toolResultEvent: 'tool/result',
})
/** Who answers a managed session's question (§7a.10 "The mode"); absent means auto. */
export const QUESTION_MODE = Object.freeze({ auto: 'auto', fishball: 'fishball', user: 'user' })
/** The stored mode's record key in `settings` (§9). */
export const QUESTION_MODE_KEY = 'questions'
/** A question card's kind (and the open-question entry's, §9 "Open questions"). */
export const QUESTION_KIND = Object.freeze({ question: 'question', planReview: 'plan-review' })
/** answer_question's and the pile route's refusals (the question stays open). */
export const QUESTION_ERROR = Object.freeze({
  /** Unknown, already answered or closed, or already your card in the pile. */
  expired: 'expired',
  /** User mode: only a note is accepted (§7a.10). */
  modeUser: 'mode-user',
  /** The batch does not fit the question (validated before it reaches DSH). */
  badAnswer: 'bad-answer',
  /** A continued question someone answered first (userQuestions.answer said no, or REPLY_QUEUED). */
  alreadySettled: 'already-settled',
  /** The asking session could not be resumed to take a continued answer. */
  notLive: 'session-not-live',
})
/** How a question ended, as its approvals audit row records (finalOutcome, kind question). */
export const QUESTION_END = Object.freeze({
  fishball: 'answered-by-fishball',
  pile: 'answered-in-pile',
  session: 'answered-in-session',
  /** Stopped, Discuss, or its turn ended. */
  closed: 'closed',
  /** Fishball or Permission requests went off, or the session left management: back to its own card. */
  back: 'back-to-session',
})
/** How complete the arguments Fishball sees are (a cut or missing call counts as high-risk). */
export const ARGUMENTS_STATUS = Object.freeze({ complete: 'complete', truncated: 'truncated', unavailable: 'unavailable' })
/** DSH approval outcomes (dsh-user-approval). */
export const APPROVAL_OUTCOME = Object.freeze({ allowedOnce: 'allowed-once', rejected: 'rejected', cancelled: 'cancelled', unavailable: 'unavailable' })
export const APPROVAL_ERROR = Object.freeze({
  expired: 'expired',
  allowNeedsLowRisk: 'allow-needs-low-risk',
  /** Every decision but escalate names its risk (§7a.3). */
  riskRequired: 'risk-required',
  reasonRequired: 'reason-required',
  argumentsIncomplete: 'arguments-incomplete',
  questionRequired: 'question-required',
  /** answer_prompt takes allow or reject only (§7a.9). */
  invalidDecision: 'invalid-decision',
})

/**
 * Standing grants (DESIGN §7a.8, §9 `grants`, rev11d). No limit on a grant's lifetime or on how
 * many are active (Q-r11-grant-bounds): every grant only needs an end time in the future.
 */
export const GRANT = Object.freeze({
  /** Grant id prefix Fishball sees (grt_<id>). */
  idPrefix: 'grt_',
  /**
   * Shell tools a command-prefix grant may name, each with the argument that holds its command
   * text, read from the tools' schemas (Q-r11-prefix-tools; §7a.8 Reading). terminal_open's
   * schema has no command text (only type, name, cwd), so it gets exact-call grants only, as
   * run_code and every other tool do: matching its type would cover opening every terminal of
   * that type (the manager's decision, 2026-11-02).
   */
  commandArgument: Object.freeze({ bash: 'command', pwsh: 'command', terminal_send: 'text' }),
  /** "npm test*" and "npm test" name the same prefix: one trailing wildcard is notation, not text. */
  wildcard: '*',
})
export const GRANT_KIND = Object.freeze({ exact: 'exact', prefix: 'prefix' })
/** A grant's state (§9): active until its end time, a revoke, or its session leaving management. */
export const GRANT_STATUS = Object.freeze({ active: 'active', expired: 'expired', revoked: 'revoked', ended: 'ended' })
/** What ended a grant (§9 `endedBy`); a grant whose session DSH no longer finds ends with none. */
export const GRANT_END = Object.freeze({ user: 'user', fishball: 'fishball', expiry: 'expiry', takeBack: 'take-back', release: 'release' })
/** answer_approval's grant refusals and revoke_grant's (a refused grant leaves the request pending). */
export const GRANT_ERROR = Object.freeze({
  invalid: 'grant-invalid',
  prefixNotShell: 'prefix-not-shell-tool',
  prefixEmpty: 'prefix-empty',
  prefixNotInCall: 'prefix-not-in-call',
  expiresRequired: 'expires-at-required',
  expiresInvalid: 'expires-at-invalid',
  expiresPast: 'expires-at-past',
  /** revoke_grant without a reason. */
  reasonRequired: 'reason-required',
  unknown: 'unknown',
  ended: 'ended',
})

/**
 * Your display choices (src/preferences.js). The brand icon is Fishball's own mark, or DSH's
 * orca; the default is Fishball's, as before the choice existed.
 */
export const BRAND_STYLE = Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' })
/**
 * How the sidebar opens the Fishball view (slim §7): its own row in DSH's panel list plus the
 * top-left brand button, or the brand button only. The row is the default (owner's choice,
 * 2026-11-06), so Fishball sits in the sidebar like a session; settings can turn the row off.
 */
export const SIDEBAR_ENTRY = Object.freeze({ panel: 'panel', brand: 'brand' })
export const PREFERENCE = Object.freeze({ recordKey: 'display', defaultBrandStyle: BRAND_STYLE.fishball, defaultSidebarEntry: SIDEBAR_ENTRY.panel })

/** Intake ledger parameters (src/intake.js). */
export const INTAKE = Object.freeze({
  /** Joins source identity and dedupe key before hashing them into the row key. */
  keySeparator: '\n',
  /** Delivery attempts before a row is marked failed (each restart or reconcile retries). */
  maxAttempts: 3,
})

/** Outcome of handing one item to the ledger. */
export const INTAKE_OUTCOME = Object.freeze({ accepted: 'accepted', duplicate: 'duplicate' })

/** Message sources Fishball uses (spike S4; DSH's agent-message relay is S16). */
export const SOURCE = Object.freeze({
  relay: Object.freeze({ kind: 'agent-message', form: 'relay' }),
  notice: Object.freeze({ kind: 'fishball-notice', form: 'notice' }),
})

/**
 * The sender each intake message records in its source (`source.author`, DESIGN §10c), read by
 * the Messenger look. The name is the session or source title at arrival.
 */
export const AUTHOR = Object.freeze({
  /** UTF-8 bytes of a name: a plugin source's title is bounded the same, so it always fits whole. */
  nameBytes: SOURCES.sourceTitleBytes,
})

/**
 * Reading another session for a notice (src/session-info.js). The excerpt's bound, which keeps a
 * notice small however long the other session's last answer was, is the forwardExcerptBytes limit.
 */
export const SESSION_INFO = Object.freeze({
  ellipsis: '…',
  assistantEvent: 'assistant/message',
  userEvent: 'user/message',
  /** DSH's title event (dsh-session-title folds the latest one). */
  titleEvent: 'session/title',
  /**
   * Who wrote a message read_session returns (DESIGN §5c): the user typing, that session's
   * agent, Fishball, another session, or context DSH or a plugin added.
   */
  roles: Object.freeze({ user: 'user', assistant: 'assistant', fishball: 'fishball', agent: 'agent', context: 'context' }),
  textBlock: 'text',
  /** Session header marking a subagent's session, and how far up its parents are followed. */
  subagentOrigin: 'subagent',
  maxSubagentDepth: 8,
})

/**
 * Why start_session could not name the session it started (the result's titleError; the
 * session still starts, like a refused watch).
 */
export const TITLE_ERROR = Object.freeze({
  /** No sessionTitle service (dsh-base's session-title row is off). */
  unavailable: 'title-unavailable',
  /** DSH found no visible characters in the title. */
  invalid: 'title-invalid',
  /** Anything else DSH refused (logged). */
  failed: 'title-failed',
})

/**
 * start_session's `workspaceError` (DESIGN §5d): DSH created the session but could not add it
 * to the workspace. The session still starts and shows under Ungrouped, like one started in a
 * folder that is not a workspace.
 */
export const WORKSPACE_ERROR = Object.freeze({
  attachFailed: 'workspace-attach-failed',
  /** DSH's RemoteError code for this case; its details carry the new session's id. */
  dshCode: 'session/workspace-attach-failed',
})

/** Host API under DSH's authenticated /api channel. */
export const API = Object.freeze({
  state: '/api/fishball/state',
  events: '/api/fishball/events',
  /** POST { sessionId, note }: you hand a session over with a note. */
  send: '/api/fishball/send',
  /** POST { sessionId, managed }: Hand over / Take back. */
  managed: '/api/fishball/managed',
  /** POST { requestId, decision, note? }: your Allow once / Reject on a card (the ask_fishball row). */
  requestsAnswer: '/api/fishball/requests/answer',
  /** POST { mode }: who answers managed sessions' questions. */
  questionMode: '/api/fishball/question-mode',
  /** POST { style }: which brand icon the sidebar shows (BRAND_STYLE). */
  brand: '/api/fishball/brand',
  /** POST { entry }: whether the sidebar has a Fishball row or only the brand button (SIDEBAR_ENTRY). */
  sidebarEntry: '/api/fishball/sidebar-entry',
})
export const HTTP = Object.freeze({ ok: 200, badRequest: 400, notFound: 404, conflict: 409, serverError: 500 })
export const HTTP_METHOD = Object.freeze({ get: 'GET', post: 'POST' })
export const REQUEST_BODY_BUFFERED = 'buffered'
export const API_CODE = Object.freeze({
  badBody: 'bad-body',
  notInRecovery: 'not-in-recovery',
  /** The named plugin or tool allowance does not exist. */
  unknown: 'unknown',
  /** The change was refused (a limit, or the plugin cannot run Fishball-only). */
  refused: 'refused',
  /** No assistant lifecycle runs: before the store opens, or after a core failure. */
  unavailable: 'unavailable',
  /** Settings (DESIGN §10d): the plugin is on in DSH; its settings are DSH's. */
  sharedWithDsh: 'shared-with-dsh',
  /** Settings: the row has no schema, or cannot be edited here. */
  noSettings: 'no-settings',
  /** Settings: the new config fails the row's schema (400, with `path`). */
  invalid: 'invalid',
  /** A card that already left the pile (answered, its turn ended, or Fishball went off). */
  expired: 'expired',
  /** Your note on Reject is over maxMessageBytes. */
  tooLarge: 'too-large',
  /** Your Revoke on a grant that already ended (expired, revoked, or its session left management). */
  ended: 'ended',
  failed: 'failed',
})
export const RESPONSE_HEADERS = Object.freeze({
  json: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  eventStream: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
  // no-store: the file changes with the installed dsh-fishball, so each page load fetches the installed copy.
  javascript: Object.freeze({ 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }),
  // The icon route sets the image's own content type; no-store, as an icon changes with its package.
  // An SVG opened on its own runs no script and no other content (sandbox, nosniff; review L6).
  image: Object.freeze({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" }),
})

/**
 * Host services the row injects (index.js `inject`). `loader` resolves the private
 * tree's rows; `sandboxPolicy` backs the shell guard; `sessionPersistence` is required by
 * `agents.resume`; `sessionProjections` says whether the session is still blank, from the
 * `sessionListMetadata` projection that `sessionController` registers (so it is injected too:
 * without it the blank check would silently read "not blank" and skip the setup turn).
 */
export const SERVICE = Object.freeze({
  agents: 'agents',
  workspaceRegistry: 'workspaceRegistry',
  storageDomain: 'storageDomain',
  /** Managed sessions' own tools (message_fishball, ask_fishball, list_user_messages). */
  tools: 'tools',
  connection: 'connection',
  sandboxPolicy: 'sandboxPolicy',
  sessionProjections: 'sessionProjections',
  sessionController: 'sessionController',
  /** Permission prompts the broker answers and the policy it reads (DESIGN §7a). */
  approval: 'approval',
  /** Durable session flush after a delivered message (the bridge's session.message). */
  sessions: 'sessions',
  /** Reads a stopped session's log without making it live (src/session-info.js persistedEventsOf). */
  sessionQuery: 'sessionQuery',
  /**
   * The bridge's start-with-a-model path reads ctx.llm (src/model-catalog.js). Before M1 the native
   * host row injected it; the session port now lives on this row (src/slim/host/interim-bridge.js).
   * sessionController already depends on llm, so this adds no new reason for the row to restart.
   */
  llm: 'llm',
})

/** Optional services read with ctx.get (Fishball works without them, with less shown). */
export const OPTIONAL_SERVICE = Object.freeze({
  /** Measures a request's size for the context window's hard ceiling (DESIGN §6). */
  tokenMeter: 'tokenMeter',
  /** DSH's question service: continued answers and the held timed wait (rev11g, §7a.10). */
  userQuestions: 'userQuestions',
  /** The profile launcher's facts (absent in non-profile hosts): bundle rows and Fishball's package folder. */
  profileContext: 'profileContext',
  /** DSH's runtime package resolution: where the profiles directory is (Fishball's package folder). */
  pluginPackages: 'pluginPackages',
  /** DSH's session titles (dsh-base's session-title row; absent only if a profile turns that row off): start_session names the new session (DESIGN §5d). */
  sessionTitle: 'sessionTitle',
})

/** Host events this plugin listens to. */
export const EVENT = Object.freeze({
  toolsChange: 'tools/change',
  sessionActivity: 'workspace/session-activity',
  sessionStop: 'workspace/session-stop',
  volatileUpdate: 'loader/volatile-update',
  agentDisposed: 'agent/disposed',
  /** Any agent was created (resume, clear and compaction re-create one; spike S34). */
  agentCreated: 'agent/created',
  /** Cordis: a service was provided or removed (a row waiting for one may now run). */
  service: 'internal/service',
  /** dsh-plugin-manager: a bundle was installed, removed, enabled or disabled. */
  pluginManagerChanged: 'plugin-manager/changed',
  /** dsh-llm: adapters or their models changed (a model window may have changed). */
  adaptersUpdated: 'llm/adapters-updated',
  /** Agent request waterfall: the final call config of each model request. */
  agentRequest: 'agent/request',
  /** Agent request-error waterfall: decides whether a failed model request is retried. */
  agentRequestError: 'agent/request-error',
  /** dsh-llm: every model call (the hard ceiling answers Fishball's own requests). */
  llmStream: 'llm/stream',
  agentStatus: 'agent/status',
  /** dsh-tools: every tool result before it is committed (Fishball's wording, spike S35). */
  postExecute: 'tools/post-execute',
  /** Every event appended to any session (watches), and the turn start it watches for. */
  sessionEvent: 'session/event',
  turnStart: 'turn/start',
  /** Inbox events of Fishball's agent (intake ledger bookkeeping). */
  inboxClaimed: 'agent/inbox/claimed',
  inboxDiscarded: 'agent/inbox/discarded',
})

/** dsh-tools post-execute decisions: keep the result (maybe replaced) or turn it into an error. */
export const POST_DECISION = Object.freeze({ accept: 'accept', block: 'block' })

/** Agent status after a turn ends (dsh-agent). */
export const AGENT_IDLE = 'idle'
