import { fileURLToPath } from 'node:url'

/** The Fishball page has its own package exports, including its separate classic script. */
export const PAGE_CLIENT = fileURLToPath(import.meta.resolve('fishball-page/client'))
export const PAGE_ROW = fileURLToPath(import.meta.resolve('fishball-page'))
