// The staging auto-update acceptance world was bound to DSH 0.2.2-rc.3.
import test from 'node:test'
import { DSH_VERSION } from 'fishball-test-helpers/dsh'
import { AUTO_SDK } from './taskboard/auto-world.mjs'

if (DSH_VERSION === AUTO_SDK) {
  await import('./taskboard/auto-cases.mjs')
} else {
  test('TB-AUTO', { skip: 'requires DSH ' + AUTO_SDK })
}
