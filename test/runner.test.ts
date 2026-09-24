import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../src/main/db'
import { commandHandlers } from '../src/main/ipc'
import { reportUsage, type CallResult, type UsageTag } from '../src/main/agents/llm'
import { Table } from '../src/main/engine/table'
import { normalize } from '../src/main/table/runner'
import { cardsText } from '../src/shared/format'
import type { Purpose, TableStart, TableView } from '../src/shared/types'
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

// ---- 审阅 T2-T5-1 F1：信息隔离 ----

type Situation = { seat: number; text: string; others: string[] }

// 记录每次对手决策的输入，以及此刻其他座位的底牌文字
function spyOpponent(h: () => Harness, act: () => Res = () => okCall({ action: 'call' })) {
  const seen: Situation[] = []
  const opponentAct = async (i: { situation: string }): Promise<Res> => {
    const t = h().runner.table!
    const seat = t.playerToAct()
    const others = t.holeCards().flatMap((c, j) => (j !== seat && c ? [cardsText(c)] : []))
    seen.push({ seat, text: i.situation, others })
    return act()
  }
  return { seen, opponentAct }
}

describe('信息隔离', () => {
  beforeEach(() => setup())

  it('对手的输入不含其他座位的底牌', async () => {
    let hh: Harness
    const spy = spyOpponent(() => hh)
    hh = await harness({ agents: { opponentAct: spy.opponentAct } })
    await hh.runner.start(free6)
    await drive(hh, () => hands(hh) >= 5, () => 'call')
    expect(spy.seen.length).toBeGreaterThan(10)
    for (const s of spy.seen) {
      const own = s.text.split('本桌最近几手')[0]
      for (const c of s.others) expect(own).not.toContain(c)
    }
  })

  it('教练局：进行中不亮对手底牌；一手结束亮出的弃牌不进入对手读到的上一手结果', async () => {
    const leaks: string[] = []
    let hh: Harness
    let folded: string[] = []
    const spy = spyOpponent(() => hh, () => okCall({ action: 'fold' }))
    hh = await harness({
      agents: { opponentAct: spy.opponentAct },
      onEmit: (x, e) => {
        try {
          if (e === 'table:view') noHoleLeak(x)
        } catch (err) {
          leaks.push(String(err))
        }
        const t = x.runner.table
        if (e === 'hands:changed' && t) folded = t.holeCards().flatMap((c, j) => (j > 0 && c && t.seats()[j]!.folded ? [cardsText(c)] : []))
      }
    })
    await hh.runner.start(coach3)
    // 第 1 手玩家加注、对手都弃牌：教练局亮出弃牌
    await drive(hh, () => hands(hh) >= 1, () => 'raise')
    const shown = folded
    expect(shown.length).toBeGreaterThan(0)
    const from = spy.seen.length
    await drive(hh, () => hands(hh) >= 3, () => 'call')
    const later = spy.seen.slice(from)
    expect(later.some((s) => s.text.includes('本桌最近几手'))).toBe(true)
    for (const s of later) for (const c of shown) expect(s.text).not.toContain(c)
    expect(leaks).toEqual([])
  })
})

// ---- 审阅 T2-T5-1 F2：状态机 ----

describe('状态机', () => {
  beforeEach(() => setup())

  // 记下每次发起决策时的手号与行动数，用来判断“正有一个对手在途”
  const slowOpp = (calls: { n: number; at: string }, h: () => Harness) => (_i: unknown, signal: AbortSignal) => {
    const t = h().runner.table!
    calls.n++
    calls.at = `${t.handNumber()}-${t.handLog().length}`
    return delayed<Res>(500, signal, () => okCall({ action: 'call' }), () => ({ ok: false, aborted: true, text: '' }))
  }

  it('6 人桌提问期间只落在途的那一个对手，不再发起新的决策', async () => {
    const calls = { n: 0, at: '' }
    let hh: Harness
    const h = (hh = await harness({
      agents: {
        opponentAct: slowOpp(calls, () => hh),
        coachAsk: (_o, onDelta, signal) => delayed<Res>(5000, signal, () => (onDelta('答'), { ok: true, aborted: false, text: '答' }), () => ({ ok: false, aborted: true, text: '' }))
      }
    }))
    await h.runner.start({ ...free6, mode: 'coach' })
    // 等到玩家之后至少还有两位对手要行动的时刻
    await drive(h, () => {
      const t = h.runner.table
      return !!t && t.roundOfBetting() === 'preflop' && calls.at === `${t.handNumber()}-${t.handLog().length}` && t.playerToAct() >= 1 && t.playerToAct() <= 3
    }, () => 'call')
    const before = calls.n
    const len = h.runner.table!.handLog().length
    h.runner.ask('怎么打？')
    await tick(4500)
    expect(calls.n).toBe(before)
    expect(h.runner.table!.handLog().length).toBe(len + 1)
    await tick(1000)
    expect(h.runner.view()!.coach!.busy).not.toBe('ask')
    expect(calls.n).toBeGreaterThan(before)
  })

  it('提问期间一手结束：回答结束后才复盘；「跳过」不会中止提问', async () => {
    const order: string[] = []
    const h = await harness({
      agents: {
        opponentAct: (_i, signal) => delayed<Res>(300, signal, () => okCall({ action: 'fold' }), () => ({ ok: false, aborted: true, text: '' })),
        coachAsk: (_o, onDelta, signal) => (order.push('ask'), delayed<Res>(3000, signal, () => (order.push('ask-end'), onDelta('答'), { ok: true, aborted: false, text: '答' }), () => (order.push('ask-aborted'), { ok: false, aborted: true, text: '' }))),
        coachRecap: async () => (order.push('recap'), okCall({ headline: 'h', good: 'g', improve: 'i', tip: 't' }))
      }
    })
    await h.runner.start(coach3)
    // 玩家加注、一位对手已弃牌、最后一位正在思考：它落子后这一手就结束
    await drive(h, () => {
      const log = h.runner.table!.handLog()
      return !!h.runner.view()?.seats.some((s) => s.thinking) && log.some((e) => 'seat' in e && e.seat === 0 && e.type === 'raise') && log.filter((e) => 'seat' in e && e.type === 'fold').length === 1
    }, () => 'raise')
    h.runner.ask('为什么？')
    h.runner.skip()
    await tick(1000)
    // 最后一位对手已弃牌，但结算与复盘都等回答结束
    expect(h.runner.table!.handLog().filter((e) => 'seat' in e && e.type === 'fold').length).toBe(2)
    expect(order).toEqual(['ask'])
    await drive(h, () => order.includes('recap'), () => null)
    expect(order).toEqual(['ask', 'ask-end', 'recap'])
  })

  it('离桌后马上入座新桌：旧桌迟到的对手结果与讲解被丢弃', async () => {
    // 模拟不理会中止信号、迟到返回的提供方。phase 1：对手迟到但成功，等到讲解在途；phase 2：对手迟到且失败
    let phase = 1
    const late = <T,>(v: () => T) => delayed<T>(2000, new AbortController().signal, v, v)
    const fail: Res = { ok: false, aborted: false, text: '', error: 'boom' }
    const h = await harness({
      agents: {
        opponentAct: async () => (phase === 1 ? late<Res>(() => okCall({ action: 'call' })) : phase === 2 ? late<Res>(() => fail) : okCall({ action: 'call' })),
        coachSpeak: async (_o, onDelta) => (phase < 3 ? late<Res>(() => (onDelta('旧讲解'), { ok: true, aborted: false, text: '旧讲解' })) : { ok: true, aborted: false, text: '' })
      }
    })
    await h.runner.start(coach3)
    await drive(h, () => h.runner.view()!.coach?.busy === 'speak', () => null)
    await h.runner.leave()
    phase = 2
    await h.runner.start(free3)
    await drive(h, () => h.runner.view()!.seats.some((s) => s.thinking), () => 'call')
    await h.runner.leave()
    phase = 3
    const from = h.events.length
    await h.runner.start(coach3)
    await tick(2500)
    const ids = (xs: typeof h.events) => xs.filter((e) => e.event === 'coach:upsert').map((e) => (e.payload as { id: string }).id)
    const old = new Set(ids(h.events.slice(0, from)))
    expect(old.size).toBeGreaterThan(0)
    expect(ids(h.events.slice(from)).filter((id) => old.has(id))).toEqual([])
    expect(h.runner.view()!.stalled).toBeNull()
  })

  it('入座后删除自建对手：决策仍用入座时的名字和提示词', async () => {
    const seen: { name: string; prompt: string }[] = []
    const p = await db.savePersona({ name: '小新', tag: '自定义', ini: '新', hue: 60, desc: '', prompt: '你是小新' })
    const h = await harness({ agents: { opponentAct: async (i) => (seen.push({ name: i.name, prompt: i.prompt }), okCall({ action: 'call' })) } })
    await h.runner.start({ ...free3, picks: [p.id, 'k'] })
    await db.deletePersona(p.id)
    expect(db.personaOf(p.id)).toBeUndefined()
    await drive(h, () => hands(h) >= 1, () => 'call')
    expect(seen).toContainEqual({ name: '小新', prompt: '你是小新' })
  })

  it('用量归属：调用时带上牌桌与手号；回放复盘记到被复盘那一手，不计入当前牌桌', async () => {
    const tags: unknown[] = []
    let report = true
    const use = (tag: UsageTag, purpose: Purpose) => reportUsage({ purpose, providerKind: 'x', modelId: 'm', input: 1000, output: 1000, cached: null, tableId: tag?.tableId ?? null, handNo: tag?.handNo ?? null })
    const h = await harness({
      agents: {
        opponentAct: async (i) => (report && (tags.push(i.tag), use(i.tag, 'decide')), okCall({ action: 'fold' })),
        coachRecap: async (o) => (use(o.tag, 'recap'), okCall({ headline: 'h', good: 'g', improve: 'i', tip: 't' }))
      }
    })
    await h.runner.start(free3)
    const first = h.runner.tableId
    await drive(h, () => hands(h) >= 1, () => 'raise')
    await tick(10)
    expect(tags.every((x) => (x as { tableId: string }).tableId === first)).toBe(true)
    expect(tags[0]).toMatchObject({ handNo: 1 })
    const [row] = await db.listHands()
    report = false
    await h.runner.start(free3)
    const cost = h.runner.view()!.cost
    await h.runner.review(row.id)
    await tick(10)
    expect(h.runner.view()!.cost).toEqual(cost)
    const rows = await db.listUsage()
    expect(rows.find((u) => u.purpose === 'recap')).toMatchObject({ tableId: first, handNo: 1 })
  })

  it('规范化压测：任意模型输出经 normalize 后引擎都接受', () => {
    const rng = seeded(7)
    const acts = ['fold', 'check', 'call', 'raise', 'bet', 'allin', 'all-in', 'ALL_IN', ' Raise ', 'dance', '', undefined, 'shove', 'all in']
    const tos = [undefined, 0, -5, 1e12, 3.7, '250', 'abc', '', NaN, Infinity, '1e3']
    const pick = <T,>(xs: T[]) => xs[(rng() * xs.length) | 0]
    for (let hand = 0; hand < 1000; hand++) {
      const n = 2 + ((rng() * 5) | 0)
      const t = new Table({ smallBlind: 50, bigBlind: 100 }, n, rng)
      for (let i = 0; i < n; i++) t.sitDown(i, 1000 + ((rng() * 20000) | 0))
      t.startHand()
      for (let step = 0; t.isHandInProgress() && step < 500; step++) {
        if (t.isBettingRoundInProgress()) {
          const [type, to] = normalize(t, { action: pick(acts), to: pick(tos) as number | string | undefined })
          t.actionTaken(type, to)
        } else if (!t.areBettingRoundsCompleted()) t.endBettingRound()
        else t.showdown()
      }
      expect(t.isHandInProgress()).toBe(false)
    }
  })
})
