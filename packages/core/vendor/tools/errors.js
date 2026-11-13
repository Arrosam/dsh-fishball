/**
 * The one error the contribution service throws (design §13.2): `register(def)` and
 * `defineTool(def)` refuse with it and register nothing. The message is the code alone, so a
 * refusal never carries a path, a stack-derived text or the definition's content.
 */
export class ToolContributionError extends Error {
  /** @param {string} code one of REGISTER_REFUSAL */
  constructor(code) {
    super(code)
    this.name = 'ToolContributionError'
    this.code = code
  }
}
