import type { Locale } from './text'

export const number = (value: number, locale: Locale) =>
  Math.round(value).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')

export const signed = (value: number, locale: Locale) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), locale)}`

export const netColor = (value: number) =>
  value > 0 ? 'text-win' : value < 0 ? 'text-lose' : 'text-muted-foreground'
