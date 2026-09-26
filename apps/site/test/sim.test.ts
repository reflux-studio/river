import { describe, expect, it } from 'vitest'
import { createSim, step } from '../src/sim/sim'
import { toSeatView } from '../src/sim/to-seat-view'

// 可复现的伪随机
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

describe('演示桌', () => {
  it('连续跑很多手不抛错，英文视图没有汉字，筹码守恒（含重新买入）', () => {
    const rng = lcg(7)
    const sim = createSim(['bai', 'li', 'k', 'prof', 'may'], rng)
    let now = 0
    let buyIns = 5
    let lastHand = sim.table.handNumber()
    while (sim.table.handNumber() < 40) {
      const before = sim.table.seats().filter((s) => s!.stack <= 0).length
      const handBefore = sim.table.handNumber()
      now += step(sim, now, rng)
      if (sim.table.handNumber() !== handBefore) buyIns += before
      const en = toSeatView(sim, 'en')
      expect(JSON.stringify(en)).not.toMatch(/\p{Script=Han}/u)
      toSeatView(sim, 'zh')
      const chips = sim.table.seats().reduce((a, s) => a + s!.stack, 0) + (sim.table.isHandInProgress() ? sim.table.totalPot() : 0)
      expect(chips).toBe(buyIns * 10000)
      lastHand = sim.table.handNumber()
    }
    expect(lastHand).toBe(40)
  }, 60_000)
})
