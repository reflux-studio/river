import { describe, expect, it } from 'vitest'
import { filterSay } from '../src/main/agents/leak'

describe('filterSay', () => {
  it('本人底牌点数（字母）', () => {
    expect(filterSay('我有 A', ['As', '7d'])).toBeNull()
    expect(filterSay('A 在手', ['Ah', '2c'])).toBeNull()
    expect(filterSay('老K说得对', ['Ks', '7d'])).toBe('老K说得对')
    expect(filterSay('K 大', ['Ks', '7d'])).toBeNull()
    expect(filterSay('OK 跟了', ['Ks', '7d'])).toBe('OK 跟了')
    expect(filterSay('我有 A', ['Ks', '7d'])).toBe('我有 A')
  })

  it('本人底牌点数（数字，T 视为 10）', () => {
    expect(filterSay('10 块钱都不给', ['Td', '3c'])).toBeNull()
    expect(filterSay('10 块钱都不给', ['9d', '3c'])).toBe('10 块钱都不给')
    expect(filterSay('100 块钱都不给', ['Td', '3c'])).toBe('100 块钱都不给')
    expect(filterSay('七上八下', ['7d', '8c'])).toBe('七上八下')
    expect(filterSay('差 7 点', ['7d', '8c'])).toBeNull()
    expect(filterSay('加到 1700', ['7d', '8c'])).toBe('加到 1700')
  })

  it('花色与关键词', () => {
    for (const t of ['♠ 来了', '口袋里有货', '底牌是好牌', '我有一对', '对子而已']) expect(filterSay(t, ['2c', '3d'])).toBeNull()
  })

  it('超过 40 字截断，空白整句丢弃', () => {
    expect(filterSay('哈'.repeat(50), ['2c', '3d'])).toBe('哈'.repeat(40))
    expect(filterSay('   ', ['2c', '3d'])).toBeNull()
  })

  it('截断造出的新边界也算泄牌', () => {
    expect(filterSay('哈'.repeat(38) + '加50', ['5d', '9c'])).toBeNull()
    expect(filterSay('哈'.repeat(38) + '拿AK', ['As', '9c'])).toBeNull()
    // 未被截断时“50”不含点数 5
    expect(filterSay('哈'.repeat(37) + '加50', ['5d', '9c'])).toBe('哈'.repeat(37) + '加50')
  })
})
