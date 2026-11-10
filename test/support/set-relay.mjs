/**
 * Shared fixtures for the SET settings-relay cases (test/v2-page-cases/set*.test.mjs).
 *
 * - relayLink(): one in-memory transport pair `{send, onMessage, onClose}` (the relay's documented
 *   transport, docs/planning/v2-set.md "Exports"). It records every frame in each direction and
 *   can drop the main end's replies or lose the wire.
 * - ACTIVE_SDK: the SDK version this process runs (FBTEST_DSH_RUNTIME); in-process cases run
 *   only for it and register a TODO for the other SDK.
 */
import fs from 'node:fs'
import path from 'node:path'
import { FIXTURE as SDK_FIXTURE } from './provider-sync-official.mjs'

export function relayLink() {
  const handlers = { main: { message: new Set(), close: new Set() }, child: { message: new Set(), close: new Set() } }
  const frames = { toMain: [], toChild: [] }
  let open = true
  let dropReplies = false
  const end = (self, other, log) => ({
    send(text) {
      if (!open) throw new Error('relay fixture link closed')
      log.push(text)
      if (self === 'main' && dropReplies) return
      queueMicrotask(() => { if (open) for (const fn of [...handlers[other].message]) fn(text) })
    },
    onMessage(fn) { handlers[self].message.add(fn); return () => handlers[self].message.delete(fn) },
    onClose(fn) { handlers[self].close.add(fn); return () => handlers[self].close.delete(fn) },
  })
  return {
    main: end('main', 'child', frames.toChild),
    child: end('child', 'main', frames.toMain),
    frames,
    dropReplies() { dropReplies = true },
    lose() {
      if (!open) return
      open = false
      for (const side of ['main', 'child']) for (const fn of [...handlers[side].close]) fn()
    },
  }
}

export const parsedFrames = (list) => list.map((text) => JSON.parse(text))

export const ACTIVE_SDK = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(SDK_FIXTURE.runtime, '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version
  } catch {
    return undefined
  }
})()
