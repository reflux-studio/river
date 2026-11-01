import { describe, expect, it } from 'vitest'
import { Deck } from '../src'
import { mulberry32, table } from './helpers'

describe('牌堆', () => {
  it('逐张取牌，剩余数递减，取空后报错', () => {
    const deck = new Deck(mulberry32(1))
    expect(deck.remaining).toBe(52)
    const seen = new Set<string>()
    for (let i = 0; i < 52; i++) seen.add(deck.draw())
    expect(seen.size).toBe(52)
    expect(deck.remaining).toBe(0)
    expect(() => deck.draw()).toThrow('deck is empty')
  })

  it('切牌把顶部 n 张移到最下面，剩余张数不变', () => {
    const source = new Deck(mulberry32(2))
    const order = Array.from({ length: 52 }, () => source.draw())
    const cut = new Deck(mulberry32(2))
    cut.cut(3)
    expect(cut.remaining).toBe(52)
    // 切掉顶部 3 张后，原本从顶部数第 4 张成为新的顶牌
    expect([cut.draw(), cut.draw(), cut.draw()]).toEqual([order[3], order[4], order[5]])
  })
})

describe('发牌事件', () => {
  it('底牌按圈逐座，公共牌与烧牌按街记录，seq 连续', () => {
    const t = table([100, 100, 100], { holes: ['Ah Ad', 'Kh Kd', '2c 3c'], board: '4s 5s 6s 7h 8h' })
    const events = t.dealEvents()
    expect(events.slice(0, 6)).toEqual([
      { seq: 0, street: 'preflop', round: 0, seat: 0, board: null, burn: false },
      { seq: 1, street: 'preflop', round: 0, seat: 1, board: null, burn: false },
      { seq: 2, street: 'preflop', round: 0, seat: 2, board: null, burn: false },
      { seq: 3, street: 'preflop', round: 1, seat: 0, board: null, burn: false },
      { seq: 4, street: 'preflop', round: 1, seat: 1, board: null, burn: false },
      { seq: 5, street: 'preflop', round: 1, seat: 2, board: null, burn: false }
    ])
    // 翻前先补齐跟注，之后各街过牌
    while (t.isHandInProgress()) {
      if (t.isBettingRoundInProgress()) t.actionTaken(t.legalActions().toCall > 0 ? 'call' : 'check')
      else {
        t.endBettingRound()
        if (t.areBettingRoundsCompleted()) t.showdown()
      }
    }
    expect(t.dealEvents().slice(6)).toEqual([
      { seq: 6, street: 'preflop', round: 0, seat: null, board: null, burn: true },
      { seq: 7, street: 'flop', round: 0, seat: null, board: 0, burn: false },
      { seq: 8, street: 'flop', round: 0, seat: null, board: 1, burn: false },
      { seq: 9, street: 'flop', round: 0, seat: null, board: 2, burn: false },
      { seq: 10, street: 'flop', round: 0, seat: null, board: null, burn: true },
      { seq: 11, street: 'turn', round: 0, seat: null, board: 3, burn: false },
      { seq: 12, street: 'turn', round: 0, seat: null, board: null, burn: true },
      { seq: 13, street: 'river', round: 0, seat: null, board: 4, burn: false }
    ])
  })

  it('座位缺人时不发牌，事件只覆盖实际参与座位', () => {
    const t = table([100, 100, 0], { holes: ['Ah Ad', 'Kh Kd', ''] })
    const seats = t.dealEvents().filter((e) => e.seat !== null)
    expect(seats.map((e) => [e.seat, e.round])).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]])
  })
})
