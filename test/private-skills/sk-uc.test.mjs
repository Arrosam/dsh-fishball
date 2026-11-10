/**
 * T-SK Use Cases (written first): Fishball's private Skills, UC-25–28 plus lifecycle and
 * no-user-UI stories. Requirements: S1–S8, SK-SEAM decisions 1–4, Fishball answers Q1–Q6
 * (docs/test-design/private-skills.md). Every case needs the SK implementation, so all are
 * test.todo owned by SK; each runs once per supported SDK.
 */
import { perSdk, todoSk } from './support/fixtures.mjs'

const USE_CASES = [
  // UC-25 — Fishball applies its experience to a worker's task (S1/S2/S6/S7).
  ['SK-UC-25-M', 'Fishball, in read-only mode, lists and loads its own child skill through the dedicated tool and native loader, then messages a managed worker with the relevant body text. The worker receives that text in its conversation, not a path or a "load skill X" instruction. No approval card, no file write.'],
  ['SK-UC-25-A1', 'A skill exists only in main ~/.dsh/skills. Fishball\'s list and load do not return it, and the tool reports not-found. Nothing is copied or imported into the child.'],
  ['SK-UC-25-A2', 'A worker has its own same-named skill. Fishball\'s handoff message carries Fishball\'s private body, the worker\'s own skill file and catalog are unchanged, and the private skill never appears in the worker\'s catalog.'],
  ['SK-UC-25-E1', 'Fishball loads a name it does not have. The tool returns the real not-found outcome, Fishball keeps working and the worker gains no library access.'],
  ['SK-UC-25-E2', 'The worker send is refused (dormant brief). The real send error reaches Fishball, the message is not resent automatically and the skill grants no bypass of the send gate.'],
  // UC-26 — Fishball saves a useful pattern without interrupting Samuel (S1/S3–S8).
  ['SK-UC-26-M', 'Fishball decides on its own to create a valid skill. No approval or review card appears. Exactly one complete native document lands at <child home>/skills/<name>/SKILL.md, and the following list, read and load show it with no restart.'],
  ['SK-UC-26-A1', 'Samuel asks Fishball to remember a rule and Fishball creates the skill: same no-approval path and same result as SK-UC-26-M.'],
  ['SK-UC-26-A2', 'Fishball judges a detail one-off and makes no create call (judgment: no oracle on the choice). The library bytes are unchanged and no success is claimed.'],
  ['SK-UC-26-E1', 'Fishball sends a create whose content fails validation (whitespace-only description or empty body). The tool returns a clear validation error naming the field, writes nothing, and a corrected retry succeeds.'],
  ['SK-UC-26-E2', 'A create name holds a traversal or absolute path. The tool refuses it whatever Fishball intended, and no byte outside the owned skills root changes.'],
  // UC-27 — Samuel changes a rule and Fishball revises its experience (S2/S3/S4/S7/S8).
  ['SK-UC-27-M', 'Fishball updates an existing skill with a complete new version. The next load returns the new body, while text already in Fishball\'s or a worker\'s conversation is not rewritten.'],
  ['SK-UC-27-A1', 'Fishball "renames" by creating the new name, then removing the old one. Each call reports its own outcome, no atomic rename is claimed, and after both succeed only the new name resolves.'],
  ['SK-UC-27-A2', 'Fishball creates a name that already exists. The result is an explicit conflict, the existing document is byte-identical, and no silent overwrite or merge happens.'],
  ['SK-UC-27-A3', 'Fishball updates or removes a name that does not exist. The result is a clear not-found, the library is unchanged, and nothing is created as a side effect.'],
  ['SK-UC-27-E1', 'Fishball removes an existing skill. Later loads and lists do not resolve it, and already-delivered text stays where it is.'],
  ['SK-UC-27-E2', 'An update cannot complete. The tool reports the failure and its known outcome, leaves the old complete version loadable and does not claim the catalog changed.'],
  // UC-28 — a skill write fails without damaging the library (S4–S8).
  ['SK-UC-28-M', 'An update hits a filesystem fault before commit. The clear error names the update and says nothing was committed. The previous complete version stays loadable and byte-identical, and no approval flow appears.'],
  ['SK-UC-28-A1', 'A create hits a fault before commit. No loadable partial skill exists, native discovery finds no new skill, and a later create of the same name is not blocked by a leftover.'],
  ['SK-UC-28-A2', 'A write commits but the catalog refresh fails. The tool returns a distinct committed-but-not-refreshed outcome, an explicit reload then succeeds and shows the new state, and a retried create gets a conflict, not a duplicate.'],
  ['SK-UC-28-A3', 'A call is cancelled. Before commit, the prior state remains and the result says not committed. After commit, the committed state remains and is reported as committed, never as "aborted, nothing written".'],
  ['SK-UC-28-E1', 'Fishball tries an ordinary write, edit or shell command on the skills folder. It is still denied by read-only, with no approval offered, and the dedicated tool remains the only write path.'],
  ['SK-UC-28-E2', 'Two concurrent Fishball creates or updates target one name. Both settle; the final SKILL.md equals exactly one caller\'s complete document, never torn or mixed; each caller\'s result truthfully matches what happened to its write.'],
  // Lifecycle: the library is Fishball's own and survives restarts (S1/S7, SK-SEAM decision 2).
  ['SK-UC-LIFE-M', 'After the child restarts or the manager resumes, the dedicated tool is available again to the singleton manager only, and earlier committed skills list and load unchanged.'],
  ['SK-UC-LIFE-A1', 'On a fresh child with no skills folder yet, list returns an empty successful catalog and the first create makes the owned root and the skill.'],
  // No user UI obligation (S3/S8, SK-SEAM decision 3).
  ['SK-UC-UI-M', 'Samuel never has to view or approve a skill. No viewer, review or approval card appears for any of the six operations, and no tool result claims the native slash menu was refreshed.'],
]

perSdk('T-SK Use Cases', () => todoSk(USE_CASES))
