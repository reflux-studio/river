import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  apply, best, decide, disp, equity, handName, legal, newGame, outs, runoutStep, showdown, startHand,
  type Action, type Game, type Profile
} from '../src/main/engine/poker'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const seats = (stacks: number[]) =>
  stacks.map((stack, k) => ({ id: 'p' + k, name: 'P' + k, isHero: k === 0, stack }))

const cards = (s: string) => s.split(' ')

describe('牌型', () => {
  it('皇家同花顺', () => {
    expect(handName(cards('As Ks Qs Js Ts 2d 3c'))).toBe('皇家同花顺')
  })
  it('同花顺胜过四条', () => {
    expect(handName(cards('9h 8h 7h 6h 5h 9d 9c'))).toBe('同花顺')
    expect(best(cards('9h 8h 7h 6h 5h 9d 9c'))).toBeGreaterThan(best(cards('9s 9h 9d 9c Kd')))
  })
  it('A-5 顺子是最小顺子', () => {
    expect(handName(cards('Ah 2d 3c 4s 5h'))).toBe('顺子')
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

describe('摊牌分池', () => {
  const board = cards('2c 7d 9h Js 3s')
  function atShowdown(contribs: number[], holes: string[], folded: boolean[] = []) {
    const g = newGame({ sb: 1, bb: 2, players: seats(contribs.map(() => 0)) }, mulberry32(1))
    g.board = board
    g.players.forEach((p, k) => {
      p.contrib = contribs[k]
      p.hole = cards(holes[k])
      p.folded = !!folded[k]
      p.allin = !p.folded
    })
    showdown(g)
    return g
  }

  it('三人全下 100/300/600：主池、边池、退回未跟注部分', () => {
    const g = atShowdown([100, 300, 600], ['Ah Ad', 'Kh Kd', '4c 5c'])
    expect(g.winners).toEqual([
      { id: 'p0', amount: 300, handName: '一对' },
      { id: 'p1', amount: 400, handName: '一对' },
      { id: 'p2', amount: 300, handName: '高牌' }
    ])
    expect(g.players.map(p => p.stack)).toEqual([300, 400, 300])
    expect(g.showdown).toBe(true)
    expect(g.done).toBe(true)
  })

  it('平分时余数给第一位赢家', () => {
    const g = atShowdown([51, 51, 51], ['Ah Kd', 'Ac Kh', 'Qc Qd'], [false, false, true])
    expect(g.winners).toEqual([
      { id: 'p0', amount: 77, handName: '高牌' },
      { id: 'p1', amount: 76, handName: '高牌' }
    ])
  })
})

describe('流程', () => {
  it('单挑：庄家为小盲且翻前先行动', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = newGame({ sb: 5, bb: 10, players: seats([1000, 1000]) }, mulberry32(seed))
      startHand(g)
      expect(g.sbI).toBe(g.dealer)
      expect(g.toAct).toBe(g.dealer)
      expect(g.players[g.sbI].bet).toBe(5)
      expect(g.players[g.bbI].bet).toBe(10)
    }
  })

  it('全员全下后 runout，逐张发至摊牌', () => {
    const g = newGame({ sb: 5, bb: 10, players: seats([200, 300, 400]) }, mulberry32(7))
    startHand(g)
    while (!g.runout && !g.done) apply(g, g.toAct, { type: 'raise', to: 100000 })
    expect(g.runout).toBe(true)
    expect(g.toAct).toBe(-1)
    expect(g.board).toHaveLength(0)
    const seen: number[] = []
    while (!g.done) { runoutStep(g); seen.push(g.board.length) }
    expect(seen).toEqual([3, 4, 5, 5])
    expect(g.street).toBe('showdown')
    expect(g.players.reduce((a, p) => a + p.stack, 0)).toBe(900)
  })

  it('纠正：面对下注的过牌变跟注', () => {
    const g = newGame({ sb: 5, bb: 10, players: seats([1000, 1000, 1000]) }, mulberry32(3))
    startHand(g)
    expect(apply(g, g.toAct, { type: 'check' })).toBe('跟注 10')
  })

  it('纠正：不能加注时 raise 变 call 或 check', () => {
    const g = newGame({ sb: 5, bb: 10, players: seats([1000, 1000]) }, mulberry32(4))
    startHand(g)
    const first = g.toAct
    expect(apply(g, first, { type: 'raise', to: 100000 })).toBe('全下 1,000')
    const other = g.toAct
    expect(legal(g, other).canRaise).toBe(false)
    expect(apply(g, other, { type: 'raise', to: 500 })).toBe('全下 1,000')

    // 短码盲注即全下：另一人无对手可加注，toCall > 0 时变跟注，toCall = 0 时变过牌
    const roles = new Set<string>()
    for (let seed = 1; seed <= 8; seed++) {
      const h = newGame({ sb: 5, bb: 10, players: seats([3, 1000]) }, mulberry32(seed))
      startHand(h)
      const shortIsBB = h.bbI === 0
      roles.add(String(shortIsBB))
      expect(legal(h, h.toAct).canRaise).toBe(false)
      expect(apply(h, h.toAct, { type: 'raise', to: 500 })).toBe(shortIsBB ? '跟注 5' : '过牌')
      expect(h.runout).toBe(true)
    }
    expect(roles.size).toBe(2)
  })

  it('纠正：加注额夹在 [minTo, maxTo]', () => {
    const g = newGame({ sb: 5, bb: 10, players: seats([1000, 1000, 1000]) }, mulberry32(6))
    startHand(g)
    expect(apply(g, g.toAct, { type: 'raise', to: 11 })).toBe('加注至 20')
    expect(apply(g, g.toAct, { type: 'raise', to: 1e9 })).toBe('全下 1,000')
  })

  it('无人下注时加注标为“下注”', () => {
    const g = newGame({ sb: 5, bb: 10, players: seats([1000, 1000]) }, mulberry32(8))
    startHand(g)
    apply(g, g.toAct, { type: 'call' })
    apply(g, g.toAct, { type: 'check' })
    expect(g.street).toBe('flop')
    expect(apply(g, g.toAct, { type: 'raise', to: 40 })).toBe('下注 40')
  })
})

describe('可复现', () => {
  it('固定种子下 equity 与 decide 可复现', () => {
    const run = () => {
      const rng = mulberry32(42)
      const g = newGame({ sb: 5, bb: 10, players: seats([1000, 1000, 1000, 1000]) }, rng)
      startHand(g)
      const pp: Profile = { tight: 0.5, aggr: 0.5, bluff: 0.3, call: 0.3 }
      const acts: Action[] = []
      while (!g.done && !g.runout) { const a = decide(g, g.toAct, pp); acts.push(a); apply(g, g.toAct, a) }
      return { acts, eq: equity(cards('Ah Kh'), cards('2h 7h Tc'), 2, 500, mulberry32(9)), deck: g.deck }
    }
    expect(run()).toEqual(run())
  })
})

describe('与原型对照', () => {
  const src = readFileSync(resolve(__dirname, '../.rivo/issues/river-desktop/design-source/poker.js'), 'utf8')

  function loadProto(seed: number) {
    const ctx = vm.createContext({ window: {}, rng: mulberry32(seed) })
    vm.runInContext('Math.random = rng;\n' + src, ctx)
    return ctx.window.RiverPoker
  }
  const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x))
  const state = ({ rng: _rng, ...s }: Game) => plain(s)

  it('200 手随机局面：legal / apply / decide / 摊牌一致', () => {
    const script = mulberry32(2026)
    let hands = 0, game = 0
    while (hands < 200) {
      const seed = 1000 + game++
      const P = loadProto(seed)
      const n = 2 + ((script() * 5) | 0)
      const bb = [2, 10, 20][(script() * 3) | 0]
      const stacks = Array.from({ length: n }, () => bb * (3 + ((script() * 150) | 0)))
      const cfg = { sb: bb / 2, bb, players: seats(stacks) }
      const pg = P.newGame(plain(cfg))
      const g: Game = newGame(plain(cfg), mulberry32(seed))
      const pp: Profile = { tight: script(), aggr: script(), bluff: script(), call: script() }

      // newGame 为满足类型补的初值只允许出现在发牌前，startHand 后的整体比较会证明它们已被覆盖
      const { sbI, bbI, deck, toAct, currentBet, minRaise, winners, showdown, runout, players, ...pre } = state(g)
      expect({ ...pre, players: players.map(({ startStack, ...p }) => p) }).toEqual(plain(pg))

      for (let h = 0; h < 6 && hands < 200; h++) {
        if (g.players.filter(p => p.stack > 0).length < 2) break
        P.startHand(pg); startHand(g); hands++
        expect(state(g)).toEqual(plain(pg))
        expect([g.dealer, g.sbI, g.bbI, g.toAct]).toEqual([pg.dealer, pg.sbI, pg.bbI, pg.toAct])
        while (!g.done) {
          if (g.runout) { P.runoutStep(pg); runoutStep(g) }
          else {
            const i = g.toAct
            expect(i).toBe(pg.toAct)
            expect(legal(g, i)).toEqual(plain(P.legal(pg, i)))
            let a: Action
            if (script() < 0.7) {
              a = decide(g, i, pp)
              expect(a).toEqual(plain(P.decide(pg, i, pp)))
            } else {
              const types = ['fold', 'check', 'call', 'raise'] as const
              a = { type: types[(script() * 4) | 0], to: (script() * g.players[i].startStack * 1.5) | 0 }
            }
            expect(apply(g, i, a)).toBe(P.apply(pg, i, plain(a)))
          }
          expect(state(g)).toEqual(plain(pg))
          for (const p of g.players) if (p.hole.length) {
            expect(outs(p.hole, g.board)).toBe(P.outs(p.hole, g.board))
            expect(handName(p.hole.concat(g.board))).toBe(P.handName(p.hole.concat(g.board)))
            expect(disp(p.hole[0])).toEqual(plain(P.disp(p.hole[0])))
          }
        }
        expect(pg.done).toBe(true)
        expect(g.winners).toEqual(plain(pg.winners))
        expect(g.showdown).toBe(pg.showdown)
        expect(g.players.map(p => p.stack)).toEqual(plain(pg.players.map((p: { stack: number }) => p.stack)))
      }
    }
    expect(hands).toBe(200)
  }, 120_000)
})
