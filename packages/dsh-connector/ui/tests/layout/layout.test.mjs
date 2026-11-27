// UI-FIX-D narrow-width layout rows (real DSH in a real headless Chromium: header Hand over / Take back, the connector settings page, the Fishball window's error code); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerLayoutCases } from './cases.mjs'

forEachVersion((version) => {
  registerLayoutCases(version)
})
