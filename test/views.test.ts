import { describe, expect, it } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'
import { coachTools } from '../src/main/agents/tools'
import { buildSeatView, heroHandSummary, publicHandResult, type TableQuery } from '../src/main/agents/views'
import { apply, newGame, runoutStep, startHand, txt, type Action, type Game } from '../src/main/engine/poker'
import type { Card, HandRecord } from '../src/shared/types'

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
}

const IDS = ['hero', 'li', 'k', 'bai']
function game(seed: number, stacks = [10000, 10000, 10000, 10000]) {
  const g = newGame({ sb: 50, bb: 100, players: IDS.map((id, i) => ({ id, personaId: i ? id : undefined, name: i ? id.toUpperCase() : '你', isHero: !i, stack: stacks[i] })) }, seeded(seed))
  startHand(g)
  return g
}
const nameOf = (g: Game) => (id: string) => g.players.find((p) => p.id === id)!.name

// 与原型 onHandEnd 相同的记录构造：hole 只给玩家与摊牌者
function record(g: Game): HandRecord {
  const h = g.players[0]
  return {
    hand: g.hand, sb: g.sb, bb: g.bb, net: h.stack - h.startStack, pot: g.players.reduce((a, p) => a + p.contrib, 0), showdown: g.showdown,
    hero: h.hole.slice(), board: g.board.slice(),
    players: g.players.filter((p) => !p.out).map((p) => ({
      id: p.id, personaId: p.personaId, name: p.name, hole: p.isHero || (g.showdown && !p.folded) ? p.hole.slice() : null,
      folded: p.folded, handName: p.handName || '', won: g.winners!.find((w) => w.id === p.id)?.amount ?? 0, net: p.stack - p.startStack
    })),
    log: g.log.map((x) => ({ street: x.street, board: !!x.board, name: x.board ? '' : nameOf(g)(x.id!), label: x.label })),
    vpip: false, pfr: false
  }
}

const forms = (c: Card) => [c, txt(c)]
// 每个座位的视图里不得出现其他座位的底牌（代码形式或显示形式）
function assertIsolated(g: Game) {
  g.players.forEach((_, seat) => {
    const json = JSON.stringify(buildSeatView(g, seat, nameOf(g), () => 'tag'))
    g.players.forEach((q, j) => {
      for (const c of q.hole) {
        if (j === seat || g.board.includes(c)) continue
        for (const f of forms(c)) expect(json.includes(f), `seat ${seat} sees seat ${j} card ${f}`).toBe(false)
      }
    })
    expect(buildSeatView(g, seat, nameOf(g), () => '').myCards).toEqual(g.players[seat].hole)
  })
}

// 按策略打完一手，每个行动前后都检查隔离
function play(g: Game, policy: (seat: number, g: Game) => Action) {
  let runout = false
  while (!g.done) {
    assertIsolated(g)
    if (g.runout) (runout = true), runoutStep(g)
    else apply(g, g.toAct, policy(g.toAct, g))
  }
  assertIsolated(g)
  return { g, runout }
}

const passive: Action = { type: 'call' }

describe('buildSeatView', () => {
  it('各阶段、弃牌、全下、摊牌下每个座位只看到自己的底牌', () => {
    let runouts = 0
    for (let seed = 1; seed <= 30; seed++) {
      // 玩家弃牌，其余跟到摊牌
      expect(play(game(seed), (s) => (s === 0 ? { type: 'fold' } : passive)).g.showdown).toBe(true)
      // 全员全下（筹码不等，有边池），runout 到摊牌
      const allin = play(game(seed, [10000, 3000, 10000, 5000]), () => ({ type: 'raise', to: 999999 }))
      expect(allin.g.showdown && allin.g.players.every((p) => p.allin)).toBe(true)
      runouts += Number(allin.runout)
      // 全员弃牌给大盲，不摊牌
      expect(play(game(seed), () => ({ type: 'fold' })).g.showdown).toBe(false)
    }
    expect(runouts).toBeGreaterThan(0)
  })

  it('字段：选项与加注范围、行动记录用名字', () => {
    const g = game(3)
    const seat = g.toAct
    const v = buildSeatView(g, seat, nameOf(g), (pid) => (pid ? 'AI' : '玩家'))
    expect(v.options).toEqual(['fold', 'call 100', `raise 200~${g.players[seat].stack + g.players[seat].bet}`])
    expect(v.actions).toEqual([`${g.players[g.sbI].name} 小盲 50`, `${g.players[g.bbI].name} 大盲 100`])
    expect(v.players.find((p) => p.isYou)?.seat).toBe(seat)
    expect(v.players[0].tag).toBe('玩家')
  })

  it('view_hero 工具只含座位 0 的底牌', async () => {
    const g = game(5)
    const table: TableQuery = { viewFor: (s) => buildSeatView(g, s, nameOf(g), () => ''), chat: () => [], equityFor: () => ({ eq: 0, need: 0, outs: null, handName: '' }) }
    const requestContext = new RequestContext()
    requestContext.set('table', table)
    requestContext.set('role', 'coach')
    requestContext.set('seat', 2) // 教练的 seat 被错误设置也不影响
    const v = (await coachTools.view_hero.execute!({}, { requestContext } as never)) as ReturnType<typeof buildSeatView>
    expect(v.myCards).toEqual(g.players[0].hole)
    const json = JSON.stringify(v)
    for (const q of g.players.slice(1)) for (const c of q.hole) expect(json).not.toContain(c)
  })
})

function heroCardsIn(text: string, rec: HandRecord) {
  return rec.hero.some((c) => forms(c).some((f) => text.includes(f)))
}

describe('publicHandResult', () => {
  it('玩家弃牌、其他人摊牌：只含亮出的牌，不含玩家底牌', () => {
    const g = game(11)
    play(g, (s) => (s === 0 ? { type: 'fold' } : passive))
    const rec = record(g)
    expect(rec.showdown).toBe(true)
    const t = publicHandResult(rec, 'li')
    expect(heroCardsIn(t, rec)).toBe(false)
    for (const p of rec.players.slice(1)) expect(t).toContain(`亮出 ${p.hole!.map(txt).join(' ')}`)
    expect(t).toMatch(/你本手 [+−]?[\d,]+$/)
  })

  it('玩家未亮牌（其余全弃）：不含任何底牌', () => {
    const g = game(12)
    play(g, (s) => (s === 0 ? { type: 'raise', to: 400 } : { type: 'fold' }))
    const rec = record(g)
    expect(rec.showdown).toBe(false)
    expect(rec.players[0].hole).not.toBeNull()
    const t = publicHandResult(rec, 'k')
    expect(heroCardsIn(t, rec)).toBe(false)
    expect(t).not.toContain('亮出')
    expect(t).toContain('玩家赢得')
  })

  it('全下后摊牌：弃牌者不亮牌，玩家摊牌则亮出', () => {
    const g = game(13, [2000, 10000, 10000, 10000])
    play(g, (s, gg) => (s === 0 ? { type: 'raise', to: 999999 } : s === 1 ? passive : gg.players[s].bet < gg.currentBet ? { type: 'fold' } : { type: 'check' }))
    const rec = record(g)
    expect(rec.showdown).toBe(true)
    expect(g.players.some((p) => p.folded)).toBe(true)
    const t = publicHandResult(rec, 'li')
    expect(t).toContain(`玩家亮出 ${rec.hero.map(txt).join(' ')}`)
    expect(t).toContain(`你亮出 ${rec.players[1].hole!.map(txt).join(' ')}`)
    for (const p of g.players.filter((p) => p.folded)) for (const c of p.hole) expect(t).not.toContain(txt(c))
  })
})

describe('heroHandSummary', () => {
  it('含玩家底牌，对手底牌只含摊牌亮出的', () => {
    const g = game(13, [2000, 10000, 10000, 10000])
    play(g, (s, gg) => (s === 0 ? { type: 'raise', to: 999999 } : s === 1 ? passive : gg.players[s].bet < gg.currentBet ? { type: 'fold' } : { type: 'check' }))
    const rec = record(g)
    const t = heroHandSummary(rec)
    expect(t).toContain(`玩家底牌：${rec.hero.map(txt).join(' ')}`)
    for (const p of g.players.filter((p) => p.folded)) for (const c of p.hole) expect(t).not.toContain(txt(c))
    expect(t).toContain('【翻牌')
  })
})
