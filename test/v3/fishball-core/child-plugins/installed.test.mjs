// CHILD-PLUGINS (DESIGN.md §28, fishball-core part) on the DSH installation the task names (constants.mjs INSTALLED_DSH).
// Not an sdk-<version> file: the runner's SDK jobs are 0.2.1-rc.5 and 0.2.2-rc.1, and this row set reads its
// installation by path (runtimeOf), so it runs once, in the first job.
import { registerChildPluginCases } from './cases.mjs'
import { INSTALLED_DSH } from './constants.mjs'

registerChildPluginCases(INSTALLED_DSH)
