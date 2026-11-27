// Port of 44ceca7:test/v2-pg-origin-frame-policy.test.mjs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { isMainThread, Worker } from 'node:worker_threads'
import { caseTest, forEachVersion } from 'dsh-connector-test-helpers/cases'
import { WORKER } from 'dsh-connector-test-helpers/static/constants'
import { assertFramed, mountMain, one } from './cases.mjs'
import { ATTR, EMBED, TAG } from './constants.mjs'
import { hostWorld, openPage } from './world.mjs'

// The child has its own origin. Delegate clipboard writes there, but no other feature or referrer.
const POLICY = Object.freeze({ allow: 'clipboard-write *', referrerPolicy: 'no-referrer' })
const POLICY_KEYS = Object.keys(POLICY)
const POLICY_ATTRIBUTES = new Set(POLICY_KEYS.map((name) => name.toLowerCase()))
const LEGACY_GRANTS = new Set(['allowfullscreen', 'allowpaymentrequest'])
const SHELL = 'client.shell.js'

async function assertNoPropOverrides() {
  const { parse, walk } = await import('dsh-connector-test-helpers/static/acorn')
  const marked = []
  walk.simple(parse(readFileSync(path.join(EMBED.clientDir, SHELL), 'utf8')), {
    CallExpression({ arguments: [tag, props] }) {
      if (tag?.value !== TAG.iframe || props?.type !== 'ObjectExpression') return
      if (props.properties.some(({ key }) => key?.value === ATTR.frame)) marked.push(props)
    },
  })
  const { properties } = one(marked, 'marked iframe constructions')
  // JavaScript merges duplicate keys/spreads before React sees them, so a render check alone cannot rule them out.
  assert.ok(properties.every(({ type, computed }) => type === 'Property' && !computed), 'iframe props must not use spreads or computed keys')
  const names = properties.map(({ key }) => key.name ?? String(key.value))
  for (const name of POLICY_KEYS) {
    assert.deepEqual(names.filter((key) => key.toLowerCase() === name.toLowerCase()), [name], 'one explicit ' + name + ' prop')
  }
}

if (isMainThread) {
  test('PG-ORIGIN PGO-FRAME-01: marked iframe props cannot override the policy', () => new Promise((resolve, reject) => {
    // As in the shared static workers, expose Node's bundled parser only in the worker.
    const worker = new Worker(new URL(import.meta.url), { execArgv: [...WORKER.execArgv] })
    worker.once('error', reject)
    worker.once('exit', (code) => code === 0 ? resolve() : reject(new Error('PG-ORIGIN parser worker exited with code ' + code)))
  }))

  forEachVersion((sdk) => {
    caseTest(sdk, 'PG-ORIGIN', 'render', 'one marked iframe uses only clipboard-write * and no-referrer', async (t) => {
      const world = await hostWorld(t, sdk)
      const page = await openPage(t, world)
      const view = await mountMain(page)
      const frame = await assertFramed(page, view, world)
      assert.equal(frame.tag, TAG.iframe, 'the marked element must be an iframe')
      assert.equal(frame.props[ATTR.frame], true, 'the iframe must carry the Fishball marker')
      const relevant = Object.entries(frame.props).filter(([name]) => {
        const attr = name.toLowerCase()
        return POLICY_ATTRIBUTES.has(attr) || LEGACY_GRANTS.has(attr)
      })
      assert.deepEqual(Object.fromEntries(relevant), POLICY, 'effective iframe policy props')
    })
  })
} else {
  await assertNoPropOverrides()
}
