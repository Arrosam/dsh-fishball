/**
 * This package's extension of the fishball-test-helpers DSH world (child side). The rows need only the
 * world's base ops (turns, held / released / stopped turns, settings mutate, DSH's plugin-manager row
 * switch); the extension only makes the world wait for core's service, so the manager-session route
 * answers from the first request.
 */
import { NAMES } from './names.mjs'

export const ready = ({ ctx }) => Boolean(ctx.get(NAMES.instance))
