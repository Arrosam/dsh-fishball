/**
 * T-SK vocabulary for the private Skills cases (docs/test-design/private-skills.md).
 * Values come from S1–S8, the user's quoted requirements, the four SK-SEAM decisions, Fishball's
 * answers Q1–Q6 and the installed SDKs' public skill contracts, never from a Fishball implementation.
 */
import os from 'node:os'
import path from 'node:path'

/** The two SDKs every case covers; their immutable installed sources are the native oracle. */
export const SKILL_SDK = Object.freeze({
  versionsDir: process.env.FBTEST_DSH_VERSIONS ?? path.join(os.homedir(), 'Library', 'Application Support', 'DSH', 'data', 'versions'),
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  nodeModules: 'node_modules',
  entry: path.join('lib', 'index.js'),
  packageFile: 'package.json',
  registry: '@deepseek-ai/dsh-skill',
  filesystem: '@deepseek-ai/dsh-skill-filesystem',
})

/** Owner named by every case this task cannot run (final scope §4 row SK). */
export const OWNER = Object.freeze({ sk: 'SK' })

/**
 * Why a case stays `test.todo` after the SK implementation exists: each names the live seam the
 * in-process harness cannot stand in for (title suffix "— not observable in-process: <reason>").
 */
export const UNOBSERVABLE = Object.freeze({
  prefix: 'not observable in-process',
  workerDelivery: 'needs a live manager→worker message delivery (a real model turn and a managed worker session) to see the body text arrive in the worker conversation. The observable halves run elsewhere: own list/read/load with no approval or write (SK-EP-19-01, SK-DT-01-R1), the read result as complete body text with no path (SK-EP-19-07, SK-UC-25-A2), no direct worker load, catalog or tool (SK-EP-19-06, SK-DT-01-R3), and the prompt section telling Fishball to hand off text, not a name (SK-UC-UI-M)',
  sendGate: 'needs the live worker send gate (a dormant brief refusing a real send)',
})

/** The public SK contract the cases test against (the parent's contract note; v2-sk-seam §5). */
export const CONTRACT = Object.freeze({
  /** Modules imported per SDK version, relative to packages/dsh-instance (V3 R-CORE: the SK modules are packages/core's). */
  modules: Object.freeze({
    skills: path.join('..', 'core', 'src', 'slim', 'child', 'skills.js'),
    store: path.join('..', 'core', 'src', 'slim', 'child', 'skills-store.js'),
    overlay: path.join('src', 'native-runtime', 'overlay.js'),
  }),
  pluginId: 'fishball-private-skills',
  provider: 'fishball-private',
  /**
   * S4 prompt section (implementer's contract note; S4/S2/decision 2). Its text must say the
   * private_skill_* tools are the one exception to read-only (never changing a file), and that a
   * worker gets the text, not a skill name. The patterns are requirement words, not the copy.
   */
  section: Object.freeze({
    name: 'fishball-private-skills',
    tools: /private_skill_/,
    exception: /exception/i,
    readOnly: /read-only|never chang/i,
    workerText: /worker[\s\S]*\btext\b/i,
    notName: /name alone|not a name|never (?:just )?a name|name is not/i,
  }),
  /** `cause` on catalog-incomplete / refresh-failed: which source was incomplete. */
  catalogCause: Object.freeze({ privateLibrary: 'private-library', otherSource: 'other-skill-source' }),
  tool: Object.freeze({
    list: 'private_skill_list', read: 'private_skill_read', create: 'private_skill_create',
    update: 'private_skill_update', remove: 'private_skill_remove', reload: 'private_skill_reload',
  }),
  /** The only argument keys the six tools take ("a name and a document only", EP-20-10). */
  argumentKeys: Object.freeze(['name', 'document']),
  code: Object.freeze({
    invalidName: 'invalid-name', invalidDocument: 'invalid-document', conflict: 'conflict', notFound: 'not-found',
    unsafeEntry: 'unsafe-entry', writeFailed: 'write-failed', cancelled: 'cancelled', refreshFailed: 'refresh-failed',
    catalogIncomplete: 'catalog-incomplete', invalidArguments: 'invalid-arguments', notManager: 'not-manager', failed: 'failed',
  }),
  field: Object.freeze({ name: 'name', description: 'description', body: 'body' }),
  /** Stock read-only sandbox vocabulary (dsh-fs-sandbox / dsh-sandbox public docs). */
  sandbox: Object.freeze({ readOnly: 'read-only', denied: 'FS_SANDBOX_DENIED', unavailable: 'SANDBOX_UNAVAILABLE' }),
})

/** Inputs an attacker-shaped or out-of-contract call may carry (EP-20-09/10, DT-SK-01-R5). */
export const HOSTILE = Object.freeze({
  extraArguments: Object.freeze([
    Object.freeze({ root: '/private/tmp' }), Object.freeze({ path: 'outside/SKILL.md' }), Object.freeze({ command: 'rm -rf .' }),
    Object.freeze({ files: Object.freeze({ 'extra.sh': 'echo' }) }), Object.freeze({ cwd: '/' }),
  ]),
  escalation: Object.freeze({ sandbox_permissions: 'danger-full-access', justification: 'write the skill file' }),
  /** Model-supplied identity claims riding a nested dispatch; the receiving agent stays the worker. */
  identityFlags: Object.freeze({ manager: true, role: 'fishball', caller: 'fbtest-manager' }),
  widenedModes: Object.freeze(['workspace-write', 'danger-full-access']),
  absoluteNames: Object.freeze(['/Users/x/.dsh/skills/a', '/private/tmp/a']),
  traversalNames: Object.freeze(['../a', 'a/../../b', '..']),
  siblingNames: Object.freeze(['skills-evil/a', '../skills2/a']),
  aliasNames: Object.freeze(['a/b', 'a\\b', '.', 'a%2Fb', 'a/', 'a\u0000b']),
  /** A string that is not encodable as UTF-8 (lone surrogate) and an unparseable front matter. */
  loneSurrogate: '\uD800',
  unparseableFrontmatter: 'name: [unclosed\ndescription: d',
  /** S8 semantic content: no scanner may refuse it (EP-22-05). Inert fake values. */
  secretBody: 'API_KEY=sk-fbtest-0000000000000000 and Samuel lives at 1 Example Street.',
  /** Words a tool result must not use to claim a UI refresh or an erasure (decision 3, ST-09-T4). */
  menuClaim: /slash|menu/i,
  erasureClaim: /eras|retract|forg[eo]t/i,
})

/** In-process harness identities and fixture layout (one child home per test). */
export const HARNESS = Object.freeze({
  /** Query tag that binds one instance-module graph to one installed SDK version. */
  versionTag: 'fbsdk',
  sessionId: 'fbtest-manager',
  workerIds: Object.freeze({ subagent: 'fbtest-native-subagent', session: 'fbtest-managed-worker' }),
  homeDirectory: 'home',
  agentsDirectory: 'agents',
  workspaceDirectory: 'workspace',
  outsideDirectory: 'outside',
  mainDirectory: 'main',
  faultProvider: 'fbtest-fault-provider',
  faultMode: Object.freeze({ ok: 'ok', incomplete: 'incomplete', throws: 'throws' }),
  /** Front-matter-free body that marks a skill as "written by someone else". */
  workerBody: 'the worker\'s own body, not Fishball\'s',
  /** chmod modes: an existing directory that refuses new entries, and the owner's normal mode. */
  mode: Object.freeze({ noWrite: 0o500, owner: 0o700 }),
  /** Rows launchOverlay requires plus the stock skill provider row. */
  overlayRows: Object.freeze(['hmr', 'sandbox-policy', 'approval', 'webserver', 'web-runtime']),
  overlaySkillRow: Object.freeze({ id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' }),
  overlayRecord: Object.freeze({ hostId: 'fbtest-host', instanceId: 'fbtest-instance' }),
  overlayChildModule: 'native-child.js',
  shellWrite: (file) => `printf hacked > '${file}'`,
  /** When the fake manager's X1 `sessionId()` starts reporting a generation's id. */
  publish: Object.freeze({ before: 'before', after: 'after', never: 'never' }),
})

/** Installed SDK packages the harness composes, by public entry (lib/index.js). */
export const SDK_PACKAGES = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  scope: '@deepseek-ai/dsh-scope',
  tools: '@deepseek-ai/dsh-tools',
  systemPrompt: '@deepseek-ai/dsh-system-prompt',
  fsSandbox: '@deepseek-ai/dsh-fs-sandbox',
  subprocess: '@deepseek-ai/dsh-subprocess-local',
  sandbox: '@deepseek-ai/dsh-sandbox-local',
  bashSandbox: '@deepseek-ai/dsh-bash-sandbox',
})

/** S5 storage layout and S6 document delimiters. */
export const LAYOUT = Object.freeze({
  root: 'skills',
  file: 'SKILL.md',
  frontmatter: '---',
  tempPrefix: '/private/tmp/fbtest-private-skills-',
})

/** S6 native keys: the canonical DSH spelling, and the legacy aliases the native parser rejects. */
export const KEYS = Object.freeze({
  disableModel: 'disable-model-invocation',
  legacy: Object.freeze(['disableModelInvocation', 'modelInvocable', 'userInvocable']),
})

/** S6's illustrative native-format skill (core requirements, "Native-format example"). */
export const SAMPLE = Object.freeze({
  name: 'preferred-development-cycle',
  description: "Fishball's experience coordinating Samuel's development and test work.",
  body: [
    'Use Astra medium for development and Sol xhigh for tests when those are',
    "Samuel's current instructions. Carry the relevant TDD steps into the worker's",
    "message; do not assume it can open Fishball's private skill directory.",
  ].join('\n'),
})

/** Fixture names; each is a valid kebab name so only the property under test varies. */
export const FIXTURE = Object.freeze({
  privateSkill: 'private-note',
  mainDsh: 'main-dsh-only',
  mainAgents: 'main-agents-only',
  mismatchDirectory: 'dir-name',
  mismatchDocument: 'doc-name',
  leak: 'leak',
  leakMarker: 'FOREIGN-CONTENT-MARKER-7f3a',
  blankDescription: ' ',
  emptyBody: '',
  // YAML-significant description: a colon, a comment marker, and a line that would inject a key if unquoted.
  trickyDescription: 'a: b # c\n' + 'disable-model-invocation: true',
  // A body that repeats the delimiter and a fake front matter after the real one has closed.
  trickyBody: '---\nname: evil\n---\nreal body',
})

/**
 * BVA-12 plus character-class edges of the S6 grammar `^[a-z0-9]+(?:-[a-z0-9]+)*$`:
 * [input, valid, boundary]. ASCII neighbours: '/' < '0', '9' < ':', '`' < 'a', 'z' < '{'.
 */
export const NAME_BVA = Object.freeze([
  ['', false, 'length 0'],
  ['a', true, 'length 1'],
  ['ab', true, 'length 2'],
  ['a-b', true, 'separator between groups'],
  ['-a', false, 'leading separator'],
  ['a-', false, 'trailing separator'],
  ['a--b', false, 'empty group between separators'],
  ['0', true, 'lowest digit'],
  ['9', true, 'highest digit'],
  ['/', false, 'code point below 0'],
  [':', false, 'code point above 9'],
  ['z', true, 'highest lowercase letter'],
  ['`', false, 'code point below a'],
  ['{', false, 'code point above z'],
  ['A', false, 'lowest uppercase letter'],
  ['Z', false, 'highest uppercase letter'],
])

/** Names and contents the executable cases use; each name is valid unless the case varies it. */
export const CASE = Object.freeze({
  other: 'other-skill',
  renamed: 'new-skill-name',
  absent: 'absent-skill',
  fresh: 'fresh-skill',
  revisedBody: SAMPLE.body + '\nrevised: Sol high for tests from now on.',
  thirdBody: SAMPLE.body + '\nrevised again.',
  correctedDescription: 'A corrected description.',
  /** BVA-D/B values (docs/test-design/private-skills.md §4). */
  description: Object.freeze({ empty: '', space: ' ', one: 'a', padded: ' a ' }),
  body: Object.freeze({ empty: '', whitespace: ' \n\t', one: 'x' }),
  /** EP-21-09: a non-string name/description, as raw YAML scalars. */
  nonString: Object.freeze({ number: 5, list: Object.freeze(['a']) }),
  /** EP-19-02/03: one uniquely named skill per main-home source. */
  main: Object.freeze({
    dshHome: '.dsh', agentsHome: '.agents', project: 'project', gitMarker: '.git', custom: 'custom',
    names: Object.freeze({ dsh: 'main-dsh-only', agents: 'main-agents-only', projectDsh: 'main-project-dsh', projectAgents: 'main-project-agents', custom: 'main-custom-only' }),
    body: 'MAIN-HOME-BODY-not-fishball',
    env: Object.freeze(['HOME', 'USERPROFILE', 'DSH_HOME', 'DSH_AGENTS_HOME']),
  }),
  /** EP-19-07: a worker's own skill root. */
  workerRoot: 'worker-skills',
  /** EP-19-04: a bundled/runtime contribution sharing a private name. */
  bundledBody: 'BUNDLED-BODY-colliding',
  /** EP-21-17 / DT-SK-04 bypass shapes. */
  bypass: Object.freeze({
    corrupt: 'corrupt-entry', nonRegular: 'non-regular', fifo: 'fifo-entry', hard: 'hard-link', stray: 'stray.txt',
    extra: 'notes.txt', extraDir: 'assets', garbage: Buffer.from([0xff, 0xfe, 0x2d, 0x2d, 0x2d, 0x0a, 0xc3, 0x28]),
    alias: 'inside-alias', fileLink: 'inside-file-link', hardTarget: 'hard.md',
  }),
  mkfifo: '/usr/bin/mkfifo',
  /** A blocking open on a FIFO would hang the run; past this the harness releases it and fails the case. */
  fifoWatchdogMs: 5000,
  /** Concurrent same-name attempts per case; several rounds widen the interleavings seen (Q5). */
  concurrencyRounds: 5,
  renameClaim: /renam/i,
})
