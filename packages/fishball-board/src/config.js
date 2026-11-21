import Schema from '@deepseek-ai/schemastery'

const SETTINGS = Object.freeze({
  inject: Object.freeze({
    defaultValue: true,
    description: 'Contribute the board context. The guide and tools remain available when this is off.',
  }),
  contextCards: Object.freeze({
    defaultValue: 20,
    min: 0,
    max: 30,
    description: 'Maximum cards in the board context; zero contributes only the counts line.',
  }),
  doneWindowHours: Object.freeze({
    defaultValue: 24,
    min: 0,
    max: 168,
    description: 'Hours covered by the recent-done count only. Closed-card visibility remains 30 days; archive history is never pruned while installed.',
  }),
})

const countSetting = ({ min, max, defaultValue, description }) =>
  Schema.natural().min(min).max(max).default(defaultValue).description(description)

export const Config = Schema.object({
  inject: Schema.boolean().default(SETTINGS.inject.defaultValue).description(SETTINGS.inject.description),
  contextCards: countSetting(SETTINGS.contextCards),
  doneWindowHours: countSetting(SETTINGS.doneWindowHours),
})
