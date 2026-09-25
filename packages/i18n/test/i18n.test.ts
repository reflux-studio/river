import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { dict, presets, resolveLocale } from '../src'

// 带参数的词条用真值和假值各调一次，两条分支里的固定文字都能被检查到
const call = (f: (...a: unknown[]) => unknown, a: unknown[]) => {
  try {
    return f(...a)
  } catch {
    return undefined
  }
}
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v]
    : typeof v === 'function' ? [call(v as never, ['a', 'b', 'c', 'd', 'e']), call(v as never, [0, '', '', '', ''])].flatMap(strings)
      : v && typeof v === 'object' ? Object.values(v).flatMap(strings)
        : []

describe('i18n', () => {
  it('resolveLocale：zh* 为中文，其余为英文', () => {
    for (const t of ['zh', 'zh-CN', 'zh-TW', 'zh-Hant-HK']) expect(resolveLocale(t)).toBe('zh')
    for (const t of ['en', 'en-US', 'ja', 'fr-FR', '']) expect(resolveLocale(t)).toBe('en')
  })

  // 老用户的种子不能变：哈希取自迁移前 apps/desktop/src/shared/personas.ts 的 PERSONAS（a31d4f5）
  it('中文预设与旧 PERSONAS 逐字一致', () => {
    expect(createHash('sha256').update(JSON.stringify(presets.zh)).digest('hex')).toBe('83ddc2e1df5b14423871afa23d3b9c85082855ff0a021bae20458688753e5ea2')
  })

  it('两种语言的预设 id、顺序与 hue 一致', () => {
    expect(presets.en.map((p) => [p.id, p.hue])).toEqual(presets.zh.map((p) => [p.id, p.hue]))
  })

  it('英文字典与预设没有空词条（语言名除外）也没有汉字', () => {
    const { localeNames, ...common } = dict('en').common
    const all = strings({ ...dict('en'), common, presets: presets.en })
    expect(all.length).toBeGreaterThan(50)
    for (const s of all) {
      expect(s.trim()).not.toBe('')
      expect(s).not.toMatch(/\p{Script=Han}/u)
    }
    expect(localeNames).toEqual({ zh: '中文', en: 'English' })
  })
})
