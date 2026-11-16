import path from 'node:path'
import { FAKE, TEST_HOMES } from '../../../support/constants.mjs'
export const C = Object.freeze({
  core: 'fishball-core', ui: 'fishball-ui', board: 'fishball-board', shared: 'fishball-shared',
  sdk: ['0.2.1-rc.5', '0.2.2-rc.1'], apiVersion: 1,
  repo: path.resolve(import.meta.dirname, '../../../..'),
  versionRoot: process.env.FBTEST_DSH_VERSIONS ?? '/Users/samuel/Library/Application Support/DSH/data/versions',
  worker: path.join(import.meta.dirname, 'world.mjs'), profile: 'fbwire',
  // The repo's test-homes root (under os.tmpdir(); a hard-coded /private/var path is refused by the
  // sandbox). `temp` is the folder that holds `.runtime/test-homes`; the worker gets the same root
  // through FBTEST_TEST_HOMES, because TEST_HOMES' default names the parent's pid.
  testHomes: TEST_HOMES, temp: path.dirname(path.dirname(TEST_HOMES)), homesSuffix: '.runtime/test-homes', homePrefix: 'wire-',
  env: { chrome: path.join(TEST_HOMES, 'missing-chrome'), userconfig: '/dev/null', testHomes: 'FBTEST_TEST_HOMES' },
  budget: { boot: 180000, call: 60000, stop: 20000, poll: 100 },
  rows: ['fishball-core', 'fishball-core-guards', 'fishball-core-session'],
  absentRows: ['fishball-native-session-tools', 'fishball-native-session-approvals', 'fishball-native-session-app', 'fishball-native-session-inbox'],
  exports: ['./client', './link', './contracts', './main', './session-route', './package.json'],
  main: 'fishball-core/main', forbiddenDependency: /^dsh-connector(?:$|[-/])/,
  scanRoots: ['packages/core', 'packages/fishball-ui', 'packages/shared', 'packages/board'],
  source: /\.(?:[cm]?js|tsx?)$/, imports: /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)['"](dsh-connector[^'"]*)['"]/g,
  coreTools: ['ask_user', 'schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete'],
  privateSkill: /^private_skill_/,
  coreToolTables: [{ module: '../manager/reminders.js', table: 'TOOL' }, { module: '../manager/skills.js', table: 'PRIVATE_SKILL_TOOL' }, { module: '../asks/constants.js', table: 'ASK_TOOL' }],
  baseTools: ['read', 'read_image', 'working_directory'], boardToolPrefix: 'board_', guardsOk: 'ok',
  members: ['manager', 'events', 'ui', 'bridge', 'attention'],
  managerMembers: ['sessionId', 'ensureSession', 'registerSetup', 'notify', 'userTexts'],
  uiMembers: ['managerSessionId', 'link', 'connect', 'pairing', 'guards', 'asks'],
  modelSeam: { settingsNamespace: 'fishball-core', path: ['model'] },
  routes: { connect: '/api/fishball/connect', cancel: '/api/fishball/connect/cancel', callback: '/api/fishball/connect/callback' },
  status: { ok: 200, missing: 404 },
  connectStates: ['needs-configuration', 'needs-authorization', 'authorizing', 'authorized', 'failed'],
  configurationCodes: ['metadata-url-missing', 'metadata-url-not-https', 'metadata-url-root-path', 'not-a-connector'],
  // Loopback page hosts (interface: "Loopback Origin host (127.0.0.1, localhost, [::1]) → loopback
  // callback"); each is sent as Host and as the Origin's host on the listener's port, the only pairs
  // DSH's own fence passes (a foreign Origin is refused 403 before core).
  loopbackHosts: ['127.0.0.1', 'localhost', '[::1]'], scheme: { http: 'http://', https: 'https://' },
  insecureCode: 'web-callback-insecure', defaultModel: FAKE.model,
  selection: { provider: 'fishball-test', model: 'test-model-b' },
  unroutable: { provider: 'fbtest-no-provider', model: 'fbtest-no-model' },
  target: 'http://127.0.0.1:1/api/fishball/mcp',
  persona: { present: ['session_message', 'approval_answer'], absent: ['message_session', 'answer_approval', 'list_plugins'] },
  opaqueSecret: 'opaque-test-secret-must-not-escape',
  turn: 'Wire acceptance probe; respond without tools.',
  logLimit: 3000, first: 0, one: 1, empty: '', encoding: 'utf8',
  method: { get: 'GET', post: 'POST' }, json: 'application/json', noStore: 'no-store',
  skipDirs: ['node_modules', '.git'],
  todo: 'E2E-CORE: browser redirect completion and cross-machine TLS tunnel are browser/system acceptance rows',
  // No Host/Origin pair is both admitted by DSH's fence with default trustedHosts (Host must be
  // loopback/bind/trusted and Origin the same authority) and insecure for core (non-loopback http,
  // or https whose authority differs from Host).
  insecureTodo: 'E2E-CORE: web-callback-insecure needs a non-loopback Host admitted by DSH (trustedHosts / TLS setup); a standalone DSH with default trustedHosts refuses every such pair with 403 before core',
})
export const runtimeOf = (sdk) => path.join(C.versionRoot, sdk, 'node_modules')
