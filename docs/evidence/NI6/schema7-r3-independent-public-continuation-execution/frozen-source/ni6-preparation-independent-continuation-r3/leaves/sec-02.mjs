import { runSecretCase } from '../secret-case.mjs';
export const run = () => runSecretCase('SEC-02', 'ni6-synthetic-' + String.fromCharCode(92) + 'slash-secret');
