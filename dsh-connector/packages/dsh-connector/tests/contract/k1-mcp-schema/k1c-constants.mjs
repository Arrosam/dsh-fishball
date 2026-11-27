/**
 * Oracles for the K1c rows: the K1 amendment that freezes the managed-state seam in
 * `dsh-agent-connector/mcp-schema` (Fishball's K1c spec, relayed 2026-11-14):
 * - a runtime constant MANAGED_REFUSAL, frozen, exactly {alreadyManaged: 'conflict',
 *   notManaged: 'not-managed', otherManager: 'forbidden'}, each value the same string as
 *   REFUSAL.conflict / REFUSAL.notManaged / REFUSAL.forbidden (one owner per value), and a member of
 *   K2's shared code list where K2 has it (`conflict`, `forbidden`);
 * - NOTICE.codes stays an empty frozen object (no notice code is frozen; C-ROUTE produces none);
 *   NOTICE.codeGrammar is unchanged. Superseded for NOTICE.codes by the managed-request lifecycle fix
 *   (requirement R9, relayed by the lead 2026-11-21) and automatic permission handoff: codes is
 *   frozen, each code matches codeGrammar, and index.d.ts types each code literally;
 * - index.d.ts declares, among the internal interfaces, ManagedState (five members), ManagedRecord,
 *   ManageResult, ReleaseResult, and `export declare const MANAGED_REFUSAL` with literal types;
 * - README: the "Managed state" section, ManagedState in "Internal module interfaces", the user
 *   decisions K1c-1 … K1c-4, and the "Left to a task" table no longer leaving C-ROUTE notice codes
 *   or "release emits nothing?" open;
 * - (core's vendored copy was compared byte for byte until F-OWN-SCHEMA removed it, design §1.0b row 1.)
 *
 * ManagedState's behaviour is C-ROUTE's (it builds the one implementation); no row tests it here.
 */

/** The K1c runtime constant and its exact content (spec item 1). */
export const MANAGED_REFUSAL_NAME = 'MANAGED_REFUSAL'
export const MANAGED_REFUSAL_VALUES = Object.freeze({
  alreadyManaged: 'conflict',
  notManaged: 'not-managed',
  otherManager: 'forbidden',
})
/** Decision table: each MANAGED_REFUSAL key → the REFUSAL key that owns the same string. */
export const REFUSAL_KEY_OF = Object.freeze({
  alreadyManaged: 'conflict',
  notManaged: 'notManaged',
  otherManager: 'forbidden',
})
/** K2's shared code list (dsh-agent-connector/tools `SHARED_CODES`) and the MANAGED_REFUSAL keys whose value it has. */
export const K2_SHARED = Object.freeze({ exportName: 'SHARED_CODES', keys: Object.freeze(['alreadyManaged', 'otherManager']) })

/** Spec item 2 as amended: NOTICE's fields and exact code vocabulary. */
export const NOTICE_SHAPE = Object.freeze({
  name: 'NOTICE',
  fields: Object.freeze(['codeGrammar', 'codes']),
  codes: Object.freeze({ questionCallEnded: 'question-call-ended', permissionEscalated: 'permission-escalated' }),
  /** index.d.ts types the code map as an object of readonly string literals. */
  codesType: (codes) => new RegExp('^\\{\\s*' + Object.entries(codes).map(([k, v]) => 'readonly\\s+' + k + '\\s*:\\s*["\']' + v + '["\']').join('\\s*[;,]?\\s*') + '\\s*[;,]?\\s*\\}$'),
})

/** Spec item 3: the K1c declarations in index.d.ts. */
export const K1C_TYPES = Object.freeze(['ManagedState', 'ManagedRecord', 'ManageResult', 'ReleaseResult'])
/** ManagedState's five members: name → [parameter types], return type (whitespace-normalised). */
export const MANAGED_STATE = Object.freeze({
  name: 'ManagedState',
  members: Object.freeze({
    managerOf: Object.freeze({ params: ['sessionId: string'], returns: 'PrincipalKey | undefined' }),
    managed: Object.freeze({ params: [], returns: 'readonly ManagedRecord[]' }),
    manage: Object.freeze({ params: ['sessionId: string', 'principalKey: PrincipalKey'], returns: 'Promise<ManageResult>' }),
    release: Object.freeze({ params: ['sessionId: string', 'principalKey: PrincipalKey'], returns: 'Promise<ReleaseResult>' }),
    onChange: Object.freeze({ params: ['listener: () => void'], returns: '() => void' }),
  }),
})
export const MANAGED_RECORD = Object.freeze({
  name: 'ManagedRecord',
  members: Object.freeze({ sessionId: 'string', principalKey: 'PrincipalKey' }),
  readonly: /^\s*readonly\s/,
})
/** The two result types: the refusal branch's `code` is `typeof MANAGED_REFUSAL.<key>` of these keys. */
export const RESULTS = Object.freeze({
  ManageResult: Object.freeze(['alreadyManaged']),
  ReleaseResult: Object.freeze(['notManaged', 'otherManager']),
})
export const RESULT_FIELDS = Object.freeze({ ok: 'ok', code: 'code', true: 'true', false: 'false' })
export const CODE_TYPE = /^typeof\s+MANAGED_REFUSAL\.(\w+)$/
/**
 * The part of index.d.ts that holds the internal interfaces: after its "Internal module interfaces"
 * banner, before the "Runtime exports" banner (the two section comments of the file).
 */
export const DTS_PARTS = Object.freeze({ internal: 'Internal module interfaces', runtime: 'Runtime exports' })
/** A runtime export's declaration line in index.d.ts. */
export const DECLARED_EXPORT = /^export\s+declare\s+(?:const|function|class|let|var)\s+([A-Za-z_$][\w$]*)/gm

/** Spec item 4: README.md of the module. */
export const README = Object.freeze({
  file: 'README.md',
  /** A heading line naming the section. */
  section: 'Managed state (`ManagedState`, `MANAGED_REFUSAL`; task K1c)',
  heading: /^#{2,6}\s+/,
  interfaces: '## Internal module interfaces',
  decisions: '## User decisions',
  leftToTask: '## Left to a task',
  nextSection: /^## /m,
  interfaceName: '`ManagedState`',
  decidedBy: 'decided by Fishball, not the user',
  /** User decisions K1c-1 … K1c-4, in order, each with the words its spec item names. */
  rows: Object.freeze([
    Object.freeze({ id: 'K1c-1', words: Object.freeze([/ManagedState/, /\broot\b/i, /unknown-session/, /Hand over/i, /Take back/i, /\bK3\b/]) }),
    Object.freeze({ id: 'K1c-2', words: Object.freeze([/\bQ-16\b/, /session_release/, /\bno event\b/i]) }),
    Object.freeze({ id: 'K1c-3', words: Object.freeze([/\bQ-17\b/, /\bdurable\b/i, /maxQueuedInputs/, /queue-full/, /\bin order\b/i, /\bpaired\b/i, /connected or not/i, /\bstays queued\b/i, /never dropped/i]) }),
    Object.freeze({ id: 'K1c-4', words: Object.freeze([/\bnotice\b/i, /NOTICE\.codes/, /\bempty\b/i, /C-ROUTE/, /\bnone\b/i]) }),
  ]),
  /** "Left to a task": the notice-codes row, and C-ROUTE named only as producing none. */
  noticeRow: /\bnotice\b/i,
  route: /\bC-ROUTE\b/,
  producesNone: /\bnone\b/i,
  clause: /[;|]/,
  /** The question the table no longer leaves open, and the decision it now cites. */
  releaseOpen: /release emits nothing\s*\?/i,
  releaseNamed: /release emits nothing/i,
  releaseDecision: 'K1c-2',
})

// F-OWN-SCHEMA: generated entry withdrawn (design §1.0b row 1).
