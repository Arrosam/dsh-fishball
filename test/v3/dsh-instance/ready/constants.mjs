export const READY = Object.freeze({
  task: 'I-READY', origin: 'http://127.0.0.1:43129', unsafe: 'UNSAFE_CHILD_ORIGIN',
  missing: 'MISSING_CAPABILITY', notReady: 'NOT_READY',
  removedMethods: ['embedAccess', 'nativeEmbedAccess', 'onControlTransport', 'onAdminTransport', 'onInstanceSettingsTransport'],
  forbiddenText: ['fishballApp', '/api/health', 'authenticated-app'],
  absent: ['src/slim', 'src/settings-migration.js', 'src/child/admin.js', 'native-web.js', 'src/native-web.js'],
  runtimeRows: ['fishball-native-child', 'dsh-instance-child'],
  invalidOrigins: [
    ['https', 'https://127.0.0.1:43129'], ['remote', 'http://example.org:43129'],
    ['localhost', 'http://localhost:43129'], ['ipv6', 'http://[::1]:43129'],
    ['no-port', 'http://127.0.0.1'], ['path', 'http://127.0.0.1:43129/admit'],
    ['username', 'http://user@127.0.0.1:43129'], ['password', 'http://user:pass@127.0.0.1:43129'],
    ['query', 'http://127.0.0.1:43129/?a=1'], ['fragment', 'http://127.0.0.1:43129/#a'],
    ['number', 43129], ['object', {}], ['null', null], ['empty', ''],
    ['port-above-range', 'http://127.0.0.1:65536'],
  ],
  validOrigins: ['http://127.0.0.1:1', 'http://127.0.0.1:65535', 'http://127.0.0.1:43129/'],
  hostedSkip: 'I-READY: applyNativeChild requires its installed snapshot, canonical profile/cwd and marker files; no hosted child may be launched in this cycle',
})
