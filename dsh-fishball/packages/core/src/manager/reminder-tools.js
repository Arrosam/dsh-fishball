/**
 * The names of Fishball's reminder tools (src/manager/reminders.js, V3 F-WIRE): the schedule tool's
 * names, so the persona and the model's habits carry over from the main DSH. In its own module, with
 * no import, so the persona (src/persona.js) reads them
 * without loading DSH's host packages.
 */
export const TOOL = Object.freeze({
  create: 'schedule_create',
  list: 'schedule_list',
  update: 'schedule_update',
  delete: 'schedule_delete',
})
