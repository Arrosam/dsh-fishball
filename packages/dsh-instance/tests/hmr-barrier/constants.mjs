export const HMR = Object.freeze({
  tag: 'fbhmr',
  registryKey: Symbol.for('dsh-fishball.native-lifecycle.v1'),
  tempPrefix: 'fbtest-hmr-barrier-',
  webOrigin: 'http://127.0.0.1:41998',
  childOrigin: 'http://127.0.0.1:41999',
  service: 'nativeFishballRuntime',
  hostId: 'hmr-barrier-test-runtime',
  ticket: 'test-ticket',
  stopTimeout: 'STOP_TIMEOUT',
  reloads: 15,
})
