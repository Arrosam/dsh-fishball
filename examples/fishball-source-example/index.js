/**
 * Read-only connector example using the shipped public contract (1.1).
 * The historical package name is retained; there is no source-publishing API in this release.
 * Optional injection lets this row load while the connector row is disabled or still loading.
 */
import { CONNECTOR_SERVICE } from 'fishball-connector/contract'

const EXAMPLE = Object.freeze({
  name: 'fishball-source-example',
  unattached: 'No Fishball instance is attached.',
  attached: 'Attached Fishball instance: %s (%s).',
})

export const name = EXAMPLE.name

export function apply(ctx) {
  const logger = ctx.logger(EXAMPLE.name)
  ctx.inject([CONNECTOR_SERVICE], (scope) => {
    // current() is a snapshot, not a subscription or permission to access the instance transport.
    const current = scope[CONNECTOR_SERVICE].current()
    if (current === null) logger.info(EXAMPLE.unattached)
    else logger.info(EXAMPLE.attached, current.name, current.id)
  })
}
