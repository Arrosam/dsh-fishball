/**
 * Fishball's durable state in its own storage domain (`$DSH_HOME/storages/fishball.json`,
 * spike S8). The domain is versioned and fails closed: DSH refuses to open a stored
 * version or record this code does not understand, and the lifecycle then reports
 * `store-unreadable` instead of overwriting anything.
 *
 * Tables added in P3, P4, P6, and the unread, preferences, plugin_defaults, plugin_settings, managed, decisions, tags, grants, own_requests and notices tables keep version 1 (as do the question-mode record, rev11g's tag answers and question audit ends, which only add values): the single-file layout reads a table missing from an
 * older file as empty (dsh-storage-json), and no existing record changes shape.
 */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { DOMAIN, PLUGIN_KIND, CHANGED_BY, PLUGIN_ACTION, INTAKE_STATUS, INTAKE_KIND, OUTBOX_KIND, OUTBOX_STATUS, WATCH_BY, WATCH_CONDITION, WATCH_MODE, WATCH_STATUS, APPROVAL_ANSWER, APPROVAL_RISK, APPROVAL_OUTCOME, ARGUMENTS_STATUS, BRAND_STYLE, MANAGED_BY, DECISION_ACTION, REQUEST_KIND, APPROVAL_DECISION, TAG_KIND, GRANT_KIND, GRANT_STATUS, GRANT_END, OWN_STATUS, QUESTION_MODE, QUESTION_TAG_ANSWER, QUESTION_END } from './constants.js'

/** Table names; the spec and the accessors share them. DSH requires /^[a-z][a-z0-9_]*$/. */
const TABLE = Object.freeze({ plugins: 'plugins', toolApprovals: 'tool_approvals', pluginChanges: 'plugin_changes', settings: 'settings', watches: 'watches', unread: 'unread', preferences: 'preferences', pluginDefaults: 'plugin_defaults', pluginSettings: 'plugin_settings', managed: 'managed', decisions: 'decisions', tags: 'tags', grants: 'grants', ownRequests: 'own_requests', notices: 'notices' })

/** One watch (DESIGN §5c, §9). */
const watchRecord = z.object({
  targetSessionId: z.string().min(1),
  condition: z.enum(Object.values(WATCH_CONDITION)),
  mode: z.enum(Object.values(WATCH_MODE)),
  createdBy: z.object({ kind: z.enum(Object.values(WATCH_BY)), id: z.string().min(1).optional() }),
  createdAt: z.string(),
  /** Seq of the last target event already considered; only later turn ends fire. */
  lastSeenSeq: z.number().int(),
  status: z.enum(Object.values(WATCH_STATUS)),
  firedCount: z.number().int().nonnegative(),
  lastFiredAt: z.string().optional(),
  lastReason: z.string().optional(),
})

/** Fishball's replies you have not seen yet; made for one assistant session, as the settings are. */
const unreadRecord = z.object({
  sessionId: z.string().min(1),
  count: z.number().int().nonnegative(),
  changedAt: z.string(),
})

/** Your display choices; one record, the brand icon for now. */
const preferencesRecord = z.object({
  brandStyle: z.enum(Object.values(BRAND_STYLE)),
  changedAt: z.string(),
})

/** A one-time notice that has shown (revision 12: the welcome card, DESIGN §10f); absent means not yet. */
const noticeRecord = z.object({ seenAt: z.string() })

/** A positive whole number of tokens (context-window settings). */
export const tokenCount = z.number().int().positive()

/** The context-window setting (DESIGN §6); an absent field is unset. */
const settingsRecord = z.object({
  /** The assistant session it was made for; another (adopted) session ignores it. */
  sessionId: z.string().min(1),
  contextWindowTokens: tokenCount.optional(),
  maxOutputTokens: tokenCount.optional(),
  changedAt: z.string(),
})

/**
 * Who answers managed sessions' questions (rev11g, §9 `settings['questions']`); absent means auto.
 * It shares the settings table with the context-window record, under its own key.
 */
const questionModeRecord = z.object({
  mode: z.enum(Object.values(QUESTION_MODE)),
  changedAt: z.string(),
})

const assistantRecord = z.object({
  /** The one assistant session; null before the first successful creation. */
  sessionId: z.string().min(1).nullable(),
  workspaceId: z.string().min(1).nullable(),
  cwd: z.string().min(1).nullable(),
  createdAt: z.string().nullable(),
})

/** Fishball's own on/off choice for one catalog plugin; absent means the catalog default. */
const pluginRecord = z.object({
  kind: z.enum(Object.values(PLUGIN_KIND)),
  on: z.boolean(),
  changedBy: z.enum(Object.values(CHANGED_BY)),
  changedAt: z.string(),
  /** Stable diagnostic when the plugin's rows could not run for Fishball. */
  lastError: z.string().optional(),
  /**
   * A Fishball-installed plugin you or Fishball chose to uninstall; the uninstall runs after the
   * next idle-phase apply, and a restart before it finishes it then. Absent on older records.
   */
  removing: z.boolean().optional(),
})

/**
 * Which DSH plugins keep the old default for Fishball (src/plugin-defaults.js). dshPlugins is
 * null until the first successful bundle listing.
 */
const pluginDefaultsRecord = z.object({
  existingInstall: z.boolean(),
  dshPlugins: z.array(z.string().min(1)).nullable(),
  recordedAt: z.string(),
})

/**
 * Settings for a plugin Fishball runs in its private tree (DESIGN §9, §10d): the changed values
 * per row id, by you or by Fishball after you allowed them. Secret values are kept here and never
 * leave the Host.
 */
const pluginSettingsRecord = z.object({
  rows: z.record(z.string().min(1), z.record(z.string(), z.unknown())),
  changedBy: z.enum(Object.values(CHANGED_BY)),
  changedAt: z.string(),
})

/** A session Fishball manages, keyed by its (root) session id (revision 11, DESIGN §5e, §9). */
const managedRecord = z.object({
  since: z.string(),
  by: z.enum(Object.values(MANAGED_BY)),
  changedAt: z.string(),
})

/** One of Fishball's decisions (DESIGN §9 `decisions`); its rationale is cut to rationaleChars. */
const decisionRecord = z.object({
  action: z.enum(Object.values(DECISION_ACTION)),
  sessionId: z.string().min(1),
  by: z.enum(Object.values(CHANGED_BY)),
  rationale: z.string().optional(),
  /** The request a click answered (rev11b). */
  target: z.string().min(1).optional(),
  /** Your Reject on a card: whether you wrote a note to the agent; the note itself is never stored (§9, rev11c). */
  withNote: z.boolean().optional(),
  at: z.string(),
  outcome: z.string().min(1),
})

/** One answer Fishball gave, placed in the asking turn's tail by the seq of its call (DESIGN §9 `tags`, S37). */
const tagRecord = z.object({
  sessionId: z.string().min(1),
  callId: z.string().min(1).optional(),
  seq: z.number().int().nonnegative(),
  /** An answer_approval / answer_prompt decision, or a question's answer kind (rev11g; the words stay in the session log). */
  answer: z.enum([...Object.values(APPROVAL_DECISION), ...Object.values(QUESTION_TAG_ANSWER)]),
  kind: z.enum(Object.values(TAG_KIND)),
  /** A call a standing grant covered (rev11d): what the tag names, the prefix or "exact call" (never the arguments). */
  grant: z.object({ kind: z.enum(Object.values(GRANT_KIND)), toolName: z.string().min(1), prefix: z.string().min(1).optional() }).optional(),
  at: z.string(),
})

/**
 * A standing grant (DESIGN §7a.8, §9 `grants`), keyed by its grt_ id. An exact grant keeps the
 * digest of the canonical arguments, never the arguments; a prefix grant keeps its prefix, the
 * one stored text, because it is the matching rule itself.
 */
const grantRecord = z.object({
  sessionId: z.string().min(1),
  kind: z.enum(Object.values(GRANT_KIND)),
  toolName: z.string().min(1),
  argumentsDigest: z.string().min(1).optional(),
  prefix: z.string().min(1).optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  requestId: z.string().min(1),
  rationale: z.string().optional(),
  uses: z.number().int().nonnegative(),
  lastUsedAt: z.string().optional(),
  status: z.enum(Object.values(GRANT_STATUS)),
  endedBy: z.enum(Object.values(GRANT_END)).optional(),
  endedAt: z.string().optional(),
})

/**
 * One of Fishball's own requests (DESIGN §7a.11, §9 `own_requests`, rev11f), keyed by its own_ id.
 * The arguments are kept, cut to argumentExcerptBytes, because the card shows them across a
 * restart (item 24); the pass matches by the digest of the whole canonical arguments.
 */
const ownRequestRecord = z.object({
  toolName: z.string().min(1),
  /** sha256 of the canonical arguments; absent when they could not be read (no pass can match then). */
  argumentsDigest: z.string().min(1).optional(),
  arguments: z.string(),
  argumentsStatus: z.enum(Object.values(ARGUMENTS_STATUS)),
  /** Fishball's reason, cut to rationaleChars. */
  reason: z.string(),
  /** The bounded detail list (the unchecked tools, or the changed settings), "and N more" included. */
  detail: z.array(z.string()).optional(),
  status: z.enum(Object.values(OWN_STATUS)),
  createdAt: z.string(),
  decidedAt: z.string().optional(),
  /** Your Reject note, told to Fishball. */
  note: z.string().optional(),
  /** The id of the "run it again" notice, to find the turn it woke. */
  noticeId: z.string().min(1).optional(),
  /** The turn of Fishball's session the notice entered: the pass ends with it. */
  wokenTurn: z.number().int().nonnegative().optional(),
  /** Whether Fishball has been given the outcome: false for a rejection or run-again notice it could not be given yet (given at its next go-live). */
  told: z.boolean().optional(),
})

/** You allowed a tool nobody had checked, for exactly these parameters (DESIGN §7). */
const toolApprovalRecord = z.object({
  module: z.string().min(1),
  toolName: z.string().min(1),
  paramsDigest: z.string().min(1),
  allowedAt: z.string(),
})

/** Audit of plugin changes; the newest `auditEntriesKept` are kept. */
const pluginChangeRecord = z.object({
  plugin: z.string().min(1),
  action: z.enum(Object.values(PLUGIN_ACTION)),
  by: z.enum(Object.values(CHANGED_BY)),
  at: z.string(),
  outcome: z.string().min(1),
})

/**
 * One intake item (DESIGN §9 fishball_intake.items). The message is kept only until it is in
 * Fishball's inbox; its digest stays.
 */
const intakeItemRecord = z.object({
  kind: z.enum(Object.values(INTAKE_KIND)),
  sourceIdentity: z.string().min(1),
  dedupeKey: z.string().min(1),
  messageId: z.string().min(1),
  status: z.enum(Object.values(INTAKE_STATUS)),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string(),
  acceptedAt: z.string().optional(),
  /** The assistant session the item was delivered to (an adopted session does not inherit it). */
  deliveredTo: z.string().min(1).optional(),
  errorCode: z.string().optional(),
  contentDigest: z.string().min(1),
  /** The UserMessage to deliver (DSH's own shape; validated by DSH when it is steered). */
  message: z.record(z.string(), z.unknown()).optional(),
})

/** One message Fishball sent or session it started (DESIGN §9 outbox). */
const outboxRecord = z.object({
  kind: z.enum(Object.values(OUTBOX_KIND)),
  targetSessionId: z.string().nullable(),
  folder: z.string().optional(),
  messageDigest: z.string().min(1),
  at: z.string(),
  status: z.enum(Object.values(OUTBOX_STATUS)),
  errorCode: z.string().optional(),
})

/** One permission request Fishball was asked (DESIGN §9 approvals); never the arguments. */
const approvalRecord = z.object({
  sessionId: z.string().min(1),
  toolName: z.string().min(1),
  callId: z.string().optional(),
  argumentsDigest: z.string().min(1),
  argumentsStatus: z.enum(Object.values(ARGUMENTS_STATUS)),
  /** When it was routed to Fishball (the audit key's time). */
  at: z.string(),
  answer: z.enum(Object.values(APPROVAL_ANSWER)),
  /** Revision 11: asked first or a direct call, and the quoted message ids (never their text). */
  kind: z.enum(Object.values(REQUEST_KIND)).optional(),
  quotes: z.array(z.string()).optional(),
  /** rev11d: the grant this answer created, or the grant that covered this call. */
  grantId: z.string().min(1).optional(),
  /** rev11-ui-fixes R4: who gave the pass a `pass` row ran on (your Allow once, or Fishball's allow). */
  passBy: z.enum(Object.values(CHANGED_BY)).optional(),
  risk: z.enum(Object.values(APPROVAL_RISK)).optional(),
  rationale: z.string().optional(),
  /** DSH's outcome; a question's row (kind question, rev11g) records how the question ended instead. */
  finalOutcome: z.enum([...Object.values(APPROVAL_OUTCOME), ...Object.values(QUESTION_END)]),
  decidedAt: z.string(),
})

/** Tables of the intake domain. */
const INTAKE_TABLE = Object.freeze({ items: 'items', outbox: 'outbox', approvals: 'approvals' })

/**
 * The intake domain: frequent writes, so each record is its own document (per-record layout),
 * and its keys are path-safe digests or compound keys.
 */
export const intakeDomain = defineDomain({
  name: DOMAIN.intake,
  version: DOMAIN.version,
  layout: 'per-record',
  tables: {
    [INTAKE_TABLE.items]: domainTable(intakeItemRecord),
    [INTAKE_TABLE.outbox]: domainTable(outboxRecord),
    [INTAKE_TABLE.approvals]: domainTable(approvalRecord),
  },
})

/** Domain spec. A changed record shape must bump `version` or list compatible versions. */
export const fishballDomain = defineDomain({
  name: DOMAIN.main,
  version: DOMAIN.version,
  global: { schema: assistantRecord, initial: { sessionId: null, workspaceId: null, cwd: null, createdAt: null } },
  tables: {
    [TABLE.plugins]: domainTable(pluginRecord),
    [TABLE.toolApprovals]: domainTable(toolApprovalRecord),
    [TABLE.pluginChanges]: domainTable(pluginChangeRecord),
    [TABLE.settings]: domainTable(z.union([settingsRecord, questionModeRecord])),
    [TABLE.watches]: domainTable(watchRecord),
    [TABLE.unread]: domainTable(unreadRecord),
    [TABLE.preferences]: domainTable(preferencesRecord),
    [TABLE.pluginDefaults]: domainTable(pluginDefaultsRecord),
    [TABLE.pluginSettings]: domainTable(pluginSettingsRecord),
    [TABLE.managed]: domainTable(managedRecord),
    [TABLE.decisions]: domainTable(decisionRecord),
    [TABLE.tags]: domainTable(tagRecord),
    [TABLE.grants]: domainTable(grantRecord),
    [TABLE.ownRequests]: domainTable(ownRequestRecord),
    [TABLE.notices]: domainTable(noticeRecord),
  },
})

/**
 * Thin owner of the open domain handle.
 * Contract: open() resolves or rejects (DomainError codes pass through); the handle is
 * closed when the owning plugin context is disposed.
 */
export class Store {
  #domain
  #intake

  /** @param ctx - plugin context with `storageDomain`. Opens both domains or rejects. */
  static async open(ctx) {
    const store = new Store()
    store.#domain = await ctx.storageDomain.open(fishballDomain)
    ctx.effect(() => () => store.#domain.close(), 'fishball: store')
    store.#intake = await ctx.storageDomain.open(intakeDomain)
    ctx.effect(() => () => store.#intake.close(), 'fishball: intake store')
    return store
  }

  /** @returns the assistant record (synchronous, from memory). */
  assistant() {
    return this.#domain.global.get()
  }

  /** Durably replace the assistant record. */
  setAssistant(record) {
    return this.#domain.global.set(record)
  }

  /** Table handles (KvTable: get/entries/put/delete/update), named as in the spec. */
  get plugins() { return this.#domain.table(TABLE.plugins) }
  get toolApprovals() { return this.#domain.table(TABLE.toolApprovals) }
  get pluginChanges() { return this.#domain.table(TABLE.pluginChanges) }
  get settings() { return this.#domain.table(TABLE.settings) }
  get watches() { return this.#domain.table(TABLE.watches) }
  get unread() { return this.#domain.table(TABLE.unread) }
  get preferences() { return this.#domain.table(TABLE.preferences) }
  get pluginDefaults() { return this.#domain.table(TABLE.pluginDefaults) }
  get pluginSettings() { return this.#domain.table(TABLE.pluginSettings) }
  get managed() { return this.#domain.table(TABLE.managed) }
  get decisions() { return this.#domain.table(TABLE.decisions) }
  get tags() { return this.#domain.table(TABLE.tags) }
  get grants() { return this.#domain.table(TABLE.grants) }
  get ownRequests() { return this.#domain.table(TABLE.ownRequests) }
  get notices() { return this.#domain.table(TABLE.notices) }
  get intakeItems() { return this.#intake.table(INTAKE_TABLE.items) }
  get outbox() { return this.#intake.table(INTAKE_TABLE.outbox) }
  get approvals() { return this.#intake.table(INTAKE_TABLE.approvals) }
}
