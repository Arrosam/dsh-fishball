/**
 * Round-2 BUG 1, decision A — the child starts with a private @deepseek-ai copy in its profile.
 *
 * Requirement (the user's decision, 2026-11-11: "用A吧，不管这些，插件怎么样就怎么样，如果炸了启动不了就
 * 启动不了。As it is."):
 * - C1 a `@deepseek-ai/*` package copy in the child profile
 *   (<mainHome>/fishball/runtime/dsh-home/profiles/fishball/node_modules/@deepseek-ai/<name>, usually a
 *   plugin's dependency pnpm hoisted there, e.g. @deepseek-ai/schemastery from dsh-idle-compact@0.3.0)
 *   no longer refuses the start; PREFLIGHT_CORE_SHADOW is never reported; the row reaches 'ready'
 *   (status {state:'ready', code:null, detail:null}).
 * - C2 nothing clever is required: whatever DSH then does with the copy is accepted. A boot that then
 *   fails surfaces as state 'failed', code NATIVE_START_FAILED and a detail naming the specific cause,
 *   never PREFLIGHT_CORE_SHADOW. A valid compatible copy (a real copy of the SDK's own schemastery,
 *   same version) must give 'ready'.
 * - C3 the other preflight refusals still refuse (here: an invalid dependency package.json →
 *   PREFLIGHT_MANIFEST; a dependency linked outside the runtime and installation → PREFLIGHT_LINK).
 *
 * Observation: a REAL DSH boot of the main profile (support/host.mjs) per SDK selected by
 * FBTEST_DSH_RUNTIME, a real child start, the status routes and lifecycle.log. The child profile
 * only exists after a first start, so every plant follows a first ready boot and a main restart.
 * Copies are real copies of the selected SDK's own packages (same files, same version). The hoisted
 * partition is a real offline `pnpm add` of a local fixture plugin (support/fixtures/
 * fbtest-core-copy-plugin) that depends on @deepseek-ai/schemastery; a pnpm hook points that
 * dependency and its own dependencies at local copies of the SDK packages, so no registry is asked.
 * The nested partition (a copy under the installed plugin's own node_modules) cannot be produced by
 * pnpm's hoisted linker with one version, so it is planted by hand on top of that install.
 *
 * | id | technique | requirement | expected |
 * |----|-----------|-------------|----------|
 * | R4-EP-01 | EP (top-level scoped copy, valid compatible: schemastery) | C1, C2 | ready / null / null; no PREFLIGHT_CORE_SHADOW anywhere |
 * | R4-ST-01 | State Transition ready → plant → restart → ready, then two more restarts → ready each | C1 | every later start stays ready (the e2e symptom refused every later start) |
 * | R4-EP-02 | EP (top-level copy of the framework: @deepseek-ai/cordis) | C1, C2 | ready, or failed / NATIVE_START_FAILED / specific detail; never PREFLIGHT_CORE_SHADOW |
 * | R4-EP-03 | EP (top-level @deepseek-ai/dsh-* copy: dsh-home-paths) | C1, C2 | as R4-EP-02 |
 * | R4-EP-04 | EP (manifest-only copy, foreign version: the round-2 e2e plant) | C1, C2 | as R4-EP-02 |
 * | R4-UC-01 | Use Case (real offline pnpm install; hoisted @deepseek-ai/schemastery) | C1, C2 | the copy sits at the top-level slot; ready / null / null |
 * | R4-EP-05 | EP (nested copy under the installed plugin's node_modules) | C1, C2 | ready / null / null |
 * | R4-DT-01 | DT (fault × outcome): invalid dependency manifest / external link | C3 | failed / NATIVE_START_FAILED / detail 'PREFLIGHT_MANIFEST: …' / 'PREFLIGHT_LINK: …' |
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { RUNTIME, SUPPORT } from './support/constants.mjs'
import { bootHost, newHome } from './support/host.mjs'
import {
  R2, R2_BUDGET, bootAfterFault, childProfileDir, copySdkPackage, lifecycleLines, plantInvalidManifest,
  plantProfilePackage, removeHome, selectedSdk, settledStatus,
} from './support/v2-r2.mjs'

const SDK = selectedSdk(RUNTIME)
const R4 = Object.freeze({
  retired: R2.retiredCoreShadow,
  linkCode: 'PREFLIGHT_LINK',
  scope: '@deepseek-ai',
  /** EP representatives of the copy's name (C1's partitions). */
  copies: Object.freeze({
    schemastery: '@deepseek-ai/schemastery',
    cordis: '@deepseek-ai/cordis',
    dshPackage: '@deepseek-ai/dsh-home-paths',
  }),
  /** The round-2 e2e plant: a manifest only, with a version the SDK never shipped. */
  foreignManifest: Object.freeze({ name: '@deepseek-ai/schemastery', version: '0.0.0-fbtest-shadow' }),
  /** Main restarts after the plant in R4-ST-01. */
  laterStarts: 2,
  plugin: Object.freeze({ name: 'fbtest-core-copy-plugin', dir: path.join(SUPPORT, 'fixtures', 'fbtest-core-copy-plugin') }),
  pnpmfile: path.join(SUPPORT, 'fixtures', 'fbtest-core-copy.pnpmfile.cjs'),
  pnpm: '/opt/homebrew/bin/pnpm',
  /** Every pnpm input that could reach a registry or a user's config is replaced (HARD RULE: no network). */
  pnpmEnv: Object.freeze({ registry: 'http://127.0.0.1:9/', stageVar: 'FBTEST_CORE_COPY_STAGE', npmrc: 'empty.npmrc', basePath: '/opt/homebrew/bin:/usr/bin:/bin', store: 'store', cache: 'cache' }),
  /** Throwaway homes for the staged SDK copies and pnpm's own home/store (no user config is read). */
  scratch: Object.freeze({ stage: 'stage', pnpm: 'pnpm-home' }),
  pnpmArgs: Object.freeze(['--offline', '--ignore-scripts']),
  linkTarget: 'fbtest-outside-dep',
  linkSlot: 'fbtest-external-link',
})
const ready = Object.freeze({ state: R2.state.ready, code: null, detail: null })
const pick = (answer) => ({ state: answer?.state, code: answer?.code, detail: answer?.detail })
const scopeSlot = (name) => [R2.modules, ...name.split('/')]

const homes = []
after(() => { for (const home of homes.splice(0)) removeHome(home) })
const home = (label) => { const h = newHome('v2-r4-' + label); homes.push(h); return h }

/** Neither status route nor any lifecycle line ever names the retired core-shadow code (C1). */
async function assertNoCoreShadow(host, homeDir, why) {
  for (const route of [R2.route.status, R2.route.nativeStatus]) {
    const text = (await host.get(route)).text
    assert.equal(text.includes(R4.retired), false, why + ': ' + route + ' never names ' + R4.retired + ': ' + text)
  }
  const named = lifecycleLines(homeDir).filter((line) => line.raw.includes(R4.retired))
  assert.deepEqual(named.map((l) => l.raw), [], why + ': no lifecycle line names ' + R4.retired)
}

/** C1 + C2 for a valid compatible copy: exactly ready / null / null on both routes. */
async function assertReadyWithCopy(host, homeDir, why) {
  const status = await settledStatus(host)
  assert.deepEqual(pick(status), ready, why + ': status is ready with no code and no detail, got ' + JSON.stringify(status))
  const native = (await host.get(R2.route.nativeStatus)).json
  assert.equal(native?.state, R2.state.ready, why + ': native/status ready, got ' + JSON.stringify(native))
  await assertNoCoreShadow(host, homeDir, why)
}

/**
 * C2 for a copy whose effect on DSH is not specified: the start settles; ready is clean, or failed
 * goes through the existing failure path with a specific cause that is never the retired code.
 * Returns the observed outcome (reported as a diagnostic; a failed boot is not a test failure here).
 */
async function assertAcceptedAsItIs(host, homeDir, why) {
  const status = await settledStatus(host)
  if (status.state === R2.state.ready) assert.deepEqual(pick(status), ready, why + ': a ready start has no code and no detail')
  else {
    assert.equal(status.state, R2.state.failed, why + ': settles failed if not ready')
    assert.equal(status.code, R2.code.startFailed, why + ': the existing failure path keeps NATIVE_START_FAILED')
    const match = R2.detailShape.exec(String(status.detail))
    assert.ok(match, why + ': the detail names the specific cause: ' + JSON.stringify(status.detail))
    assert.notEqual(match[1], R4.retired, why + ': the specific cause is never ' + R4.retired)
    const failedLine = lifecycleLines(homeDir).filter((line) => line.json.code === R2.lifecycle.failed).at(-1)
    assert.equal(failedLine?.json.reason, match[1], why + ': the lifecycle FAILED reason is the same specific code')
  }
  await assertNoCoreShadow(host, homeDir, why)
  return pick(status)
}

/** The selected SDK package `name` and every dependency it needs, copied under `stageDir` ({name: dir}). */
function stageSdkClosure(stageDir, name, staged = {}) {
  if (staged[name]) return staged
  const source = path.join(RUNTIME, name)
  staged[name] = path.join(stageDir, name)
  fs.cpSync(source, staged[name], { recursive: true })
  const manifest = JSON.parse(fs.readFileSync(path.join(source, R2.manifestFile), 'utf8'))
  for (const dependency of Object.keys(manifest.dependencies ?? {})) stageSdkClosure(stageDir, dependency, staged)
  return staged
}

/** Real offline `pnpm add` of the fixture plugin into the child profile (its pnpm-workspace.yaml: hoisted linker). */
function pnpmAddPlugin(homeDir) {
  const stageDir = home(R4.scratch.stage)
  const scratch = home(R4.scratch.pnpm)
  fs.writeFileSync(path.join(scratch, R4.pnpmEnv.npmrc), '')
  const staged = stageSdkClosure(stageDir, R4.copies.schemastery)
  const result = spawnSync(R4.pnpm, ['add', 'file:' + R4.plugin.dir, ...R4.pnpmArgs, '--pnpmfile=' + R4.pnpmfile, '--store-dir=' + path.join(scratch, R4.pnpmEnv.store), '--cache-dir=' + path.join(scratch, R4.pnpmEnv.cache)], {
    cwd: childProfileDir(homeDir),
    encoding: 'utf8',
    env: {
      PATH: R4.pnpmEnv.basePath, HOME: scratch, XDG_CONFIG_HOME: scratch, XDG_CACHE_HOME: scratch, XDG_DATA_HOME: scratch, XDG_STATE_HOME: scratch,
      TMPDIR: process.env.TMPDIR ?? scratch, NPM_CONFIG_USERCONFIG: path.join(scratch, R4.pnpmEnv.npmrc), npm_config_registry: R4.pnpmEnv.registry,
      [R4.pnpmEnv.stageVar]: JSON.stringify(staged),
    },
  })
  assert.equal(result.status, 0, 'offline pnpm add of the fixture plugin: ' + result.stdout + result.stderr)
}

describe(`R4 [${SDK}] decision A: the child starts with a private @deepseek-ai copy`, { timeout: R2_BUDGET.caseMs * 8 }, () => {
  it('R4-EP-01 + R4-ST-01 a real copy of the SDK\'s own @deepseek-ai/schemastery at the top-level profile slot: ready, and every later start stays ready', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const h = home('schemastery')
    const { host } = await bootAfterFault(t, h, (dir) => copySdkPackage(dir, R4.copies.schemastery, scopeSlot(R4.copies.schemastery)))
    await assertReadyWithCopy(host, h, 'R4-EP-01 first start after the plant')
    await host.stop()
    for (let start = 1; start <= R4.laterStarts; start++) {
      const again = await bootHost(h)
      t.after(async () => { await again.stop().catch(() => {}) })
      try { await assertReadyWithCopy(again, h, 'R4-ST-01 later start ' + start) } finally { await again.stop() }
    }
  })

  for (const [id, label, name] of [['R4-EP-02', 'cordis', R4.copies.cordis], ['R4-EP-03', 'dsh-pkg', R4.copies.dshPackage]]) {
    it(id + ' a real copy of the SDK\'s own ' + name + ' at the top-level profile slot is accepted as it is', { timeout: R2_BUDGET.caseMs }, async (t) => {
      const h = home(label)
      const { host } = await bootAfterFault(t, h, (dir) => copySdkPackage(dir, name, scopeSlot(name)))
      const outcome = await assertAcceptedAsItIs(host, h, id)
      t.diagnostic(id + ' outcome: ' + JSON.stringify(outcome))
    })
  }

  it('R4-EP-04 a manifest-only @deepseek-ai/schemastery with a foreign version (the round-2 e2e plant) is accepted as it is', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const h = home('foreign')
    const { host } = await bootAfterFault(t, h, (dir) => plantProfilePackage(dir, scopeSlot(R4.foreignManifest.name), JSON.stringify(R4.foreignManifest)))
    const outcome = await assertAcceptedAsItIs(host, h, 'R4-EP-04')
    t.diagnostic('R4-EP-04 outcome: ' + JSON.stringify(outcome))
  })

  it('R4-UC-01 + R4-EP-05 a plugin installed by real offline pnpm hoists @deepseek-ai/schemastery: ready; then a nested copy under that plugin: ready', { timeout: R2_BUDGET.caseMs, skip: fs.existsSync(R4.pnpm) ? false : 'no pnpm at ' + R4.pnpm }, async (t) => {
    const h = home('pnpm-hoisted')
    const { host } = await bootAfterFault(t, h, pnpmAddPlugin)
    const hoisted = path.join(childProfileDir(h), ...scopeSlot(R4.copies.schemastery))
    const sdkVersion = JSON.parse(fs.readFileSync(path.join(RUNTIME, R4.copies.schemastery, R2.manifestFile), 'utf8')).version
    assert.equal(JSON.parse(fs.readFileSync(path.join(hoisted, R2.manifestFile), 'utf8')).version, sdkVersion, 'precondition: pnpm hoisted the SDK-version copy to the top-level profile slot')
    assert.equal(fs.lstatSync(hoisted).isSymbolicLink(), false, 'precondition: the hoisted slot is a copy, not a link')
    await assertReadyWithCopy(host, h, 'R4-UC-01')
    await host.stop()
    // R4-EP-05: the same copy also nested under the installed plugin (planted by hand, see header).
    copySdkPackage(h, R4.copies.schemastery, [R2.modules, R4.plugin.name, ...scopeSlot(R4.copies.schemastery)])
    const nested = await bootHost(h)
    t.after(async () => { await nested.stop().catch(() => {}) })
    await assertReadyWithCopy(nested, h, 'R4-EP-05')
  })

  // C3, decision table: each remaining refusal × the expected specific code. Both sit next to an
  // @deepseek-ai copy that is accepted, so the copy is never what decides the outcome.
  const refusals = [
    { id: 'R4-DT-01a', label: 'bad-manifest', code: R2.faultCode, fault: plantInvalidManifest },
    {
      id: 'R4-DT-01b', label: 'ext-link', code: R4.linkCode,
      fault: (dir) => {
        const target = home(R4.linkTarget)
        fs.writeFileSync(path.join(target, R2.manifestFile), JSON.stringify({ name: R4.linkSlot, version: R4.foreignManifest.version }))
        fs.mkdirSync(path.join(childProfileDir(dir), R2.modules), { recursive: true })
        const slot = path.join(childProfileDir(dir), R2.modules, R4.linkSlot)
        fs.symlinkSync(target, slot, 'dir')
        return () => fs.rmSync(slot, { force: true })
      },
    },
  ]
  for (const rule of refusals) {
    it(rule.id + ' C3: ' + rule.code + ' still refuses the start (next to an accepted @deepseek-ai copy)', { timeout: R2_BUDGET.caseMs }, async (t) => {
      const h = home(rule.label)
      const { host } = await bootAfterFault(t, h, (dir) => {
        copySdkPackage(dir, R4.copies.schemastery, scopeSlot(R4.copies.schemastery))
        return rule.fault(dir)
      })
      const status = await settledStatus(host)
      assert.equal(status.state, R2.state.failed, rule.id + ': refused, got ' + JSON.stringify(status))
      assert.equal(status.code, R2.code.startFailed, rule.id + ': NATIVE_START_FAILED')
      const match = R2.detailShape.exec(String(status.detail))
      assert.ok(match, rule.id + ': detail "<CODE>: <line>": ' + JSON.stringify(status.detail))
      assert.equal(match[1], rule.code, rule.id + ': the specific refusal: ' + status.detail)
      await assertNoCoreShadow(host, h, rule.id)
    })
  }
})
