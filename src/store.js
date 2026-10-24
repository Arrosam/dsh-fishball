/**
 * Fishball's durable state in its own storage domain (`$DSH_HOME/storages/fishball.json`,
 * spike S8). The domain is versioned and fails closed: DSH refuses to open a stored
 * version or record this code does not understand, and the lifecycle then reports
 * `store-unreadable` instead of overwriting anything.
 *
 * Tables added in P3 and P4 keep version 1: the single-file layout reads a table missing from an
 * older file as empty (dsh-storage-json), and no existing record changes shape.
 */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { DOMAIN, PLUGIN_KIND, CHANGED_BY, PLUGIN_ACTION, INTAKE_STATUS, INTAKE_KIND, OUTBOX_KIND, OUTBOX_STATUS } from './constants.js'

/** Table names; the spec and the accessors share them. DSH requires /^[a-z][a-z0-9_]*$/. */
const TABLE = Object.freeze({ plugins: 'plugins', toolApprovals: 'tool_approvals', pluginChanges: 'plugin_changes', settings: 'settings' })

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

/** Tables of the intake domain. */
const INTAKE_TABLE = Object.freeze({ items: 'items', outbox: 'outbox' })

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
    [TABLE.settings]: domainTable(settingsRecord),
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
  get intakeItems() { return this.#intake.table(INTAKE_TABLE.items) }
  get outbox() { return this.#intake.table(INTAKE_TABLE.outbox) }
}
