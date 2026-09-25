import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { FULL, Table } from '@river/engine'
import { disp } from '../src/shared/format'
import { handRecord, heroHandSummary, opponentSummary, positions, situation } from '../src/main/table/text'

// 这里的用例只关心按钮位置：首个随机数定按钮（startHand 再前移一位），牌面无关
function table(stacks: number[], o: { button: number }) {
  const n = stacks.length
  let first = true
  const rng = () => (first ? ((first = false), (((o.button - 1 + n) % n) + 0.5) / n) : 0.5)
  const t = new Table({ smallBlind: 5, bigBlind: 10 }, n, rng)
  stacks.forEach((s, i) => t.sitDown(i, s))
  t.startHand()
  return t
}

describe('局面文本', () => {
  const seats = ['你', '阿狸', '老K', '石头'].map((name, i) => ({ id: String(i), name, tag: i ? '标签' : '' }))
  const t = () => table([1000, 1000, 1000, 1000], { button: 0 })
  it('对手视角：「你」只指自己，玩家写作「玩家」，带盲注、投入与所需胜率', () => {
    const s = situation(t(), seats, 1)
    expect(s).toContain('无限注 · 盲注 5/10 · 4 人桌')
    expect(s).toContain('你的位置：小盲')
    expect(s).toContain('当前牌型：')
    expect(s).toContain('- 你（小盲）：筹码 995，本轮已下 5，本手共投入 5（含本轮）')
    expect(s).toContain('- 玩家（按钮）：')
    expect(s).toMatch(/- 石头（枪口，标签）：筹码 1,000\n/)
    expect(s).toContain('所需胜率（底池赔率）：25.0%')
    expect(s).not.toContain('胜率约')
    expect(s).toContain('本手行动：你 小盲 5，老K 大盲 10')
    expect(s).not.toMatch(/你（按钮|你 大盲/)
  })
  it('教练视角：称玩家', () => {
    const s = situation(t(), seats, 0, { you: false })
    expect(s).toContain('玩家的位置：按钮')
    expect(s).not.toContain('你')
  })
})

describe('往手摘要称呼', () => {
  it('对手摘要：玩家写「玩家」、自己写「你」；教练摘要：玩家写「玩家」', () => {
    const seats = ['你', '阿狸', '老K'].map((name, i) => ({ id: i ? `p${i}` : 'hero', ...(i && { personaId: `p${i}` }), name, tag: '' }))
    const t = table([1000, 1000, 1000], { button: 0 })
    while (t.isHandInProgress()) {
      if (t.isBettingRoundInProgress()) t.actionTaken(t.legalActions().toCall ? 'call' : 'check')
      else if (t.areBettingRoundsCompleted()) t.showdown()
      else t.endBettingRound()
    }
    const rec = handRecord(t, seats, 'coach', { sb: 5, bb: 10 }, () => '')
    const s = opponentSummary(rec, 'p1')
    expect(s).toContain('玩家（按钮）')
    expect(s).toContain('你（小盲）')
    expect(s).toContain('老K（大盲）')
    expect(s).toMatch(/行动：你小盲 5，老K大盲 10，玩家跟注 10/)
    expect(heroHandSummary(rec)).toMatch(/行动：阿狸小盲 5，老K大盲 10，玩家跟注 10/)
  })
})

describe('位置', () => {
  const pos = (t: Table) => positions(t).map((x) => `${x.seat}:${x.pos}`).join(' ')
  it('六人桌按小盲起排到按钮', () => {
    expect(pos(table([1000, 1000, 1000, 1000, 1000, 1000], { button: 0 }))).toBe('1:小盲 2:大盲 3:枪口 4:中位 5:关煞 0:按钮')
  })
  it('跳过没筹码的座位', () => {
    expect(pos(table([1000, 0, 1000, 1000, 1000], { button: 0 }))).toBe('2:小盲 3:大盲 4:枪口 0:按钮')
  })
  it('单挑时按钮即小盲', () => {
    expect(pos(table([1000, 1000], { button: 0 }))).toBe('0:按钮/小盲 1:大盲')
  })
})

describe('与原型对照（牌面显示）', () => {
  it('52 张牌的 disp 与原型一致', () => {
    const src = readFileSync(resolve(__dirname, '../../../.rivo/issues/river-desktop/design-source/poker.js'), 'utf8')
    const ctx = vm.createContext({ window: {} })
    vm.runInContext(src, ctx)
    const P = ctx.window.RiverPoker
    for (const c of FULL) expect(disp(c)).toEqual(JSON.parse(JSON.stringify(P.disp(c))))
  })
})
