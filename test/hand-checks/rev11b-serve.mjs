/**
 * Hand-check server for the managed-sessions list (test session's own script). Boots the suite's real DSH
 * worker (this checkout's plugin, fake model) and stays up. Commands: append JSON lines {op,args} to the file
 * named by argv[2]; results are appended to argv[2] + '.out'.
 */
import fs from 'node:fs'
import { APPROVER_AFTER_ENV, STATUS } from '../support/constants.mjs'
import { bootHost, newHome, sleep } from '../support/host.mjs'
import { managedSession, settledIdle, setManaged } from '../support/expect.mjs'

const cmdFile = process.argv[2]
fs.writeFileSync(cmdFile, ''); fs.writeFileSync(cmdFile + '.out', '')
const host = await bootHost(newHome('rev11b-serve'), { env: APPROVER_AFTER_ENV })
const fb = (await host.waitStatus(STATUS.live))?.sessionId
await settledIdle(host, fb)
const url = /dsh web: (http\S+)/.exec(host.output)[1]
console.log('READY ' + url + ' fb=' + fb)
const done = new Set(); let lines = 0
const reply = (o) => fs.appendFileSync(cmdFile + '.out', JSON.stringify(o) + '\n')
const ops = {
  managedSession: ({ folder }) => managedSession(host, fb, folder),
  setManaged: ({ sessionId, managed }) => setManaged(host, sessionId, managed).then((r) => ({ status: r.status, text: r.text })),
  rename: ({ sessionId, title }) => host.call('renameSession', { sessionId, title }),
  state: async () => (await host.state()).managed,
  call: ({ op, args }) => host.call(op, args),
  plugin: async ({ plugin, on }) => host.post('/api/fishball/plugins', { plugin, on }).then((r) => r.status),
  stop: async () => { await host.stop(); process.exit(0) },
}
for (;;) {
  const all = fs.readFileSync(cmdFile, 'utf8').split('\n').filter(Boolean)
  while (lines < all.length) {
    const c = JSON.parse(all[lines++])
    try { reply({ i: lines, ok: true, value: await ops[c.op](c.args ?? {}) }) } catch (e) { reply({ i: lines, ok: false, error: String(e?.message ?? e) }) }
  }
  await sleep(300)
}
