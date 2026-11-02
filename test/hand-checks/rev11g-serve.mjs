/**
 * Hand-check server for rev11g (test session's own script). Boots the suite's real DSH worker (this checkout's
 * plugin, fake model, scripted stand-in for the stock prompt) and stays up. Commands: JSON lines {code} appended to
 * argv[2]; each `code` is async JS with {host, fb, helpers} in scope; results go to argv[2] + '.out'.
 */
import fs from 'node:fs'
import { APPROVER_AFTER_ENV, OUTCOME, STATUS } from '../support/constants.mjs'
import * as E from '../support/expect.mjs'
import { bootHost, newHome, sleep, until } from '../support/host.mjs'

const cmdFile = process.argv[2]
fs.writeFileSync(cmdFile, ''); fs.writeFileSync(cmdFile + '.out', '')
const home = process.argv[3] ?? newHome('rev11g-serve')
let host = await bootHost(home, { env: { ...APPROVER_AFTER_ENV, } })
let fb = (await host.waitStatus(STATUS.live))?.sessionId
await E.settledIdle(host, fb)
await host.call('setApprover', { outcome: OUTCOME.reject })
console.log('READY ' + /dsh web: (http\S+)/.exec(host.output)[1] + ' fb=' + fb + ' home=' + home)
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const reply = (o) => fs.appendFileSync(cmdFile + '.out', JSON.stringify(o) + '\n')
let lines = 0
for (;;) {
  const all = fs.readFileSync(cmdFile, 'utf8').split('\n').filter(Boolean)
  while (lines < all.length) {
    const c = JSON.parse(all[lines++])
    try {
      const fn = new AsyncFunction('host', 'fb', 'E', 'sleep', 'until', 'ctx', c.code)
      const ctx = { reboot: async () => { await host.stop(); host = await bootHost(home, { env: { ...APPROVER_AFTER_ENV, } }); fb = (await host.waitStatus(STATUS.live))?.sessionId; await E.settledIdle(host, fb); await host.call('setApprover', { outcome: OUTCOME.reject }); return /dsh web: (http\S+)/.exec(host.output)[1] } }
      const value = await fn(host, fb, E, sleep, until, ctx)
      reply({ i: lines, ok: true, value })
      if (c.code.includes('process.exit')) {}
    } catch (e) { reply({ i: lines, ok: false, error: String(e?.stack ?? e).slice(0, 1500) }) }
  }
  await sleep(300)
}
