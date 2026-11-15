/**
 * Which target URL core's link uses (Fishball's decision, 2026-11-16, on the F-SETTINGS question):
 * in a hosted child the instance's `dsh-instance-child.targetUrl` (`HOSTED_IMPORT.targetSetting`)
 * is the link to its main DSH and wins; the user's own `target.url` applies only when there is no
 * instance value, as in a standalone DSH. Pure; F-WIRE feeds the result to the link, which applies
 * its own URL rule (`link/target.js` `checkTarget`) to whichever value won.
 *
 * "No instance value" is an absent setting, a non-string, or a string of white space only: the
 * instance writes a URL string or nothing (design §5.4), so anything else is not its value and
 * must not hide the user's. `client.settings.js` restates this test for its "not used" hint (a
 * browser chunk cannot import this module; keep the two in step).
 * @param {{instance: unknown, user: unknown}} values the two settings as stored
 * @returns {unknown} the value the link checks: the instance's when present, else the user's
 */
export function effectiveTarget({ instance, user }) {
  return hasInstanceTarget(instance) ? instance : user
}

/** Whether the instance supplied a target (see the module header). */
export function hasInstanceTarget(instance) {
  return typeof instance === 'string' && instance.trim() !== ''
}
