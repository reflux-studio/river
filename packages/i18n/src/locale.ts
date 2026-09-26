export type Locale = 'zh' | 'en'

export const resolveLocale = (tag: string): Locale => (/^zh/i.test(tag) ? 'zh' : 'en')
