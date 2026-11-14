/**
 * The Fishball page's pairing copy (task F-PAIR; R-ID-07, R-ID-10, R-NAME-03; cases AUTH-UC-05,
 * NAME-DT-03). PROPOSED wording (W3 question P-3): the user reviews the en and zh lists at the W3
 * merge. Data only: frozen strings and pure template formatters that interpolate names only.
 * F-WIRE draws it from `fishball-core/src/identity`'s `pairing.state()`.
 *
 * Keys follow the pairing state and choice words (`PAIRING_STATE`, `CHOICE`) and the K1 refusal
 * codes (`name-taken`, `name-invalid`), so a drawing never maps one word through a second table.
 */
export const PAIRING_TEXT = Object.freeze({
  en: Object.freeze({
    warnMatch: (name, lastSeen) => `This token is already paired with this id, by ${name} (last seen ${lastSeen}). Continue only if no other Fishball or agent uses this id with this token; otherwise use a new token and a new id.`,
    warnMismatch: (name, lastSeen) => `This token is already paired with another id, by ${name} (last seen ${lastSeen}). Use a new token.`,
    confirm: 'No other Fishball or agent uses this id with this token',
    continue: 'Continue with this pairing',
    newTokenAndId: 'Use a new token and a new id',
    newToken: 'Use a new token',
    needToken: 'Fishball needs a new token for this target.',
    needId: 'This id is used by another agent on that DSH. Choose a new id.',
    idMismatch: 'This token was paired with another id. Fishball needs a new token.',
    idInvalid: 'Not a valid id: use 1–64 letters, digits, "_" or "-". The previous id is kept.',
    nameTaken: 'This name is used by another agent on that DSH. Choose another.',
    nameInvalid: 'This name is invalid. Choose another.',
    nameInUse: (name) => `Fishball is shown as ${name}.`,
    nameless: (id) => `Fishball has no name for now and is shown as ID: ${id}.`,
    neverSeen: 'never',
  }),
  zh: Object.freeze({
    warnMatch: (name, lastSeen) => `此令牌已被 ${name} 以此 ID 配对（最近在线 ${lastSeen}）。仅当没有其他 Fishball 或智能体以此令牌使用此 ID 时才继续；否则请使用新的令牌和新的 ID。`,
    warnMismatch: (name, lastSeen) => `此令牌已被 ${name} 以另一个 ID 配对（最近在线 ${lastSeen}）。请使用新的令牌。`,
    confirm: '没有其他 Fishball 或智能体以此令牌使用此 ID',
    continue: '继续使用此配对',
    newTokenAndId: '使用新的令牌和新的 ID',
    newToken: '使用新的令牌',
    needToken: 'Fishball 需要此目标的新令牌。',
    needId: '此 ID 已被该 DSH 上的另一个智能体使用。请选择新的 ID。',
    idMismatch: '此令牌已与另一个 ID 配对。Fishball 需要新的令牌。',
    idInvalid: 'ID 无效：请使用 1–64 个字母、数字、"_" 或 "-"。已保留之前的 ID。',
    nameTaken: '此名称已被该 DSH 上的另一个智能体使用。请另选一个。',
    nameInvalid: '此名称无效。请另选一个。',
    nameInUse: (name) => `Fishball 显示为 ${name}。`,
    nameless: (id) => `Fishball 暂无名称，显示为 ID: ${id}。`,
    neverSeen: '从未',
  }),
})
