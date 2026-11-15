/**
 * The adapter cases' test doubles. They are the library suite's (one fake DSH connector, the non-DSH
 * server, the recording fetch, the fake clock and the scripted browser), declared once in
 * ../../dsh-connector-shared/oauth-client/fakes.mjs and re-exported here, so both suites drive the
 * same fake.
 */
export {
  FAKE_TOOLS, browser, eventually, fakeClock, otherServer, plant, portAccepts, recordingFetch, sleep, startFakeConnector, staysFalse, toolText,
} from '../../dsh-connector-shared/oauth-client/fakes.mjs'
