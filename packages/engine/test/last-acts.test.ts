import { describe, expect, it } from 'vitest'
import { lastActs, Table, type LastAct, type LogEntry, type Street } from '../src'
import { act, mulberry32, table } from './helpers'

const acts = (t: Table, street: Street = t.roundOfBetting()) => Object.fromEntries(lastActs(t.handLog(), street))

describe('lastActs', () => {
  it('被退回的下注仍记为下注，退回记录不覆盖', () => {
    // 按钮 0：小盲 1、大盲 2，座位 0 先行动；翻牌后座位 1 先行动
    const t = table([1000, 1000, 1000], { button: 0 })
    act(t, 'call'); act(t, 'call'); act(t, 'check')
    t.endBettingRound()
    act(t, 'bet', 50); act(t, 'fold'); act(t, 'fold')
    t.endBettingRound()
    expect(t.handLog().at(-1)).toMatchObject({ street: 'flop', seat: 1, type: 'return' })
    expect(acts(t, 'flop')).toEqual({ 0: 'fold', 1: 'bet', 2: 'fold' })
  })

  it('盲注不算动作；短码全下交盲注记为 allin', () => {
    // 按钮 0：小盲 1、大盲 2（只有 3，交盲注即全下）
    const t = table([1000, 1000, 3], { button: 0 })
    expect(acts(t)).toEqual({ 2: 'allin' })
    act(t, 'call')
    expect(acts(t)).toEqual({ 0: 'call', 2: 'allin' })
    act(t, 'raise', 40)
    expect(acts(t)).toEqual({ 0: 'call', 1: 'raise', 2: 'allin' })
  })

  it('换街后清空，上一街仍可按街查询', () => {
    const t = table([1000, 1000, 1000], { button: 0 })
    act(t, 'raise', 30); act(t, 'call'); act(t, 'fold')
    t.endBettingRound()
    expect(acts(t)).toEqual({})
    expect(acts(t, 'preflop')).toEqual({ 0: 'raise', 1: 'call', 2: 'fold' })
    act(t, 'check')
    expect(acts(t)).toEqual({ 1: 'check' })
  })

  it('随机压测：每一步里每个座位的结果等于该座位本街最后一条有效记录', () => {
    const expected = (log: LogEntry[], street: Street) => {
      const out = new Map<number, LastAct>()
      for (const e of log) {
        if (!('seat' in e) || e.street !== street || e.type === 'return' || (e.type === 'blind' && !e.allIn)) continue
        out.set(e.seat, e.allIn ? 'allin' : (e.type as LastAct))
      }
      return out
    }
    const rng = mulberry32(11)
    let hands = 0
    for (let g = 0; hands < 1000; g++) {
      const n = 2 + (g % 5)
      const t = new Table({ smallBlind: 5, bigBlind: 10 }, n, rng)
      for (let i = 0; i < n; i++) t.sitDown(i, 5 * (1 + ((rng() * 100) | 0)))
      for (let h = 0; h < 12 && hands < 1000; h++) {
        if (t.seats().filter((s) => s!.stack > 0).length < 2) break
        t.startHand()
        hands++
        const check = () => {
          const log = t.handLog()
          for (const st of ['preflop', 'flop', 'turn', 'river'] as const) expect(lastActs(log, st)).toEqual(expected(log, st))
        }
        check()
        while (t.isHandInProgress()) {
          if (t.isBettingRoundInProgress()) {
            const L = t.legalActions()
            const a = L.actions[(rng() * L.actions.length) | 0]
            const r = L.chipRange
            t.actionTaken(a, r && (rng() < 0.3 ? r.max : r.min + (((r.max - r.min) * rng()) | 0)))
          } else {
            t.endBettingRound()
            if (t.areBettingRoundsCompleted()) t.showdown()
          }
          check()
        }
      }
    }
  })
})
