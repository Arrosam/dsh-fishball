/**
 * Fishball's durable state in its own storage domain (`$DSH_HOME/storages/fishball.json`,
 * spike S8). The domain is versioned: DSH refuses to open a stored version this code does not
 * understand, and the row then reports `store-unreadable` instead of overwriting anything. A
 * single record that no longer parses is moved aside (`invalidRecords`, below).
 *
 * Every table keeps version 1: the single-file layout reads a table missing from an older file as
 * empty and ignores one this build no longer declares (dsh-storage-json).
 */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { DOMAIN, CHANGED_BY, INTAKE_STATUS, INTAKE_KIND, WATCH_BY, WATCH_CONDITION, WATCH_MODE, WATCH_STATUS, APPROVAL_ANSWER, APPROVAL_RISK, APPROVAL_OUTCOME, ARGUMENTS_STATUS, BRAND_STYLE, SIDEBAR_ENTRY, MANAGED_BY, DECISION_ACTION, REQUEST_KIND, GRANT_KIND, GRANT_STATUS, GRANT_END, QUESTION_MODE, QUESTION_END } from './constants.js'

/** Table names; the spec and the accessors share them. DSH requires /^[a-z][a-z0-9_]*$/. */
const TABLE = Object.freeze({ settings: 'settings', watches: 'watches', preferences: 'preferences', managed: 'managed', decisions: 'decisions', grants: 'grants', pile: 'pile' })

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

/**
 * Your display choices; one record: the brand icon and the sidebar entry. The entry is optional
 * so a record saved before it existed still reads (and means the default, the panel row).
 */
const preferencesRecord = z.object({
  brandStyle: z.enum(Object.values(BRAND_STYLE)),
  sidebarEntry: z.enum(Object.values(SIDEBAR_ENTRY)).optional(),
  changedAt: z.string(),
})

/**
 * One card waiting in the user's pile (T08, src/pile.js). Plain card data, kept as published; the
 * scope names the pile that owns it (PILE_SCOPE), so the broker's pile and the question router's
 * never read each other's records. A card is removed the moment it leaves the pile, and one that
 * is still stored at start is rebuilt and then closed as `restarted` (no call waits on it).
 */
const pileCardRecord = z.object({
  scope: z.string().min(1),
  card: z.record(z.string(), z.unknown()),
  filedAt: z.string(),
})

/**
 * Who answers managed sessions' questions (rev11g, §9 `settings['questions']`); absent means auto.
 */
const questionModeRecord = z.object({
  mode: z.enum(Object.values(QUESTION_MODE)),
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
 * One intake item (DESIGN §9 fishball_intake.items). The message is kept only until it is in
 * Fishball's inbox; its digest stays.
 */
const intakeItemRecord = z.object({
  kind: z.enum(Object.values(INTAKE_KIND)),
  sourceIdentity: z.string().min(1),
  dedupeKey: z.string().min(1),
  messageId: z.string().min(1),
  /** The main session the input is about; the child names the sender and reads images by it. */
  sourceSessionId: z.string().min(1).optional(),
  status: z.enum(Object.values(INTAKE_STATUS)),
  createdAt: z.string(),
  contentDigest: z.string().min(1),
  /** The UserMessage whose text the child receives; dropped once the child acked it. */
  message: z.record(z.string(), z.unknown()).optional(),
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
const INTAKE_TABLE = Object.freeze({ items: 'items', approvals: 'approvals' })

/**
 * The intake domain: frequent writes, so each record is its own document (per-record layout),
 * and its keys are path-safe digests or compound keys.
 */
export const intakeDomain = defineDomain({
  name: DOMAIN.intake,
  version: DOMAIN.version,
  layout: 'per-record',
  // A row that no longer parses (a status or kind this build dropped) is moved aside rather than
  // failing the store; fields the removed in-process Fishball wrote (attempts, deliveredTo) are
  // simply stripped on read. No migration is kept for it.
  invalidRecords: 'backup-and-skip',
  tables: {
    [INTAKE_TABLE.items]: domainTable(intakeItemRecord),
    [INTAKE_TABLE.approvals]: domainTable(approvalRecord),
  },
})

/** Domain spec. A changed record shape must bump `version` or list compatible versions. */
export const fishballDomain = defineDomain({
  name: DOMAIN.main,
  version: DOMAIN.version,
  // The removed in-process Fishball left records this build no longer declares (its context-window
  // and model choices in `settings`, whole tables such as plugins and unread). A table no longer
  // declared is simply not read; a record in a kept table that no longer parses is moved aside by
  // DSH and treated as absent, instead of failing the whole store closed. No migration is kept
  // for the removed agent (the user's decision, 2026-11-06).
  invalidRecords: 'backup-and-skip',
  tables: {
    [TABLE.settings]: domainTable(questionModeRecord),
    [TABLE.watches]: domainTable(watchRecord),
    [TABLE.preferences]: domainTable(preferencesRecord),
    [TABLE.managed]: domainTable(managedRecord),
    [TABLE.decisions]: domainTable(decisionRecord),
    [TABLE.grants]: domainTable(grantRecord),
    [TABLE.pile]: domainTable(pileCardRecord),
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

  /** Table handles (KvTable: get/entries/put/delete/update), named as in the spec. */
  get settings() { return this.#domain.table(TABLE.settings) }
  get watches() { return this.#domain.table(TABLE.watches) }
  get preferences() { return this.#domain.table(TABLE.preferences) }
  get managed() { return this.#domain.table(TABLE.managed) }
  get decisions() { return this.#domain.table(TABLE.decisions) }
  get grants() { return this.#domain.table(TABLE.grants) }
  get pile() { return this.#domain.table(TABLE.pile) }
  get intakeItems() { return this.#intake.table(INTAKE_TABLE.items) }
  get approvals() { return this.#intake.table(INTAKE_TABLE.approvals) }
}
