import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../src/main/db'
import { commandHandlers } from '../src/main/ipc'
import type { CallResult } from '../src/main/agents/llm'
import type { TableStart, TableView } from '../src/shared/types'
import { delayed, drive, harness, okCall, seeded, setup, teardown, tick, type Harness } from './table-helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = CallResult<any>

afterEach(teardown)

const free6: TableStart = { size: 6, blinds: 1, picks: ['li', 'prof', 'bai', 'k', 'rock'], mode: 'free', guided: false }
const free3: TableStart = { size: 3, blinds: 1, picks: ['li', 'k'], mode: 'free', guided: false }
const coach3: TableStart = { ...free3, mode: 'coach' }
const heroFolds = (v: TableView) => (v.hero.toCall > 0 ? 'fold' : 'call')
const hands = (h: Harness) => h.of('hands:changed').length

// 每次推送视图时核对：进行中任何对手底牌都不得出现；自由局结束时只允许摊牌未弃牌者
function noHoleLeak(h: Harness) {
  const r = h.runner
  const t = r.table
  const v = r.view()
  if (!t || !v) return
  const holes = t.holeCards()
  const done = v.done
  const showdown = done && t.roundOfBetting() === 'showdown'
  v.seats.forEach((s, i) => {
    if (i === 0 || !holes[i]) return
    const allowed = done && (r.mode === 'coach' || (showdown && !t.seats()[i]!.folded))
    if (s.cards && !allowed) throw new Error(`leaked seat ${i}`)
  })
}

describe('自由局', () => {
  beforeEach(() => setup())

  it('6 人桌 20 手：筹码守恒、每手落库、进行中视图不含对手底牌', async () => {
    const rng = seeded(42)
    const leaks: string[] = []
    const h = await harness({
      rng,
      agents: {
        opponentAct: async () => {
          const r = rng()
          return okCall({ action: r < 0.15 ? 'raise' : r < 0.3 ? 'fold' : r < 0.35 ? 'allin' : 'call', to: 400 })
        }
      },
      onEmit: (hh, e) => {
        try {
          if (e === 'table:view') noHoleLeak(hh)
        } catch (err) {
          leaks.push(String(err))
        }
      }
    })
    await h.runner.start(free6)
    const buy = 10000
    await drive(h, () => hands(h) >= 20, () => 'call', 20000)
    const t = h.runner.table!
    const oppRebuys = h.chat.filter((m) => m.kind === 'sys' && /重新买入/.test(m.text!)).length
    const heroRebuys = (100000 - buy - h.runner.bankroll) / buy
    const chips = t.isHandInProgress() ? t.seats().reduce((a, x) => a + x!.startStack, 0) : t.seats().reduce((a, x) => a + x!.stack, 0)
    expect(leaks).toEqual([])
    expect(hands(h)).toBeGreaterThanOrEqual(20)
    expect(chips).toBe((6 + oppRebuys + heroRebuys) * buy)
  }, 60_000)

  it('对手一次调用完成下注与发言；发言进公屏与气泡，印象在一手结束时写入记忆', async () => {
    let calls = 0
    const h = await harness({
      agents: { opponentAct: async () => (calls++, okCall({ action: 'call', say: '陪你玩', note: '玩家爱跟注' })) }
    })
    await h.runner.start(free3)
    await drive(h, () => hands(h) >= 1, () => 'call')
    const msgs = h.chat.filter((m) => m.kind === 'msg')
    expect(msgs.length).toBe(calls)
    expect(msgs[0]).toMatchObject({ text: '陪你玩' })
    expect(msgs[0].act).toMatch(/跟注|过牌/)
    expect(h.views.some((v) => v.seats.some((s) => s.bubble === '陪你玩'))).toBe(true)
    await tick(10)
    expect(await db.memoryOf('li')).toEqual(['玩家爱跟注'])
  })

  it('规范化：bet/字符串金额、全下、未知动作、可过牌时弃牌', async () => {
    const script = [{ action: 'bet', to: '999999' }, { action: 'dance' }, { action: 'fold' }]
    const h = await harness({ agents: { opponentAct: async () => okCall(script.shift() ?? { action: 'call' }) } })
    await h.runner.start(free3)
    await drive(h, () => hands(h) >= 1, heroFolds)
    const acts = h.chat.filter((m) => m.from && m.from !== 'hero').map((m) => m.act)
    expect(acts[0]).toMatch(/^全下/)
    expect(acts[1]).toMatch(/^(跟注|过牌|全下)/)
  })

  it('入座前置：没有对手模型不能开桌；教练局还需要教练模型', async () => {
    const h = await harness({ agents: { modelReady: (role) => role === 'opponent' } })
    await expect(h.runner.start(coach3)).rejects.toThrow(/教练模型/)
    const h2 = await harness({ agents: { modelReady: () => false } })
    await expect(h2.runner.start(free3)).rejects.toThrow(/对手模型/)
  })
})

describe('失败即停下', () => {
  beforeEach(() => setup())

  it('调用失败：停下并标记需要去设置；重试后继续', async () => {
    let fail = true
    const h = await harness({
      agents: { opponentAct: async () => (fail ? { ok: false, aborted: false, text: '', error: '401 Unauthorized' } : okCall({ action: 'call' })) }
    })
    await h.runner.start(free3)
    await drive(h, () => !!h.runner.view()?.stalled, () => 'call')
    const v = h.runner.view()!
    expect(v.stalled).toMatchObject({ error: '401 Unauthorized', settings: true })
    expect(v.hero.isTurn).toBe(false)
    const before = h.runner.table!.handLog().length
    await tick(5000)
    expect(h.runner.table!.handLog().length).toBe(before)
    fail = false
    h.runner.retry()
    await drive(h, () => hands(h) >= 1, () => 'call')
    expect(h.runner.view()!.stalled).toBeNull()
  })

  it('模型没调用 act：停下，不需要去设置', async () => {
    const h = await harness({ agents: { opponentAct: async () => ({ ok: true, aborted: false, text: '我跟' }) } })
    await h.runner.start(free3)
    await drive(h, () => !!h.runner.view()?.stalled, () => 'call')
    expect(h.runner.view()!.stalled).toMatchObject({ error: '模型没有调用 act', settings: false })
  })

  it('停下时离桌：本手作废，筹码回到本手开始时，不落库', async () => {
    let n = 0
    const h = await harness({
      agents: { opponentAct: async () => (++n > 2 ? { ok: false, aborted: false, text: '', error: 'boom' } : okCall({ action: 'raise', to: 500 })) }
    })
    const start = h.runner.bankroll
    await h.runner.start(free3)
    await drive(h, () => !!h.runner.view()?.stalled, () => 'call')
    expect(h.runner.table!.seats()[0]!.stack).toBeLessThan(10000)
    await h.runner.leave()
    expect(h.runner.bankroll).toBe(start)
    expect(hands(h)).toBe(0)
  })
})

describe('教练局', () => {
  beforeEach(() => setup())

  it('轮到玩家时锁定到教练说完；说完解锁', async () => {
    const h = await harness({ agents: { coachSpeak: (_o, onDelta, signal) => delayed<Res>(3000, signal, () => (onDelta('先看赔率'), { ok: true, aborted: false, text: '先看赔率' }), () => ({ ok: false, aborted: true, text: '' })) } })
    await h.runner.start(coach3)
    await drive(h, () => !!h.runner.view()?.hero.isTurn, () => null)
    expect(h.runner.view()!.coach).toMatchObject({ busy: 'speak', locked: true })
    const before = h.runner.table!.handLog().length
    h.runner.heroAct({ type: 'call' })
    expect(h.runner.table!.handLog().length).toBe(before)
    await tick(3100)
    expect(h.runner.view()!.coach).toMatchObject({ busy: null, locked: false })
    expect([...h.coach.values()].find((c) => c.kind === 'speak')).toMatchObject({ text: '先看赔率', status: 'done' })
    h.runner.heroAct({ type: 'call' })
    expect(h.runner.table!.handLog().length).toBe(before + 1)
  })

  it('「不等了」中止讲解并解锁', async () => {
    const h = await harness({ agents: { coachSpeak: (_o, _d, signal) => delayed<Res>(60_000, signal, () => ({ ok: true, aborted: false, text: 'x' }), () => ({ ok: false, aborted: true, text: '' })) } })
    await h.runner.start(coach3)
    await drive(h, () => !!h.runner.view()?.coach?.locked, () => null)
    h.runner.skip()
    await tick(10)
    expect(h.runner.view()!.coach).toMatchObject({ busy: null, locked: false })
    expect([...h.coach.values()].find((c) => c.kind === 'speak')!.status).toBe('skipped')
  })

  it('提问期间牌局暂停：在途对手落子后不再推进，回答结束后继续', async () => {
    let asked = false
    const h = await harness({
      agents: {
        opponentAct: (_i, signal) => delayed<Res>(500, signal, () => okCall({ action: 'call' }), () => ({ ok: false, aborted: true, text: '' })),
        coachAsk: (_o, onDelta, signal) => delayed<Res>(4000, signal, () => (onDelta('答'), { ok: true, aborted: false, text: '答' }), () => ({ ok: false, aborted: true, text: '' }))
      }
    })
    await h.runner.start(coach3)
    // 等到某个对手正在思考时提问
    await drive(h, () => h.runner.view()!.seats.some((s) => s.thinking), () => 'call')
    h.runner.ask('现在该怎么打？')
    asked = true
    await tick(600)
    const len = h.runner.table!.handLog().length
    await tick(2000)
    expect(h.runner.table!.handLog().length).toBe(len)
    expect(h.runner.view()!.coach!.busy).toBe('ask')
    await tick(2000)
    expect(h.runner.view()!.coach!.busy).not.toBe('ask')
    expect(asked).toBe(true)
    await drive(h, () => h.runner.table!.handLog().length > len, () => 'call')
  })

  it('一手结束：亮出所有底牌（弃牌者标 mucked），复盘结束后才可下一手', async () => {
    const h = await harness({
      agents: {
        opponentAct: async () => okCall({ action: 'fold' }),
        coachRecap: (_o, signal) => delayed<Res>(2000, signal, () => okCall({ headline: '稳', good: 'g', improve: 'i', tip: 't' }), () => ({ ok: false, aborted: true, text: '' }))
      }
    })
    await h.runner.start(coach3)
    // 玩家加注、对手都弃牌：没有摊牌
    await drive(h, () => !!h.runner.view()?.done, () => 'raise')
    await tick(10)
    const v = h.runner.view()!
    expect(v.seats.every((s) => s.cards?.length === 2)).toBe(true)
    expect(v.seats.filter((s) => s.mucked).length).toBeGreaterThan(0)
    expect(v.coach!.canNext).toBe(false)
    h.runner.nextHand()
    expect(h.runner.table!.handNumber()).toBe(1)
    await tick(2100)
    expect(h.runner.view()!.coach!.canNext).toBe(true)
    const recap = [...h.coach.values()].find((c) => c.kind === 'recap')!
    expect(recap).toMatchObject({ status: 'done', recap: { headline: '稳' } })
    const [row] = await db.listHands()
    expect(await db.getReview(row.id)).toBe(JSON.stringify({ headline: '稳', good: 'g', improve: 'i', tip: 't' }))
    const rec = (await db.getHand(row.id))!
    expect(rec.mode).toBe('coach')
    expect(rec.players.every((p) => p.holeAfter?.length === 2)).toBe(true)
    expect(rec.players.filter((p) => p.id !== 'hero').every((p) => p.hole === null)).toBe(true)
  })

  it('复盘失败可直接下一手；重试期间下一手再次置灰', async () => {
    let fail = true
    const h = await harness({
      agents: {
        opponentAct: async () => okCall({ action: 'fold' }),
        coachRecap: (_o, signal) =>
          delayed<Res>(1000, signal, () => (fail ? { ok: false, aborted: false, text: '', error: 'boom' } : okCall({ headline: 'h', good: 'g', improve: 'i', tip: 't' })), () => ({ ok: false, aborted: true, text: '' }))
      }
    })
    await h.runner.start(coach3)
    await drive(h, () => !!h.runner.view()?.done, () => 'call')
    await tick(1100)
    expect(h.runner.view()!.coach!.canNext).toBe(true)
    fail = false
    h.runner.retryRecap()
    expect(h.runner.view()!.coach!.canNext).toBe(false)
    await tick(1100)
    expect(h.runner.view()!.coach!.canNext).toBe(true)
  })

  it('自由局一手结束只亮摊牌的牌', async () => {
    const h = await harness({ agents: { opponentAct: async () => okCall({ action: 'fold' }) } })
    await h.runner.start(free3)
    await drive(h, () => !!h.runner.view()?.done, () => 'raise')
    expect(h.runner.view()!.seats.filter((s, i) => i > 0 && s.cards).length).toBe(0)
    expect(h.runner.view()!.coach).toBeNull()
  })
})

describe('角色', () => {
  beforeEach(() => setup())

  it('入座后删除对手：本桌照常用快照打完', async () => {
    const names: string[] = []
    const h = await harness({ agents: { opponentAct: async (i) => (names.push(i.name), okCall({ action: 'call' })) } })
    await h.runner.start(free3)
    await db.deletePersona('li')
    await drive(h, () => hands(h) >= 1, () => 'call')
    expect(names).toContain('阿狸')
  })

  it('删除到只剩一位时拒绝', async () => {
    const h = await harness()
    const cmd = commandHandlers(h.runner)
    for (const p of db.personasCache.filter((x) => x.id !== 'li')) await cmd['persona.delete'](p.id)
    await expect(cmd['persona.delete']('li')).rejects.toThrow(/至少保留/)
  })
})
