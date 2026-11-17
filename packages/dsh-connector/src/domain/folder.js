/**
 * Where `session_start` creates its session (§5.2; moved unchanged from the V2 bridge by C-WIRE-2).
 * The folder is a workspace id or an absolute path. A registered workspace keeps its path after
 * the folder is gone, so the folder must exist too. Nothing is ever created here. The refusals use
 * the codes the user chose (2026-11-08): a value that is neither a workspace id nor an absolute
 * path is not allowed (`forbidden`); a workspace whose folder is gone, or an absolute path that is
 * not an existing directory, is not found (`unknown-session`).
 */
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { REFUSAL } from '../../mcp-schema/index.js'
import { RefusalError } from '../errors.js'

async function isDirectory(target) {
  try { return (await stat(target)).isDirectory() } catch { return false }
}

/**
 * @param ctx - the row's context (`workspaceRegistry`)
 * @param {string} folder - session_start's `folder`
 * @returns {Promise<{workspaceId: string} | {cwd: string}>} DSH's create target
 * @throws RefusalError `forbidden` or `unknown-session`
 */
export async function placeOf(ctx, folder) {
  const workspace = ctx.workspaceRegistry.list().find((entry) => entry.id === folder)
  if (workspace !== undefined) {
    if (!(await isDirectory(workspace.path))) throw new RefusalError(REFUSAL.unknownSession)
    return { workspaceId: workspace.id }
  }
  if (!isAbsolute(folder)) throw new RefusalError(REFUSAL.forbidden)
  if (!(await isDirectory(folder))) throw new RefusalError(REFUSAL.unknownSession)
  const registered = await ctx.workspaceRegistry.resolveByPath(folder)
  return registered === undefined ? { cwd: folder } : { workspaceId: registered.id }
}
