import { runWorker } from './test.mjs'
import { workspaces } from './test-workspaces.mjs'

const catalog = workspaces(process.cwd())
const pkg = catalog.find((p) => p.name === process.argv[2])
if (!pkg) throw new Error('Unknown worker package: ' + process.argv[2])
process.exitCode = await runWorker(pkg, catalog, JSON.parse(process.argv[3]))
