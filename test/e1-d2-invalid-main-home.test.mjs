/**
 * E1 re-test (D2) — a non-canonical DSH home is reported as `INVALID_MAIN_HOME`.
 *
 * Requirement (the user's E1 report and its fix): a DSH home that is not its own real path (for
 * example `/tmp/...`, where macOS has the symlink `/tmp` → `/private/tmp`) must make the instance
 * fail with `INVALID_MAIN_HOME` and say why on its card, not with the generic
 * `NATIVE_START_FAILED`. The install docs must state the canonical-path requirement (D1, whose
 * README change is reviewed with this release).
 *
 * Observation points: `GET /api/fishball-instance/status` after a real DSH boot from a symlinked
 * home, the instance runtime's `lifecycle.log` (no child ever starts), and the instance card's
 * en/zh words for the code.
 *
 * Techniques: DT (canonical vs symlinked home), EP (en/zh explanation), BVA (the boundary is
 * `realpath(home) === home`), ST (no launch follows the refusal).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | D2-DT-01 | DT (symlinked home) | failed + `INVALID_MAIN_HOME`, not NATIVE_START_FAILED |
 * | D2-ST-01 | ST (refused start) | no CHILD_BOOT/LISTEN/READY transition follows |
 * | D2-EP-01/02 | EP (en, zh card words) | each language explains the real-path requirement |
 * | D2-BVA-01 | BVA (the symlink boundary) | the same home reached by its real path starts |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { TEST_HOMES } from './support/constants.mjs'
import { CJK, instanceClientWords } from './support/body-soul-env.mjs'
import { bootHost } from './support/host.mjs'
import { until } from './support/util.mjs'

const STATUS_PATH = '/api/fishball-instance/status'
const CODE = 'INVALID_MAIN_HOME'
const BOOT_TIMEOUT = 90_000

const runtimeDir = (home) => path.join(home, 'fishball', 'runtime')
const lifecycleOf = (home) => {
  const file = path.join(runtimeDir(home), 'lifecycle.log')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

/** A guard for the two test-owned directories removed after the case. */
function removeOwned(dir, prefix) {
  if (path.dirname(dir) !== TEST_HOMES || !path.basename(dir).startsWith(prefix)) throw new Error('refusing to remove ' + dir)
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('D2 a symlinked DSH home is reported as INVALID_MAIN_HOME', () => {
  it('D2-DT-01 the status names the canonical-path refusal, and no child starts', async (t) => {
    const real = fs.mkdtempSync(path.join(TEST_HOMES, 'e1-d2-real-'))
    const link = path.join(TEST_HOMES, 'e1-d2-link-' + Date.now())
    fs.symlinkSync(real, link)
    const host = await bootHost(link)
    // One hook, in order: the host must stop before its home tree is removed.
    t.after(async () => {
      await host.stop().catch(() => {})
      removeOwned(real, 'e1-d2-real-')
      if (fs.existsSync(link)) fs.unlinkSync(link)
    })

    let last
    const refused = await until(async () => {
      const answer = await host.get(STATUS_PATH)
      last = answer.json
      return last?.state === 'failed'
    }, BOOT_TIMEOUT, 250)
    assert.ok(refused, 'the instance reported failed; last ' + JSON.stringify(last))
    assert.equal(last.code, CODE, 'the reason is the canonical-path code, not the generic one')
    assert.notEqual(last.code, 'NATIVE_START_FAILED')

    // The refusal happens before a child: no boot/listen/ready transition appears.
    const lifecycle = lifecycleOf(link)
    for (const transition of ['CHILD_BOOT', 'CHILD_LISTEN', 'CHILD_READY']) {
      assert.equal(lifecycle.includes('"' + transition + '"'), false, 'no ' + transition + ' after the refusal')
    }
  })

  it('D2-BVA-01 the same home reached by its real path does start', async (t) => {
    const real = fs.mkdtempSync(path.join(TEST_HOMES, 'e1-d2-real-'))
    const host = await bootHost(real)
    t.after(async () => {
      await host.stop().catch(() => {})
      removeOwned(real, 'e1-d2-real-')
    })

    let last
    const ready = await until(async () => {
      const answer = await host.get(STATUS_PATH)
      last = answer.json
      return last?.state === 'ready'
    }, BOOT_TIMEOUT, 250)
    assert.ok(ready, 'the canonical home starts; last ' + JSON.stringify(last))
  })

  it('D2-EP-01/02 the card explains the requirement in English and Chinese', () => {
    const words = instanceClientWords()
    const en = words.en['reason.' + CODE]
    const zh = words.zh['reason.' + CODE]
    assert.ok(en, 'an English explanation')
    assert.ok(zh, 'a Chinese explanation')
    assert.match(en, /canonical|real path/i)
    assert.match(en, /\/tmp/)
    assert.match(en, /\/private\/tmp/)
    assert.match(zh, CJK)
    assert.match(zh, /\/private\/tmp/)
    assert.notEqual(en, zh)
  })
})
