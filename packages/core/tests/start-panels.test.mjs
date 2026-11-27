// Core's patch composed by the real DSH host; the Task board amenity's contribution is scripted.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { caseTest } from 'fishball-test-helpers/cases'
import { DSH_RUNTIME, dshPackageDir, importDsh } from 'fishball-test-helpers/dsh'

const PROFILE = 'web'
const CORE = fileURLToPath(new URL('../', import.meta.url))
const HOST_BUNDLES = ['dsh-base', 'dsh-web-app'].map((name) => dshPackageDir(name))
const HOST_ROWS = ['ui-sidebar-right', 'shortcuts', 'ui-shortcuts']
const WORKSPACE = {
  provider: '@deepseek-ai/dsh-client-ui-sidebar-files',
  kind: 'files',
  title: 'Workspace files',
  command: 'workspace.files',
  shortcutProfile: 'web:macos',
}
const BOARD = {
  row: 'fishball-taskboard',
  title: 'Task board',
  guideId: 'board',
  guideOrder: 20,
}

function manifest(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
}

function hostExport(dir, subpath) {
  return join(dir, manifest(dir).exports[subpath].default)
}

const { bundlePatchPaths, composeEntries, loadOverlayPatches } = await importDsh('dsh-app-boot')
const { evaluate, isJsExpr } = await importDsh('cordis-plugin-loader')

function bundlePatches(dir) {
  return bundlePatchPaths(dir, manifest(dir).dsh.bundle).flatMap(file => loadOverlayPatches(PROFILE, file))
}

const hostLayers = HOST_BUNDLES.map(bundlePatches)
const coreLayer = bundlePatches(CORE)

function* activeRows(rows, ctx) {
  for (const row of rows) {
    const { disabled } = row
    if (isJsExpr(disabled) ? evaluate(ctx, disabled.__jsExpr) : disabled) continue
    yield row
    if (row.group && Array.isArray(row.config)) yield* activeRows(row.config, ctx)
  }
}

function applyWorkspaceProvider(ctx) {
  const entry = hostExport(join(DSH_RUNTIME, WORKSPACE.provider), './client')
  // Execute the shipped provider only through registration. Nothing renders, opens files,
  // or connects to a Remote; the host consumes these same tab and command registrations.
  const modules = {
    '@deepseek-ai/dsh-client-store': { defineStore: () => ({}), createSnapshotStore: () => ({}) },
    '@deepseek-ai/dsh-client-ui-primitives': {},
    '@deepseek-ai/cordis': {},
    'react/jsx-runtime': {},
    react: { memo: component => component },
  }
  let registration
  runInNewContext(readFileSync(entry, 'utf8'), {
    window: { __ModuleLoader__: { load: value => { registration = value } } },
  }, { filename: entry })
  assert.equal(registration?.id, WORKSPACE.provider)
  registration.factory(name => {
    assert.ok(Object.hasOwn(modules, name), 'Unexpected host client import: ' + name)
    return modules[name]
  }).apply(ctx)
}

function startContributions({ fishball, boardEnabled }) {
  const startedBundles = [...HOST_BUNDLES.map(dir => manifest(dir).name)]
  if (boardEnabled) startedBundles.push(BOARD.row)
  if (fishball) startedBundles.push(manifest(CORE).name)
  // Model only an amenity's contributed row and guide entry, not its package or runtime.
  const amenityLayer = boardEnabled ? [{ insert: [{ id: BOARD.row, name: BOARD.row }] }] : []
  const layers = [...hostLayers, amenityLayer, ...(fishball ? [coreLayer] : [])]
  const rows = [...activeRows(composeEntries(layers), {
    get: key => key === 'profileContext' ? { name: PROFILE, startedBundles } : undefined,
  })]
  for (const id of HOST_ROWS) assert.ok(rows.some(row => row.id === id), 'Expected active host row: ' + id)

  const tabs = new Map()
  const commands = new Map()
  const dictionaries = new Map()
  const noop = () => {}
  const ctx = {
    locale: {
      bind: namespace => key => dictionaries.get(namespace).en[key],
      register: (namespace, locales) => dictionaries.set(namespace, locales),
    },
    shortcuts: { register: command => commands.set(command.id, command) },
    sidebarRightTabs: {
      register: tab => tabs.set(tab.kind, tab),
      entries: () => [...tabs.values()],
    },
    sidebarRight: {},
    remote: {},
    slots: { register: noop, registerFactory: noop, inject: (_slot, register) => register() },
    effect: register => register(),
    inject: (_services, register) => register(ctx),
  }
  for (const row of rows) {
    if (row.name === WORKSPACE.provider) applyWorkspaceProvider(ctx)
    if (row.name === BOARD.row) {
      ctx.sidebarRightTabs.register({
        id: BOARD.row, kind: BOARD.row,
        guide: [{ id: BOARD.guideId, order: BOARD.guideOrder, title: () => BOARD.title }],
      })
    }
  }
  return {
    start: [...tabs.values()].flatMap(tab => tab.guide ?? []).map(entry => entry.title()),
    filesTab: tabs.get(WORKSPACE.kind),
    filesCommand: commands.get(WORKSPACE.command),
  }
}

for (const scenario of [
  { name: 'ordinary DSH', fishball: false, boardEnabled: false },
  { name: 'Fishball with Task board enabled', fishball: true, boardEnabled: true },
  { name: 'Fishball without the Task board amenity', fishball: true, boardEnabled: false },
]) {
  caseTest('START-PANELS-DT-01', scenario.name, 'composes Workspace files and Task board contributions', async (t) => {
    const { start, filesTab, filesCommand } = startContributions(scenario)
    const workspaceAvailable = !scenario.fishball
    await t.test('Start pane entries', () => {
      assert.equal(start.includes(WORKSPACE.title), workspaceAvailable, WORKSPACE.title)
      assert.equal(start.includes(BOARD.title), scenario.boardEnabled, BOARD.title)
    })
    await t.test('Workspace files command, palette registration, and keyboard shortcut', () => {
      // DSH dispatches bindings and populates the palette from the same command registration.
      assert.equal(Boolean(filesCommand), workspaceAvailable, WORKSPACE.command)
      if (workspaceAvailable) {
        assert.equal(filesCommand.label(), WORKSPACE.title)
        assert.ok(filesCommand.defaults[WORKSPACE.shortcutProfile], 'No default web shortcut')
      }
    })
    await t.test('Workspace files tab contribution for reopening', () => {
      assert.equal(Boolean(filesTab), workspaceAvailable, WORKSPACE.kind)
    })
  })
}
