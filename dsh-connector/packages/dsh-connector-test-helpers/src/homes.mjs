/**
 * Throwaway homes: the folder a suite creates its DSH homes and scratch copies in. The runner points
 * DSH_TEST_HOMES into its isolated tree (removed after the run); outside the runner a per-process
 * folder under the OS temp dir is used. The path always ends in .runtime/test-homes, which the live
 * world's worker checks before it writes anything.
 */
import os from 'node:os'
import path from 'node:path'
import { ENV, RUN } from './constants.mjs'

export const TEST_HOMES = process.env[ENV.homes] ?? path.join(os.tmpdir(), 'dsh-test-' + process.pid, ...RUN.homesTail)
