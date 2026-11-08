import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { tmpdir } from 'node:os'

export const CASE = Object.freeze({
  prefix: 'fishball-production-test-', timeoutMs: 15000,
  mainHome: 'main-home', runtime: ['fishball', 'runtime'],
  workspace: 'workspace', profile: ['dsh-home', 'profiles', 'fishball'],
  install: 'program', sentinel: 'DO_NOT_CHANGE_OR_ADOPT',
})

export function isWithin(parent, child) {
  const path = relative(parent, child)
  return path !== '' && path !== '..' && !path.startsWith('../') && !isAbsolute(path)
}

/** All tests fail closed outside the disposable runner, before importing host code. */
export async function assertDisposableEnvironment() {
  const declared = process.env.FISHBALL_TEST_ROOT
  assert.ok(declared && isAbsolute(declared), 'use native-production-runner.mjs; disposable root required')
  const root = await realpath(declared)
  assert.equal(root, declared, 'runner root must be canonical')
  for (const name of ['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'TMP', 'TMPDIR', 'TEMP', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) {
    assert.ok(process.env[name] && isWithin(root, await realpath(process.env[name])), name + ' must be disposable')
  }
  return root
}

export async function sandbox(t, initialized = true) {
  await assertDisposableEnvironment()
  const root = await realpath(await mkdtemp(join(tmpdir(), CASE.prefix)))
  const mainHome = join(root, CASE.mainHome)
  const runtimeRoot = join(mainHome, ...CASE.runtime)
  const layout = {
    root, mainHome, runtimeRoot, cleanup: [], workspace: join(runtimeRoot, CASE.workspace),
    profileDir: join(runtimeRoot, ...CASE.profile), installRoot: join(root, CASE.install), mainWorkspaces: [],
  }
  await Promise.all((initialized ? [layout.workspace, layout.profileDir, layout.installRoot] : [layout.mainHome, layout.installRoot]).map(path => mkdir(path, { recursive: true })))
  t.after(async () => {
    for (const cleanup of layout.cleanup.reverse()) await cleanup()
    // No computed deletion target is trusted without both canonical identity and containment.
    assert.equal(await realpath(root), root)
    assert.ok(isWithin(await realpath(tmpdir()), root))
    await rm(root, { recursive: true, force: true })
  })
  return layout
}

export async function sentinel(path) {
  await writeFile(path, CASE.sentinel)
  return path
}

export function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

export async function bounded(promise, message, milliseconds = CASE.timeoutMs) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}
