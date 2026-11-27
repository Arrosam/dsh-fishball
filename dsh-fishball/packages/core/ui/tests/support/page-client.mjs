import { fileURLToPath } from 'node:url'

/** The page is a separate workspace; UI tests load only its exposed browser entry. */
export const PAGE_CLIENT = fileURLToPath(import.meta.resolve('fishball-page/client'))
