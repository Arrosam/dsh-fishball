/**
 * Portal Gate seam tests for `dsh-connector-ui` (`dshConnectorUiPortal`).
 *
 * Designed from requirements alone using EP, BVA, DT, and ST:
 * - Service contract: `dshConnectorUiPortal` provided with `{ apiVersion: 1, registerGate(Gate) -> dispose }`.
 * - DT-1: No gate registered -> FishballChildView mounts iframe directly, sends admit and pageOpened once.
 * - ST-1: Gate registered before mount -> Gate renders with `{ title, renderFrame }`; while blocking,
 *   no iframe mounts and no admit request is sent; `pageOpened` fires once on mount; when Gate calls
 *   `renderFrame()`, iframe mounts & admits, and `pageOpened` is NOT duplicated.
 * - ST-2: Gate registered dynamically after mount and disposed while mounted -> switches to Gate, then
 *   restores direct frame rendering on dispose.
 * - ST-3: Gate registered then disposed before mount -> direct frame rendering on mount.
 * - ST-4: Gate replacement + stale disposer protection (BVA/ST) -> registering Gate B replaces Gate A;
 *   disposing Gate A does NOT clear Gate B; repeated dispose is idempotent; disposing Gate B restores
 *   direct frame rendering.
 * - EP/ST-5: Immediate passthrough Gate (calls `renderFrame()` on first render) & toggle back-and-forth
 *   -> frame mounts cleanly, `pageOpened` still fires exactly once per window mount.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { byTag, hostWorld, openPage, press, withAttr } from '../draw/world.mjs'
import { EMBED, GATE_ATTR, GATE_STATE, IFRAME_TAG, OPENED_ROUTE, PORTAL, ROUTE, SLOT, WAIT_MS } from './constants.mjs'

/** Resolve the Cordis root context and obtain `dshConnectorUiPortal`. */
async function portalServiceOf(page) {
  const embedPlugin = page.plugins.find((p) => p.id === EMBED.moduleId)
  assert.ok(embedPlugin, 'embed-UI plugin was not applied on the page')
  const root = embedPlugin.fiber.ctx.root
  await page.waitFor(() => root.get(PORTAL.serviceName), WAIT_MS)
  return { root, portal: root.get(PORTAL.serviceName) }
}

/** Wait until the Fishball window main entry is registered in `SLOT.main`. */
async function waitMainEntry(page) {
  const ready = await page.waitFor(() => page.entries(SLOT.main).length > 0, WAIT_MS)
  assert.ok(ready, 'embed-UI did not register a main slot entry for the Fishball window')
}

export function registerPortalGateCases(sdk) {
  describe(`dsh-connector-ui portal gate seam (SDK ${sdk})`, () => {
    test('EP: provides dshConnectorUiPortal service with apiVersion 1 and registerGate', async (t) => {
      const world = await hostWorld(t, sdk)
      const page = await openPage(t, world)
      const { portal } = await portalServiceOf(page)

      assert.ok(portal, 'dshConnectorUiPortal service should be provided when available.page === true')
      assert.equal(portal.apiVersion, PORTAL.apiVersion)
      assert.equal(typeof portal.registerGate, 'function')

      const noopGate = ({ renderFrame }) => renderFrame()
      const dispose = portal.registerGate(noopGate)
      assert.equal(typeof dispose, 'function', 'registerGate must return a dispose function')
      dispose()
      assert.deepEqual(page.errors, [])
    })

    test('DT-1: without a registered gate, FishballChildView mounts the frame directly and fires pageOpened once', async (t) => {
      const world = await hostWorld(t, sdk)
      const page = await openPage(t, world)
      await waitMainEntry(page)

      const view = await page.mount(SLOT.main)
      const framed = await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length > 0, WAIT_MS)
      assert.ok(framed, 'expected iframe to mount directly when no gate is registered')
      assert.equal(page.posts(ROUTE.admit).length, 1, 'expected exactly one admit request')
      assert.equal(world.child.admissions.length, 1, 'expected child admit to run once')
      assert.equal(page.posts(OPENED_ROUTE).length, 1, 'expected pageOpened to fire once on window mount')
      assert.deepEqual(page.errors, [])
    })

    test('ST-1: gate blocks frame & admit until renderFrame() is called; pageOpened fires once per mount', async (t) => {
      const world = await hostWorld(t, sdk)
      const page = await openPage(t, world)
      await waitMainEntry(page)
      const { portal } = await portalServiceOf(page)
      const { React } = page.shim
      const received = []

      function BlockingGate({ title, renderFrame }) {
        const [released, setReleased] = React.useState(false)
        received.push({ title, hasRenderFrame: typeof renderFrame === 'function', released })
        if (released) return renderFrame()
        return React.createElement(
          'div',
          { [GATE_ATTR.marker]: GATE_STATE.holding, [GATE_ATTR.title]: String(title ?? '') },
          React.createElement('button', {
            type: 'button',
            [GATE_ATTR.release]: 'true',
            onClick: () => setReleased(true),
          }, 'Continue'),
        )
      }

      const dispose = portal.registerGate(BlockingGate)
      t.after(() => dispose())

      const view = await page.mount(SLOT.main)
      const gateShown = await page.waitFor(() => withAttr(view.tree(), GATE_ATTR.marker, GATE_STATE.holding).length === 1, WAIT_MS)
      assert.ok(gateShown, 'expected registered Gate to render instead of the frame')

      // Gate props contract
      assert.ok(received.length >= 1)
      assert.equal(typeof received[0].title, 'string', 'Gate must receive a string title prop')
      assert.ok(received[0].title.length > 0, 'Gate title prop should be non-empty')
      assert.equal(received[0].hasRenderFrame, true, 'Gate must receive a renderFrame function prop')

      // While blocked: no iframe, no admit call, but pageOpened still fires once
      await page.settle()
      assert.equal(byTag(view.tree(), IFRAME_TAG).length, 0, 'frame must NOT mount while Gate blocks')
      assert.equal(page.posts(ROUTE.admit).length, 0, 'no /api/dsh-connector-ui/child/admit request while Gate blocks')
      assert.equal(world.child.admissions.length, 0, 'no child admission while Gate blocks')
      const openedOnce = await page.waitFor(() => page.posts(OPENED_ROUTE).length === 1, WAIT_MS)
      assert.ok(openedOnce, 'pageOpened must fire once when window mounts even while gated')

      // Release gate -> calls renderFrame()
      const [releaseBtn] = withAttr(view.tree(), GATE_ATTR.release)
      await press(page, releaseBtn)

      const framed = await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length === 1, WAIT_MS)
      assert.ok(framed, 'frame must mount after Gate switches to renderFrame()')
      assert.equal(page.posts(ROUTE.admit).length, 1, 'admit request must be sent once after Gate releases')
      assert.equal(world.child.admissions.length, 1, 'child admission must run once after Gate releases')
      assert.equal(page.posts(OPENED_ROUTE).length, 1, 'pageOpened must NOT duplicate when Gate switches to renderFrame()')
      assert.deepEqual(page.errors, [])
    })

    test('ST-2: registering and disposing a gate while FishballChildView is already mounted updates reactively', async (t) => {
      const world = await hostWorld(t, sdk)
      const page = await openPage(t, world)
      await waitMainEntry(page)
      const { portal } = await portalServiceOf(page)
      const { React } = page.shim

      const view = await page.mount(SLOT.main)
      assert.ok(await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length === 1, WAIT_MS), 'initial direct frame')

      function LateGate() {
        return React.createElement('div', { [GATE_ATTR.marker]: GATE_STATE.holding }, 'Late Gate')
      }

      const dispose = portal.registerGate(LateGate)
      assert.ok(await page.waitFor(() => withAttr(view.tree(), GATE_ATTR.marker, GATE_STATE.holding).length === 1, WAIT_MS), 'late gate takes over mounted view')
      assert.equal(byTag(view.tree(), IFRAME_TAG).length, 0, 'iframe unmounts while late gate blocks')

      dispose()
      assert.ok(await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length === 1, WAIT_MS), 'disposing gate restores direct frame rendering')
      assert.equal(withAttr(view.tree(), GATE_ATTR.marker).length, 0)
      assert.equal(page.posts(OPENED_ROUTE).length, 1, 'pageOpened still only once for this mount')
      assert.deepEqual(page.errors, [])
    })

    test('ST-3: disposing a gate before mount restores direct frame rendering', async (t) => {
      const world = await hostWorld(t, sdk)
      const page = await openPage(t, world)
      await waitMainEntry(page)
      const { portal } = await portalServiceOf(page)
      const { React } = page.shim
      let called = 0

      function DisposedGate() {
        called += 1
        return React.createElement('div', { [GATE_ATTR.marker]: GATE_STATE.holding })
      }

      const dispose = portal.registerGate(DisposedGate)
      dispose()

      const view = await page.mount(SLOT.main)
      assert.ok(await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length === 1, WAIT_MS), 'direct frame mounts after pre-mount dispose')
      assert.equal(called, 0, 'disposed gate must never be rendered')
      assert.equal(page.posts(ROUTE.admit).length, 1)
      assert.deepEqual(page.errors, [])
    })

    test('ST-4 / BVA: replacing a gate and disposing the stale gate does NOT clear the newer gate', async (t) => {
      const world = await hostWorld(t, sdk)
      const page = await openPage(t, world)
      await waitMainEntry(page)
      const { portal } = await portalServiceOf(page)
      const { React } = page.shim

      const GateA = () => React.createElement('div', { [GATE_ATTR.marker]: GATE_STATE.gateA }, 'Gate A')
      const GateB = () => React.createElement('div', { [GATE_ATTR.marker]: GATE_STATE.gateB }, 'Gate B')

      const disposeA = portal.registerGate(GateA)
      const disposeB = portal.registerGate(GateB)

      const view = await page.mount(SLOT.main)
      assert.ok(await page.waitFor(() => withAttr(view.tree(), GATE_ATTR.marker, GATE_STATE.gateB).length === 1, WAIT_MS), 'newer Gate B should be active')
      assert.equal(withAttr(view.tree(), GATE_ATTR.marker, GATE_STATE.gateA).length, 0, 'replaced Gate A must not render')
      assert.equal(page.posts(ROUTE.admit).length, 0, 'no admit while Gate B blocks')

      // Disposing replaced Gate A must be a no-op on Gate B
      disposeA()
      disposeA() // idempotent repeated dispose
      await page.settle()
      assert.equal(withAttr(view.tree(), GATE_ATTR.marker, GATE_STATE.gateB).length, 1, 'disposing stale Gate A must NOT clear Gate B')
      assert.equal(byTag(view.tree(), IFRAME_TAG).length, 0, 'frame must still not mount after stale disposeA')
      assert.equal(page.posts(ROUTE.admit).length, 0)

      // Disposing active Gate B restores direct frame rendering
      disposeB()
      disposeB() // idempotent repeated dispose
      assert.ok(await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length === 1, WAIT_MS), 'disposing Gate B restores direct frame')
      assert.equal(page.posts(ROUTE.admit).length, 1)
      assert.deepEqual(page.errors, [])
    })

    test('EP / ST-5: immediate passthrough gate and toggle cycles keep pageOpened at 1 per mount', async (t) => {
      const world = await hostWorld(t, sdk)
      const page = await openPage(t, world)
      await waitMainEntry(page)
      const { portal } = await portalServiceOf(page)
      const { React } = page.shim

      function ToggleGate({ renderFrame }) {
        const [showFrame, setShowFrame] = React.useState(true)
        return React.createElement(
          'div',
          { [GATE_ATTR.marker]: 'toggle-wrapper' },
          React.createElement('button', {
            type: 'button',
            [GATE_ATTR.toggle]: 'true',
            onClick: () => setShowFrame((v) => !v),
          }, 'Toggle'),
          showFrame ? renderFrame() : React.createElement('div', { [GATE_ATTR.marker]: GATE_STATE.holding }, 'Paused'),
        )
      }

      const dispose = portal.registerGate(ToggleGate)
      t.after(() => dispose())

      const view = await page.mount(SLOT.main)
      assert.ok(await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length === 1, WAIT_MS), 'immediate renderFrame mounts iframe')
      assert.equal(page.posts(OPENED_ROUTE).length, 1)

      // Toggle off and back on
      await press(page, withAttr(view.tree(), GATE_ATTR.toggle)[0])
      assert.ok(await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length === 0, WAIT_MS))
      await press(page, withAttr(view.tree(), GATE_ATTR.toggle)[0])
      assert.ok(await page.waitFor(() => byTag(view.tree(), IFRAME_TAG).length === 1, WAIT_MS))

      assert.equal(page.posts(OPENED_ROUTE).length, 1, 'pageOpened must fire only once across gate toggles')
      assert.deepEqual(page.errors, [])
    })
  })
}
