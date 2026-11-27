/** Ports the supported D2, R2, and R4 startup regressions to the current instance routes. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { SDK } from '@dsh-instance/test-helpers/constants'
import { json, wordsOf } from '@dsh-instance/test-helpers/page'
import { findAll } from '@dsh-instance/test-helpers/react-shim'
import { gate } from '@dsh-instance/test-helpers/wait'
import { HOOK } from '../pages/constants.mjs'
import { openSettings } from '../pages/open.mjs'
import { MANIFEST } from '../placement/constants.mjs'
import { childProfile, fakeFishball, useFishballRepo, writeFile } from '../placement/subject.mjs'
import { ROW as SUPPORT_ROW } from '../support/constants.mjs'
import { K3, RECORD, ROUTE, ROW } from './constants.mjs'
import { LAUNCH, lifecycle, nativeLaunchWorld, startOnReady, startWarns, statusRoutes } from './launch-world.mjs'
import { rowWorld } from './row-world.mjs'
import { homeOf, load, scopeOf } from './worlds.mjs'

const DETAIL = Object.freeze({
  limit: 2000,
  separator: ': ',
  redacted: '[redacted]',
  publicText: 'fbtest readable reason',
  credentialUrl: 'https://fbtest-user:fbtest-launch-private-value@fbtest.example/diagnostic',
  publicUrlTail: 'fbtest.example/diagnostic',
  homes: Object.freeze(['/Users/fbtest-person/private', '/home/fbtest-person/private', '/root/fbtest-private']),
  secondLine: 'FBTEST-SECOND-LINE-MARKER',
  wide: '🟢',
})
const FIXTURE = Object.freeze({
  dependency: 'fbtest-malformed-dependency',
  brokenJson: '{',
  childTransitions: Object.freeze(['START', 'READY', 'CHILD_BOOT', 'CHILD_LISTEN', 'CHILD_READY']),
  copy: Object.freeze({ en: /canonical real path.*symlink.*\/private\/tmp/i, zh: /真实路径.*符号链接.*\/private\/tmp/ }),
})
const codedError = (code, message) => Object.assign(new Error(message), { code })

function assertStatus(value, state, code = null, detail = null) {
  assert.deepEqual({ state: value.state, code: value.code, detail: value.detail }, { state, code, detail })
}

function assertWarns(world, ...reasons) {
  assert.deepEqual(startWarns(world.logs), reasons.map(reason => [LAUNCH.startWarn, reason]))
}

function assertFailureLog(home, ...reasons) {
  const failures = lifecycle(home).filter(line => line.code === LAUNCH.lifecycleFailed)
  assert.deepEqual(failures.map(({ time, ...entry }) => {
    assert.ok(Number.isFinite(Date.parse(time)), 'every lifecycle warning has a timestamp')
    return entry
  }), reasons.map(reason => ({ code: LAUNCH.lifecycleFailed, reason })), 'only the specific code is logged, no detail or path')
}

async function assertHomeCopy(t, sdk, status) {
  for (const [lang, expected] of Object.entries(FIXTURE.copy)) {
    const world = { respond: ({ path }) => path === ROUTE.status ? json(status) : new Response(null, { status: 404 }) }
    const { page, tree } = await openSettings(t, sdk, { lang, world })
    const [card] = findAll(tree(), node => node.props[HOOK.state] === K3.state.failed)
    assert.ok(card, 'failed status card is rendered')
    assert.match(wordsOf(card), expected, lang + ': tell the owner to use a real path, not a symlink')
    assert.deepEqual(page.errors, [])
  }
}

/** The real row's startup seam; the child callback can run before the start promise rejects. */
function holdExitDuringStart(owner) {
  const entered = gate()
  const rejection = gate()
  const start = owner.start.bind(owner)
  owner.start = async () => {
    owner.start = start
    entered.open()
    const error = await rejection.promise
    if (error) throw error
    return start()
  }
  return {
    entered: entered.promise,
    exit: () => owner.options.onExit(),
    reject: () => rejection.open(codedError(LAUNCH.childExited, LAUNCH.childExited)),
    release: rejection.open,
  }
}

eachSdk((sdk) => {
  caseTest(sdk, 'D2-DT-01', 'alias vs real path', 'the real startup rejects a symlinked home before spawning; its canonical path reaches spawn, and the card explains the refusal in English and Chinese', async (t) => {
    const { home: alias, base } = homeOf(t, 'alias')
    const real = fs.realpathSync(alias)
    assert.notEqual(alias, real)
    useFishballRepo(scopeOf(t), fakeFishball(base).repo)

    const refused = await nativeLaunchWorld(t, sdk, alias)
    const failed = await refused.start()
    assert.equal(failed.state, K3.state.failed)
    assert.equal(failed.code, ROW.invalidHome)
    assert.deepEqual(refused.spawns, [])
    assert.equal(fs.existsSync(path.join(real, RECORD.dir)), false, 'refusal writes nothing under the aliased home')
    assert.deepEqual(lifecycle(real), [])
    assertWarns(refused, ROW.invalidHome)
    await assertHomeCopy(t, sdk, failed)
    await refused.dispose()

    // Same directory, SDK and spawn observer: only the spelling of DSH_HOME changes.
    const canonical = await nativeLaunchWorld(t, sdk, real)
    const accepted = await canonical.start()
    assertStatus(accepted, K3.state.failed, LAUNCH.startFailed, LAUNCH.spawnObserved)
    assert.equal(canonical.spawns.length, 1, 'the real path reached the child spawn boundary')
  })

  caseTest(sdk, 'R2-UC-01', 'bad dependency manifest', 'real preflight reports its specific startup cause through status and Retry and logs only the failure identifier', async (t) => {
    const { home } = homeOf(t, 'canonical')
    // Seed an owned layout first; creating the profile via mkdir -p would itself be refused.
    const { prepareLayout } = await load(sdk, 'files')
    await prepareLayout(home)
    writeFile(path.join(childProfile(home), SDK.nodeModules, FIXTURE.dependency, MANIFEST), FIXTURE.brokenJson)
    const world = await nativeLaunchWorld(t, sdk, home)
    const failed = await world.start()
    assert.equal(failed.state, K3.state.failed)
    assert.equal(failed.code, LAUNCH.startFailed)
    assert.ok(failed.detail.startsWith(LAUNCH.preflightManifest + DETAIL.separator))
    assert.ok(failed.detail.length > (LAUNCH.preflightManifest + DETAIL.separator).length)
    assert.deepEqual(await world.retry(), failed, 'Retry while the same fault persists has the same public answer')
    assert.deepEqual(await world.status(), failed)
    assert.deepEqual(world.spawns, [])
    assert.deepEqual(lifecycle(home).filter(({ code }) => FIXTURE.childTransitions.includes(code)), [])
    assertFailureLog(home, LAUNCH.preflightManifest, LAUNCH.preflightManifest)
    assertWarns(world, LAUNCH.preflightManifest, LAUNCH.preflightManifest)
  })

  caseTest(sdk, 'R2-BVA-01', 'bounded private detail', 'status and Retry publish one sanitized line of at most 2000 code points; successful Retry clears it', async (t) => {
    const { home } = homeOf(t, 'canonical')
    const world = await rowWorld(t, sdk, { home })
    const routes = statusRoutes(world.call)
    const reason = LAUNCH.preflightManifest
    const prefix = reason + DETAIL.separator + DETAIL.publicText
    const safePrefix = [prefix, ...DETAIL.homes.map(() => DETAIL.redacted), DETAIL.redacted + DETAIL.publicUrlTail].join(' ') + ' '
    const wideCount = DETAIL.limit - [...safePrefix].length
    const boundary = safePrefix + DETAIL.wide.repeat(wideCount)
    const message = (points) => [prefix, ...DETAIL.homes, DETAIL.credentialUrl, DETAIL.wide.repeat(points)].join(' ') + '\n' + DETAIL.secondLine

    await world.apply()
    world.ctl.failNext = codedError(reason, message(wideCount))
    await startOnReady(world.fireReady, world.serviceOf(SUPPORT_ROW.service))
    assertStatus(await routes.status(), K3.state.failed, LAUNCH.startFailed, boundary)

    // Exactly one code point beyond the bound must be cut without splitting a surrogate pair.
    world.ctl.failNext = codedError(reason, message(wideCount + 1))
    const failed = await routes.retry()
    assertStatus(failed, K3.state.failed, LAUNCH.startFailed, boundary)
    assert.deepEqual(await routes.status(), failed)
    assertWarns(world, reason, reason)

    const ready = await routes.retry()
    assertStatus(ready, K3.state.ready)
    assert.deepEqual(await routes.status(), ready)
    assertWarns(world, reason, reason)
  })

  caseTest(sdk, 'R4-ST-01', 'start exit vs ready exit', 'exit before the start settles retains NATIVE_CHILD_EXITED and adds one start cause/warning; Retry clears it; a ready exit has no startup detail', async (t) => {
    const { home } = homeOf(t, 'canonical')
    const world = await rowWorld(t, sdk, { home })
    const routes = statusRoutes(world.call)
    await world.apply()
    const [owner] = world.ctl.instances
    const exitDuringStart = async (begin) => {
      const race = holdExitDuringStart(owner)
      const pending = begin()
      let answer
      try {
        await Promise.race([race.entered, pending.then(() => assert.fail('start settled without reaching the held child'))])
        assertStatus(await routes.status(), K3.state.starting)
        race.exit()
        assertStatus(await routes.status(), K3.state.failed, K3.code.exited)
        race.reject()
      } finally {
        race.release()
        answer = await pending
      }
      const failed = await routes.status()
      assertStatus(failed, K3.state.failed, K3.code.exited, LAUNCH.childExited)
      return { answer, failed }
    }

    await exitDuringStart(() => startOnReady(world.fireReady, world.serviceOf(SUPPORT_ROW.service)))
    assertWarns(world, LAUNCH.childExited)

    const ready = await routes.retry()
    assertStatus(ready, K3.state.ready)
    assert.deepEqual(await routes.status(), ready)
    owner.options.onExit()
    assertStatus(await routes.status(), K3.state.failed, K3.code.exited)
    assertWarns(world, LAUNCH.childExited)

    const { answer, failed } = await exitDuringStart(routes.retry)
    assert.deepEqual(answer, failed, 'a failed Retry reports the same exit and cause')
    assertWarns(world, LAUNCH.childExited, LAUNCH.childExited)
  })
})
