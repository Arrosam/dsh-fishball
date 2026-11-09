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
