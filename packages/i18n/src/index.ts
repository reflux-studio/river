import { en, zh, type Dict } from './dict'
import type { Locale } from './locale'

export * from './locale'
export * from './presets'
export type { Dict }

export const dict = (locale: Locale): Dict => (locale === 'en' ? en : zh)
