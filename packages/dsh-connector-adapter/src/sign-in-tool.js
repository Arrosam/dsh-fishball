/**
 * The agent tool `dsh_connector_sign_in` (R-OA-21 rule 4, Q-S7C-3 = B; AUTH-DT-12). It returns at
 * once: the approval URL carries no secret (client id, redirect URI, state, PKCE challenge, scope,
 * resource) and the connector token is typed only on the approval page, never in the chat, so the
 * result is safe in the session transcript.
 */
import { SIGN_IN_TOOL, TEXT } from './constants.js'

const JSON_OUTPUT = Object.freeze({
  schema: { type: 'json' },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})

/**
 * @param servers `Map<serverName, server>` (server.js).
 * @returns the defineTool options of the tool.
 */
export function signInTool(servers) {
  return {
    name: SIGN_IN_TOOL.name,
    description: TEXT.toolDescription,
    parameters: { server: { type: 'string', required: true, description: TEXT.serverArg } },
    output: JSON_OUTPUT,
    async execute({ server }) {
      const entry = servers.get(server)
      if (entry === undefined) return { status: SIGN_IN_TOOL.status.unknownServer, server }
      return { ...(await entry.signIn()), server }
    },
  }
}
