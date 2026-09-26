import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { best, equity, FULL, handCat, outs, Table, type HandCat, type LogEntry } from '../src'
import { act, cards, checkDown, finish, mulberry32, rigged, stacks, table } from './helpers'

describe('牌型', () => {
  it('皇家同花顺', () => {
    expect(handCat(cards('As Ks Qs Js Ts 2d 3c'))).toBe('royalFlush')
  })
  it('同花顺胜过四条', () => {
    expect(handCat(cards('9h 8h 7h 6h 5h 9d 9c'))).toBe('straightFlush')
    expect(best(cards('9h 8h 7h 6h 5h 9d 9c'))).toBeGreaterThan(best(cards('9s 9h 9d 9c Kd')))
  })
  it('A-5 顺子是最小顺子', () => {
    expect(handCat(cards('Ah 2d 3c 4s 5h'))).toBe('straight')
    expect(best(cards('Ah 2d 3c 4s 5h'))).toBeLessThan(best(cards('2d 3c 4s 5h 6d')))
    expect(best(cards('Ah 2d 3c 4s 5h'))).toBeGreaterThan(best(cards('Ah Ad Ac Ks Qd')))
  })
  it('葫芦先比三条', () => {
    expect(best(cards('Kh Kd Kc 2s 2h'))).toBeGreaterThan(best(cards('Qh Qd Qc As Ah')))
  })
  it('同花比踢脚', () => {
    expect(best(cards('As Js 9s 5s 3s'))).toBeGreaterThan(best(cards('As Js 9s 5s 2s')))
  })
  it('两对比踢脚', () => {
    expect(best(cards('Kh Kd 9c 9s Ah'))).toBeGreaterThan(best(cards('Ks Kc 9h 9d Qh')))
  })
})

describe('发牌与盲注', () => {
  it('按指定顺序发牌（测试工具自检）', () => {
    const t = table([100, 100, 100], { button: 1, holes: ['Ah Ad', 'Kh Kd', '2c 3c'], board: '4s 5s 6s 7h 8h' })
    expect(t.holeCards()).toEqual([cards('Ah Ad'), cards('Kh Kd'), cards('2c 3c')])
    expect(t.button()).toBe(1)
  })

  it('单挑：按钮为小盲、翻前先行动，翻后后行动', () => {
    for (let b = 0; b < 2; b++) {
      const t = table([1000, 1000], { button: b })
      expect(t.blindSeats()).toEqual({ sb: b, bb: 1 - b })
      expect(t.playerToAct()).toBe(b)
      act(t, 'call')
      expect(act(t, 'check')).toBe(1 - b)
      t.endBettingRound()
      expect(t.roundOfBetting()).toBe('flop')
      expect(t.playerToAct()).toBe(1 - b)
    }
  })

  it('三人以上：小盲、大盲依次在按钮左侧，大盲左侧先行动，大盲有 option', () => {
    const t = table([1000, 1000, 1000, 1000], { button: 2 })
    expect(t.blindSeats()).toEqual({ sb: 3, bb: 0 })
    expect(t.playerToAct()).toBe(1)
    act(t, 'call'); act(t, 'call'); act(t, 'call')
    expect(t.playerToAct()).toBe(0)
    expect(t.legalActions()).toMatchObject({ actions: ['check', 'raise'], toCall: 0 })
    act(t, 'check')
    expect(t.isBettingRoundInProgress()).toBe(false)
  })

  it('按钮跳过没有筹码的座位', () => {
    // 构造时按钮在 0，startHand 前移一位时跳过无筹码的座位 1
    const t = new Table({ smallBlind: 5, bigBlind: 10 }, 3, rigged(3, 1, ['', '', '']))
    t.sitDown(0, 100); t.sitDown(1, 0); t.sitDown(2, 100)
    t.startHand()
    expect(t.button()).toBe(2)
    expect(t.seats()[1]!.out).toBe(true)
    expect(t.holeCards()[1]).toBeNull()
  })
})

describe('改进牌', () => {
  const n = (h: string, b: string) => outs(cards(h), b ? cards(b) : [])
  it('按「我的牌型领先公共牌」增加计数', () => {
    expect(n('Ah 5h', 'Kh 9h 2s')).toBe(15)
    expect(n('8s 7d', '6c 5h Ks')).toBe(14)
    expect(n('Ah 5d', 'Kh 9h 2s 7h')).toBe(14)
    expect(n('2c 3d', 'Kh 9h 5h 7h')).toBe(4)
    expect(n('2h 3d', 'Kh 9h 5h 7h')).toBe(0)
    expect(n('7s 7d', '7c Kh 2s')).toBe(7)
    // 旧口径（只看我的牌型升级）这里是 11：公共牌成对让我「升级」成两对也被算进去
    expect(n('7s 7d', 'Kc 9h 2s')).toBe(2)
    expect(n('5h 5d', '9c 9d 2s')).toBe(4)
  })
  it('翻牌前和河牌不计算', () => {
    expect(n('Ah 5h', '')).toBeNull()
    expect(n('Ah 5h', 'Kh 9h 2s 7c 3d')).toBeNull()
  })
})

describe('合法动作', () => {
  it('可过牌时不含弃牌；需跟注时给出弃牌与跟注', () => {
    const t = table([1000, 1000, 1000])
    expect(t.legalActions().actions).toEqual(['fold', 'call', 'raise'])
    act(t, 'call'); act(t, 'call')
    expect(t.legalActions().actions).toEqual(['check', 'raise'])
    act(t, 'check'); t.endBettingRound()
    expect(t.legalActions()).toMatchObject({ actions: ['check', 'bet'], chipRange: { min: 10, max: 990 } })
  })

  it('非法动作与越界金额抛错', () => {
    const t = table([1000, 1000, 1000])
    expect(() => t.actionTaken('check')).toThrow()
    expect(() => t.actionTaken('bet', 30)).toThrow()
    expect(() => t.actionTaken('raise', 15)).toThrow()
    expect(() => t.actionTaken('raise', 1001)).toThrow()
    t.actionTaken('raise', 20)
  })

  it('全下金额不足最小加注时 chipRange 为单点', () => {
    // 按钮 2：小盲 0、大盲 1，座位 2 先行动，只有 15（跟 10 之后最多到 15 < 最小加注到 20）
    const t = table([1000, 1000, 15], { button: 2 })
    expect(t.legalActions()).toEqual({ actions: ['fold', 'call', 'raise'], chipRange: { min: 15, max: 15 }, toCall: 10 })
  })

  it('对手都已全下时不能加注', () => {
    const t = table([1000, 300], { button: 0 })
    act(t, 'raise', 300)
    expect(t.legalActions().actions).toEqual(['fold', 'call'])
  })
})

describe('规则修正', () => {
  it('不完整加注：已跟注者只能跟或弃', () => {
    // 按钮 0：小盲 1、大盲 2（短码 150），座位 0 先行动
    const t = table([1000, 1000, 150], { button: 0 })
    expect(act(t, 'raise', 100)).toBe(0)
    expect(act(t, 'call')).toBe(1)
    expect(t.playerToAct()).toBe(2)
    act(t, 'raise', 150) // 增量 50 < 最小加注 90
    expect(t.playerToAct()).toBe(0)
    expect(t.legalActions().actions).toEqual(['fold', 'call'])
    expect(() => t.actionTaken('raise', 400)).toThrow()
    act(t, 'call')
    expect(t.legalActions().actions).toEqual(['fold', 'call'])
  })

  it('累计规则：100 → 全下 150 → 全下 220，最早的下注者重获加注权', () => {
    // 按钮 4：小盲 0、大盲 1，座位 2 先行动；座位 3（150）、4（220）短码
    const t = table([1000, 1000, 1000, 150, 220], { button: 4 })
    expect(act(t, 'raise', 100)).toBe(2)
    expect(act(t, 'raise', 150)).toBe(3) // 不完整
    expect(act(t, 'raise', 220)).toBe(4) // 仍不完整，但相对 100 已涨 120 ≥ 90
    expect(act(t, 'call')).toBe(0)
    expect(act(t, 'call')).toBe(1)
    expect(t.playerToAct()).toBe(2)
    expect(t.legalActions().actions).toEqual(['fold', 'call', 'raise'])
  })

  it('无人跟注的下注退回，不计入赢得', () => {
    const t = table([1000, 1000, 1000], { button: 0 })
    act(t, 'raise', 300)
    act(t, 'fold')
    act(t, 'fold')
    finish(t)
    // 座位 0 赢得盲注 15，退回自己多出的 290
    expect(t.winners()).toEqual([{ pot: 0, seat: 0, amount: 25, handCat: null }])
    expect(stacks(t)).toEqual([1015, 995, 990])
    expect(t.handLog().filter((e): e is Extract<LogEntry, { seat: number }> => 'seat' in e && e.type === 'return')).toEqual([
      { street: 'preflop', seat: 0, type: 'return', amount: 290, allIn: false }
    ])
  })

  it('摊牌输掉的大码不出现在赢家里（超出部分退回）', () => {
    const t = table([10000, 2000, 1000], { button: 2, holes: ['2c 7d', 'Ah Ad', '3c 4c'], board: 'Ks Qh 9d 5s 8c' })
    // 按钮 2：小盲 0、大盲 1、座位 2 先行动
    act(t, 'fold')
    act(t, 'raise', 10000)
    act(t, 'call')
    finish(t)
    expect(t.winners()).toEqual([{ pot: 0, seat: 1, amount: 4000, handCat: 'pair' }])
    expect(stacks(t)).toEqual([8000, 4000, 1000])
  })

  it('平分余数从按钮左侧起逐枚分配', () => {
    // 三人各投 41 的效果：用盲注 + 跟注凑不出奇数，改用 3 人全下 13 + 弃牌者 2
    const t = table([14, 14, 14, 1000], { sb: 1, bb: 2, button: 1, holes: ['Ah Kd', 'Ac Kh', 'As Kc', '2c 3d'], board: 'Qs Js Ts 4h 5h' })
    // 按钮 1：小盲 2、大盲 3，座位 0 先行动
    act(t, 'raise', 14)
    act(t, 'call')
    act(t, 'call')
    act(t, 'fold') // 大盲弃，留下 2
    finish(t)
    // 底池 14*3 + 2 = 44，三人平分：每人 14，余 2 从按钮左侧（座位 2、再座位 0）逐枚分
    const won = new Map(t.winners().map((w) => [w.seat, w.amount]))
    expect([won.get(0), won.get(1), won.get(2)]).toEqual([15, 14, 15])
    expect(t.winners().every((w) => w.handCat === 'straight')).toBe(true)
  })

  it('边池：三人全下 100/300/600', () => {
    const t = table([100, 300, 600], { sb: 1, bb: 2, button: 2, holes: ['Ah Ad', 'Kh Kd', '4c 5c'], board: '2c 7d 9h Js 3s' })
    // 按钮 2：小盲 0、大盲 1、座位 2 先行动
    act(t, 'raise', 600)
    act(t, 'call')
    act(t, 'call')
    finish(t)
    expect(t.winners()).toEqual([
      { pot: 0, seat: 0, amount: 300, handCat: 'pair' },
      { pot: 1, seat: 1, amount: 400, handCat: 'pair' }
    ])
    // 座位 2 超出 300 的部分无人跟注，退回
    expect(stacks(t)).toEqual([300, 400, 300])
    expect(t.roundOfBetting()).toBe('showdown')
  })
})

describe('流程', () => {
  it('所有人全下后逐街发完', () => {
    const t = table([200, 300, 400], { button: 0 })
    while (t.isBettingRoundInProgress()) {
      const L = t.legalActions()
      t.actionTaken(L.actions.includes('raise') ? 'raise' : 'call', L.chipRange?.max)
    }
    const seen: number[] = []
    while (t.isHandInProgress()) {
      expect(t.isBettingRoundInProgress()).toBe(false)
      t.endBettingRound()
      seen.push(t.communityCards().length)
      if (t.areBettingRoundsCompleted()) t.showdown()
    }
    expect(seen).toEqual([3, 4, 5, 5])
    expect(stacks(t).reduce((a, b) => a + b)).toBe(900)
  })

  it('只剩一人时 endBettingRound 直接完成，不再发牌', () => {
    const t = table([1000, 1000, 1000])
    act(t, 'fold')
    act(t, 'fold')
    expect(t.isBettingRoundInProgress()).toBe(false)
    t.endBettingRound()
    expect(t.areBettingRoundsCompleted()).toBe(true)
    expect(t.communityCards()).toEqual([])
    t.showdown()
    expect(t.isHandInProgress()).toBe(false)
  })

  it('大盲短码全下时其余人仍需跟满大盲，多余部分退回', () => {
    const t = table([1000, 1000, 3], { button: 0 })
    // 按钮 0：小盲 1、大盲 2（只有 3）
    act(t, 'call')
    act(t, 'call')
    checkDown(t)
    expect(stacks(t).reduce((a, b) => a + b)).toBe(2003)
    expect(t.handLog().some((e) => 'type' in e && e.type === 'return')).toBe(false)
  })

  it('abortHand 恢复本手开始时的筹码', () => {
    const t = table([1000, 1000, 1000])
    act(t, 'raise', 300)
    act(t, 'call')
    t.abortHand()
    expect(t.isHandInProgress()).toBe(false)
    expect(stacks(t)).toEqual([1000, 1000, 1000])
    expect(t.winners()).toEqual([])
    t.startHand()
  })

  it('两手之间才能改座位与筹码', () => {
    const t = table([1000, 1000])
    expect(() => t.setStack(0, 5)).toThrow()
    act(t, 'fold')
    finish(t)
    t.setStack(0, 5)
    expect(stacks(t)[0]).toBe(5)
  })

  it('pots() 只含已收的筹码，totalPot() 含本轮下注', () => {
    const t = table([1000, 1000, 1000])
    expect(t.pots()).toEqual([])
    expect(t.totalPot()).toBe(15)
    act(t, 'call'); act(t, 'call'); act(t, 'check')
    t.endBettingRound()
    expect(t.pots()).toEqual([{ size: 30, eligible: [0, 1, 2] }])
    act(t, 'bet', 20)
    expect(t.totalPot()).toBe(50)
    expect(t.pots()).toEqual([{ size: 30, eligible: [0, 1, 2] }])
  })
})

describe('随机压测', () => {
  it('3000 手随机合法动作：每手能结束、筹码守恒、legalActions 给出的动作都被接受', () => {
    const rng = mulberry32(7)
    let hands = 0
    for (let g = 0; hands < 3000; g++) {
      const n = 2 + (g % 5)
      const t = new Table({ smallBlind: 5, bigBlind: 10 }, n, rng)
      for (let i = 0; i < n; i++) t.sitDown(i, 10 * (1 + ((rng() * 300) | 0)))
      const sum = stacks(t).reduce((a, b) => a + b)
      for (let h = 0; h < 12 && hands < 3000; h++) {
        if (t.seats().filter((s) => s!.stack > 0).length < 2) break
        t.startHand()
        hands++
        let steps = 0
        while (t.isHandInProgress()) {
          if (++steps > 500) throw new Error('hand did not finish')
          if (t.isBettingRoundInProgress()) {
            const L = t.legalActions()
            const a = L.actions[(rng() * L.actions.length) | 0]
            const r = L.chipRange
            t.actionTaken(a, r && (rng() < 0.3 ? r.max : r.min + (((r.max - r.min) * rng()) | 0)))
          } else {
            t.endBettingRound()
            if (t.areBettingRoundsCompleted()) t.showdown()
          }
          expect(stacks(t).reduce((a, b) => a + b) + (t.isHandInProgress() ? t.totalPot() : 0)).toBe(sum)
        }
        const won = t.winners().reduce((a, w) => a + w.amount, 0)
        const net = stacks(t).reduce((a, b) => a + b) - t.seats().reduce((a, s) => a + s!.startStack, 0)
        expect(net).toBe(0)
        expect(won).toBeGreaterThan(0)
      }
    }
  })
})

describe('与原型对照（牌型评估）', () => {
  const src = readFileSync(resolve(__dirname, '../../../.rivo/issues/river-desktop/design-source/poker.js'), 'utf8')
  const ctx = vm.createContext({ window: {} })
  vm.runInContext(src, ctx)
  const P = ctx.window.RiverPoker
  // 原型返回中文牌型名；本地映射，不引用 @river/i18n（i18n 依赖 engine）
  const ZH: Record<HandCat, string> = {
    highCard: '高牌', pair: '一对', twoPair: '两对', trips: '三条', straight: '顺子', flush: '同花', fullHouse: '葫芦',
    quads: '四条', straightFlush: '同花顺', royalFlush: '皇家同花顺', pocketPair: '口袋对子', suitedHole: '同花底牌'
  }

  it('2000 组随机 2–7 张牌：牌型、outs 一致；equity 在相同随机序列下一致', () => {
    const rng = mulberry32(2026)
    for (let k = 0; k < 2000; k++) {
      const deck = FULL.slice().sort(() => rng() - 0.5)
      const hole = deck.slice(0, 2)
      const board = deck.slice(2, 2 + [0, 3, 4, 5][(rng() * 4) | 0])
      expect(ZH[handCat(hole.concat(board))]).toBe(P.handName(hole.concat(board)))
      if (k % 100 === 0) {
        const seed = 9000 + k
        const mine = equity(hole, board, 2, 200, mulberry32(seed))
        vm.runInContext(`Math.random = (${mulberry32.toString()})(${seed})`, ctx)
        expect(mine).toBe(P.equity(hole, board, 2, 200))
      }
    }
  }, 30_000)
})

describe('底池划分', () => {
  it('pots() 与 showdown 一致：资格相同的相邻层合并（审阅 T2-T5-1 L1）', () => {
    const t = new Table({ smallBlind: 5, bigBlind: 10 }, 3)
    for (let i = 0; i < 3; i++) t.sitDown(i, 1000)
    t.startHand()
    const { bb } = t.blindSeats()
    while (t.isBettingRoundInProgress()) {
      const p = t.playerToAct()
      if (p === bb) t.actionTaken('fold')
      else if (t.currentBet() < 30) t.actionTaken('raise', 30)
      else t.actionTaken('call')
    }
    t.endBettingRound()
    const pots = t.pots()
    expect(pots).toHaveLength(1)
    expect(pots[0].size).toBe(70)
    while (t.isHandInProgress()) {
      if (t.isBettingRoundInProgress()) t.actionTaken('check')
      else if (!t.areBettingRoundsCompleted()) t.endBettingRound()
      else t.showdown()
    }
    expect(new Set(t.winners().map((w) => w.pot))).toEqual(new Set([0]))
  })
})
