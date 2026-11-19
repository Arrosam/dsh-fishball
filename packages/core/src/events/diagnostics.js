/**
 * One rule for what a failure contributes to the background log: its `code` or its `name`, never
 * its message or the value itself, because a port's error text could carry payload or token text
 * into the log (R-INT-09, R-SEC-02).
 */
export const codeOf = (error) => String(error?.code ?? error?.name ?? typeof error)
