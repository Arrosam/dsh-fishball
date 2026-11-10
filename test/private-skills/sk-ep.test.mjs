/**
 * T-SK Equivalence Partitioning: EP-19 visibility, EP-20 operations and callers, EP-21 target and
 * format, EP-22 outcomes (docs/test-design/private-skills.md §3).
 *
 * Two kinds of case, each once per SDK:
 * - `SK-EP-*` todo: needs the SK implementation (owner SK).
 * - `SK-EP-*-N` executable native-oracle premise: proves, from the installed SDK's own public
 *   provider, what a partition's fixture means natively (loadable, ignored, or an actual escape),
 *   so the SK oracle is not invented. These read only disposable /private/tmp fixtures.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'
import { FIXTURE, KEYS, LAYOUT, SAMPLE } from './support/constants.mjs'
import { perSdk, placeSkill, placeSymlinkedDirectory, placeSymlinkedSkill, skillDocument, skillWorkspace, todoSk } from './support/fixtures.mjs'
import { loadSdk, nativeLibrary } from './support/native-oracle.mjs'

const EP_19 = [
  ['SK-EP-19-01', 'Partition: Fishball\'s own private skill. Expect: Fishball\'s list, read and load return it while ordinary tools stay read-only.'],
  ['SK-EP-19-02', 'Partition: main-home sources (~/.dsh/skills, ~/.agents/skills, main project .dsh/skills and .agents/skills, main customSkillDirs), each holding a uniquely named skill. Expect: none appear in Fishball\'s list, load or model catalog.'],
  ['SK-EP-19-03', 'Partition: a name collision, where main ~/.dsh/skills has the same name as a private skill. Expect: Fishball loads the private body, never the main one (main sources are absent).'],
  ['SK-EP-19-04', 'Partition: DSH bundled/preset skills and child-profile plugin skills. Expect: no presence or absence assertion (Q6). If one collides with a private name, native precedence decides; the private library itself is unaltered.'],
  ['SK-EP-19-05', 'Partition: absent name. Expect: read/load return a clear not-found; no fallback to main home or any other root.'],
  ['SK-EP-19-06', 'Partition: worker caller, native subagent or managed worker session. Expect: the private skill is absent from its catalog and it has no list/read/load/mutate path through the dedicated tool.'],
  ['SK-EP-19-07', 'Partition: worker with its own same-named skill. Expect: the worker\'s own skill is untouched; Fishball\'s handoff carries Fishball\'s content, not a name.'],
]

const EP_20 = [
  ['SK-EP-20-01', 'Partition: list by the manager. Expect: a successful catalog of exactly the valid private skills, with no write, approval or side effect.'],
  ['SK-EP-20-02', 'Partition: read by the manager. Expect: the selected skill\'s complete current document or body; nothing is written.'],
  ['SK-EP-20-03', 'Partition: create of a valid new skill. Expect: one complete native document is published with no approval, and native load finds it afterwards.'],
  ['SK-EP-20-04', 'Partition: update of an existing skill. Expect: a complete new version is published, and the next load returns it.'],
  ['SK-EP-20-05', 'Partition: remove of an existing skill. Expect: future list and load do not resolve it; the root and other skills are unchanged.'],
  ['SK-EP-20-06', 'Partition: reload. Expect: invalidation, then a fresh complete manager-scoped catalog. The result reports success only if the catalog is complete.'],
  ['SK-EP-20-07', 'Partition: ordinary write/edit/delete/move/shell aimed at the skills root. Expect: read-only refusal, no approval offered and no byte changed.'],
  ['SK-EP-20-08', 'Partition: a non-manager caller (worker, side agent, nested dispatch from a worker) invoking any of the six operations. Expect: refused before any read or write.'],
  ['SK-EP-20-09', 'Partition: an attempt to widen permissions (/permission workspace-write, danger-full-access, a saved setting, a denied-retry escalation). Expect: effective read-only is unchanged and the dedicated tool still works only on its own root.'],
  ['SK-EP-20-10', 'Partition: an input carrying a root, path, command or extra file. Expect: refused or unsupported. The tool takes a name and a document only and has no ancillary-file writer.'],
]

const EP_21 = [
  ['SK-EP-21-01', 'Partition: valid bundle (kebab name, nonempty trimmed description, nonempty body, directory equals name). Expect: accepted, and the stored bytes load natively with the same name, description and body.'],
  ['SK-EP-21-02', 'Partition: absolute path as name (e.g. /Users/x/.dsh/skills/a). Expect: refused before any path use; no outside byte read or written.'],
  ['SK-EP-21-03', 'Partition: traversal (../a, a/../../b, ..). Expect: refused; nothing outside the root is touched.'],
  ['SK-EP-21-04', 'Partition: sibling prefix (skills-evil/a, ../skills2/a). Expect: refused; a sibling directory named skills* is unchanged.'],
  ['SK-EP-21-05', 'Partition: separators or aliases (a/b, a\\b, ., a%2Fb, a/, a NUL byte). Expect: refused by the grammar before any filesystem call.'],
  ['SK-EP-21-06', 'Partition: escaping symlink, <root>/<name>/SKILL.md linked outside (bypass fixture). Expect: list, read and load refuse it BEFORE reading the target; the foreign marker never appears in a result, catalog or model input; update and remove leave the target byte-identical.'],
  ['SK-EP-21-07', 'Partition: escaping directory symlink, <root>/<name> linked outside (bypass fixture). Expect: same as SK-EP-21-06; remove does not delete the link target\'s contents.'],
  ['SK-EP-21-08', 'Partition: missing front matter or no closing ---. Expect: create/update refused with a validation error; the prior version is intact.'],
  ['SK-EP-21-09', 'Partition: missing or non-string name/description. Expect: refused with a validation error.'],
  ['SK-EP-21-10', 'Partition: front-matter name differs from the target name. Expect: refused; no mismatched pair is published.'],
  ['SK-EP-21-11', 'Partition: disable-model-invocation: true. Expect: refused (S6 keeps skills model-loadable). Absent or false is accepted.'],
  ['SK-EP-21-12', 'Partition: legacy camelCase invocation keys (disableModelInvocation, modelInvocable, userInvocable). Expect: refused (S6 uses DSH spellings), not silently translated.'],
  ['SK-EP-21-13', 'Partition: whitespace-only description. Expect: refused with a validation error naming description (Q4: trim, then require nonempty).'],
  ['SK-EP-21-14', 'Partition: empty or whitespace-only body. Expect: refused with a validation error naming the body (Q3).'],
  ['SK-EP-21-15', 'Partition: input that is not valid UTF-8 or YAML (e.g. an unparseable front matter). Expect: refused; the prior version is intact.'],
  ['SK-EP-21-16', 'Partition: YAML-significant text in description or body (colon, #, a line that looks like a key, a repeated --- in the body). Expect: stored so that native load returns exactly the given description and body, with no injected key and no truncation.'],
  ['SK-EP-21-17', 'Partition: bypass-only document shapes (hand-corrupted, name-mismatched or non-regular SKILL.md, stray files, hardlink). Expect: "it is what it is" (Q1). Only safety is asserted: no escaping read, nothing outside written, and the manager and tool stay usable.'],
]

const EP_22 = [
  ['SK-EP-22-01', 'Partition: mutation committed and refresh succeeded. Expect: a success naming the operation and skill; the next list/load reflects it.'],
  ['SK-EP-22-02', 'Partition: failure before commit (I/O or permission error). Expect: an error naming the operation and "not committed"; the prior complete state is byte-identical.'],
  ['SK-EP-22-03', 'Partition: interrupted or cancelled. Expect: either the complete prior state or the complete new state, reported truthfully, never truncated YAML or Markdown.'],
  ['SK-EP-22-04', 'Partition: committed but refresh failed. Expect: a distinct committed-not-refreshed outcome, not "write failed" and not plain success. The file is complete, and a later reload converges.'],
  ['SK-EP-22-05', 'Partition: semantic situations (user rejection, secret or PII, duplicate, stale or contradictory note). Expect: Fishball decides (S8). There is no scanner, approval or merge policy, and any write it does make is still confined and complete.'],
  ['SK-EP-22-06', 'Partition: not-found for update/remove (Q5). Expect: a clear not-found; nothing created or changed.'],
  ['SK-EP-22-07', 'Partition: create conflict on an existing name. Expect: an explicit conflict; the existing bytes are unchanged.'],
]

perSdk('T-SK EP (SK-owned)', () => todoSk([...EP_19, ...EP_20, ...EP_21, ...EP_22]))

perSdk('T-SK EP native-oracle premises', (version) => {
  it('SK-EP-21-01-N an S6 directory bundle is native-loadable with exact name, description and body', async (t) => {
    const { root } = await skillWorkspace(t)
    await placeSkill(root, SAMPLE.name, skillDocument(SAMPLE))
    const { complete, skills } = await nativeLibrary(version, root)
    assert.equal(complete, true)
    assert.equal(skills.length, 1)
    assert.equal(skills[0].name, SAMPLE.name)
    assert.equal(skills[0].description, SAMPLE.description)
    assert.equal(skills[0].content, SAMPLE.body)
    assert.equal(skills[0].invocation.modelInvocable, true, 'S6: absent disable-model-invocation stays model-loadable')
  })

  it('SK-EP-21-08-N natively, a document without front matter or without a closing delimiter is ignored, not loaded', async (t) => {
    const { root } = await skillWorkspace(t)
    await placeSkill(root, 'no-frontmatter', SAMPLE.body)
    await placeSkill(root, 'unclosed', [LAYOUT.frontmatter, `name: unclosed`, `description: d`, SAMPLE.body].join('\n'))
    const { skills } = await nativeLibrary(version, root)
    assert.deepEqual(skills, [])
  })

  it('SK-EP-21-09-N natively, a missing name or description makes the document unloadable', async (t) => {
    const { root } = await skillWorkspace(t)
    await placeSkill(root, 'no-name', skillDocument({ description: SAMPLE.description, body: SAMPLE.body }))
    await placeSkill(root, 'no-description', skillDocument({ name: 'no-description', body: SAMPLE.body }))
    const { skills } = await nativeLibrary(version, root)
    assert.deepEqual(skills, [])
  })

  it('SK-EP-21-10-N natively, discovery does NOT enforce directory/name equality, so the tool must (S6)', async (t) => {
    const { root } = await skillWorkspace(t)
    await placeSkill(root, FIXTURE.mismatchDirectory, skillDocument({ ...SAMPLE, name: FIXTURE.mismatchDocument }))
    const { skills } = await nativeLibrary(version, root)
    // Native loads it under the front-matter name: the mismatch is invisible to native discovery.
    assert.deepEqual(skills.map((skill) => skill.name), [FIXTURE.mismatchDocument])
  })

  it('SK-EP-21-11-N natively, disable-model-invocation true hides the skill from the model; absent or false keeps it', async (t) => {
    const { root } = await skillWorkspace(t)
    const { isModelInvocable } = await loadSdk(version)
    await placeSkill(root, 'disabled', skillDocument({ ...SAMPLE, name: 'disabled', extra: { [KEYS.disableModel]: true } }))
    await placeSkill(root, 'enabled', skillDocument({ ...SAMPLE, name: 'enabled', extra: { [KEYS.disableModel]: false } }))
    const { skills } = await nativeLibrary(version, root)
    const byName = Object.fromEntries(skills.map((skill) => [skill.name, isModelInvocable(skill)]))
    assert.deepEqual(byName, { disabled: false, enabled: true })
  })

  it('SK-EP-21-12-N natively, each legacy camelCase invocation key makes the document unloadable', async (t) => {
    const { root } = await skillWorkspace(t)
    for (const key of KEYS.legacy) {
      const name = key.toLowerCase()
      await placeSkill(root, name, skillDocument({ ...SAMPLE, name, extra: { [key]: false } }))
    }
    const { skills } = await nativeLibrary(version, root)
    assert.deepEqual(skills, [])
  })

  it('SK-EP-21-13-N natively, a whitespace-only description is accepted, so Q4 makes the tool stricter than native', async (t) => {
    const { root } = await skillWorkspace(t)
    await placeSkill(root, SAMPLE.name, skillDocument({ ...SAMPLE, description: FIXTURE.blankDescription }))
    const { skills } = await nativeLibrary(version, root)
    assert.deepEqual(skills.map((skill) => skill.description), [FIXTURE.blankDescription])
  })

  it('SK-EP-21-14-N natively, an empty body is accepted, so Q3 makes the tool stricter than native', async (t) => {
    const { root } = await skillWorkspace(t)
    await placeSkill(root, SAMPLE.name, skillDocument({ ...SAMPLE, body: FIXTURE.emptyBody }))
    const { skills } = await nativeLibrary(version, root)
    assert.deepEqual(skills.map((skill) => skill.content), [FIXTURE.emptyBody])
  })

  it('SK-EP-21-16-N the YAML-significant fixture round-trips natively when quoted, so the tool has a lossless target', async (t) => {
    const { root } = await skillWorkspace(t)
    await placeSkill(root, SAMPLE.name, skillDocument({ ...SAMPLE, description: FIXTURE.trickyDescription, body: FIXTURE.trickyBody }))
    const [skill] = (await nativeLibrary(version, root)).skills
    assert.equal(skill.description, FIXTURE.trickyDescription)
    assert.equal(skill.content, FIXTURE.trickyBody)
    assert.equal(skill.invocation.modelInvocable, true, 'the description text did not inject a key')
  })

  it('SK-EP-21-06-N fixture validity: the STOCK reader follows an escaping file symlink, so SK-EP-21-06 is a real escape', async (t) => {
    const { root, outside } = await skillWorkspace(t)
    const foreign = path.join(outside, LAYOUT.file)
    await writeFile(foreign, skillDocument({ name: FIXTURE.leak, description: SAMPLE.description, body: FIXTURE.leakMarker }))
    await placeSymlinkedSkill(root, FIXTURE.leak, foreign)
    const { skills } = await nativeLibrary(version, root)
    // Decision 1 exists because of this: the confined reader must refuse before this read happens.
    assert.ok(skills.some((skill) => skill.content.includes(FIXTURE.leakMarker)))
  })

  it('SK-EP-21-07-N fixture validity: the STOCK reader follows an escaping directory symlink', async (t) => {
    const { root, outside } = await skillWorkspace(t)
    const foreignDir = path.join(outside, FIXTURE.leak)
    await mkdir(foreignDir)
    await writeFile(path.join(foreignDir, LAYOUT.file), skillDocument({ name: FIXTURE.leak, description: SAMPLE.description, body: FIXTURE.leakMarker }))
    await placeSymlinkedDirectory(root, FIXTURE.leak, foreignDir)
    const { skills } = await nativeLibrary(version, root)
    assert.ok(skills.some((skill) => skill.content.includes(FIXTURE.leakMarker)))
  })

  it('SK-EP-19-02-N a single-root native composition does not scan main homes passed to it', async (t) => {
    const { base, root } = await skillWorkspace(t)
    const mainDsh = path.join(base, 'main-dsh')
    const mainAgents = path.join(base, 'main-agents')
    await placeSkill(path.join(mainDsh, LAYOUT.root), FIXTURE.mainDsh, skillDocument({ ...SAMPLE, name: FIXTURE.mainDsh }))
    await placeSkill(path.join(mainAgents, LAYOUT.root), FIXTURE.mainAgents, skillDocument({ ...SAMPLE, name: FIXTURE.mainAgents }))
    await placeSkill(root, FIXTURE.privateSkill, skillDocument({ ...SAMPLE, name: FIXTURE.privateSkill }))
    const { skills } = await nativeLibrary(version, root, { dshHome: mainDsh, agentsHome: mainAgents })
    assert.deepEqual(skills.map((skill) => skill.name), [FIXTURE.privateSkill])
  })
})
