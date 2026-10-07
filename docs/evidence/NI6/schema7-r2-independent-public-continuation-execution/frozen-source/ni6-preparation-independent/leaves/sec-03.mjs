import { runSecretCase } from '../secret-case.mjs';
export const run = () => runSecretCase('SEC-03', 'ni6-synthetic-' + String.fromCharCode(10) + 'newline-secret');
