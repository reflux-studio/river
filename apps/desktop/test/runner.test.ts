import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../src/main/db'
import { commandHandlers } from '../src/main/ipc'
import { reportUsage, type CallResult, type Msg, type UsageTag } from '../src/main/agents/llm'
import { Table } from '../src/main/engine/table'
import { enteredPot, normalize } from '../src/main/table/runner'
import { usageSummary } from '../src/main/models/prices'
import { cardsText } from '../src/shared/format'
import type { HandRecord, Purpose, TableStart, TableView } from '../src/shared/types'
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
    h.runner.retryCoach()
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
  const opponentAct = async (i: { messages: Msg[] }): Promise<Res> => {
    const t = h().runner.table!
    const seat = t.playerToAct()
    const others = t.holeCards().flatMap((c, j) => (j !== seat && c ? [cardsText(c)] : []))
    seen.push({ seat, text: i.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'), others })
    return act()
  }
  return { seen, opponentAct }
}

// 去掉往手回顾：往手摊牌亮出的牌是公开信息，且可能与本手的底牌碰巧相同
const currentHand = (text: string) => text.replace(/【往手回顾】[\s\S]*?\n\n/, '')
// 往手回顾里第 n 手那一段
const pastHand = (text: string, n: number) => text.match(new RegExp(`\\[第 ${n} 手\\][\\s\\S]*?(?=\\n\\[第 |\\n\\n|$)`))?.[0] ?? ''

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
      const own = currentHand(s.text)
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
    const recaps = later.map((s) => pastHand(s.text, 1)).filter(Boolean)
    expect(recaps.length).toBeGreaterThan(0)
    for (const r of recaps) for (const c of shown) expect(r).not.toContain(c)
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

// ---- unified-agent T3：对手 thread 与赛后发言 ----

describe('对手 thread', () => {
  beforeEach(() => setup())

  type Call = { name: string; hand: number; messages: Msg[] }
  const spyAct = (calls: Call[], h: () => Harness) => async (i: { name: string; messages: Msg[] }): Promise<Res> => {
    calls.push({ name: i.name, hand: h().runner.table!.handNumber(), messages: i.messages })
    return okCall({ action: 'call', think: `${i.name}的盘算` })
  }
  const toolCalls = (m: Msg[], tool: string) =>
    m.flatMap((x) => (x.role === 'assistant' && typeof x.content !== 'string' ? x.content.filter((c) => c.toolName === tool) : []))

  it('同一手内后续决策带着自己之前的 act（含 think），不含别人的', async () => {
    const calls: Call[] = []
    let hh: Harness
    hh = await harness({ agents: { opponentAct: spyAct(calls, () => hh) } })
    await hh.runner.start(free3)
    await drive(hh, () => hands(hh) >= 3, () => 'call')
    // 接线：对手收到的局面带位置、牌型，称玩家为「玩家」，不再有随机牌胜率
    const obs = calls[0].messages.at(-1)!.content as string
    expect(obs).toContain('你的位置：')
    expect(obs).toContain('当前牌型：')
    expect(obs).toMatch(/- 玩家（(按钮|小盲|大盲|枪口|中位|关煞)/)
    expect(obs).not.toContain('胜率约')
    const withHistory = calls.filter((c) => toolCalls(c.messages, 'act').length > 0)
    expect(withHistory.length).toBeGreaterThan(0)
    for (const c of withHistory) for (const x of toolCalls(c.messages, 'act')) expect((x.input as { think: string }).think).toBe(`${c.name}的盘算`)
  })

  it('一手结束后入过池的对手赛后发言：公屏带手号前缀，别的对手下次观察能读到，且写进自己的 thread', async () => {
    const calls: Call[] = []
    const talks: { name: string; hand: number }[] = []
    let hh: Harness
    hh = await harness({
      agents: {
        opponentAct: spyAct(calls, () => hh),
        opponentTalk: async (i) => (talks.push({ name: i.name, hand: hh.runner.table!.handNumber() }), okCall({ say: `${i.name}：好牌` }))
      }
    })
    await hh.runner.start(free3)
    await drive(hh, () => hands(hh) >= 3, () => 'call')
    expect(talks.length).toBeGreaterThan(0)
    expect(hh.chat.some((m) => m.text?.startsWith('[第 1 手赛后] '))).toBe(true)
    const later = calls.filter((c) => c.hand >= 2)
    expect(later.some((c) => JSON.stringify(c.messages).includes('新发言') && JSON.stringify(c.messages).includes('[第 1 手赛后]'))).toBe(true)
    expect(later.some((c) => JSON.stringify(c.messages).includes('赛后说：'))).toBe(true)
    // 跨手的新发言带公屏上的「第 N 手」分隔，模型分得清哪句是哪一手说的
    expect(later.some((c) => (c.messages.at(-1)!.content as string).includes('系统：第 2 手 · 翻牌前'))).toBe(true)
  })

  it('赛后发言失败：牌局照常，不停下、不写公屏', async () => {
    let hh: Harness
    hh = await harness({ agents: { opponentTalk: async () => ({ ok: false, aborted: false, text: '', error: 'boom' }) } })
    await hh.runner.start(free3)
    await drive(hh, () => hands(hh) >= 3, () => 'call')
    expect(hh.view().stalled).toBeNull()
    expect(hh.chat.some((m) => m.text?.includes('赛后'))).toBe(false)
  })

  it('赛后发言在玩家点下一手后才返回：没被中止的照常写入公屏和自己的 thread', async () => {
    const pending: { name: string; signal: AbortSignal; resolve: () => void }[] = []
    const calls: Call[] = []
    let hh: Harness
    hh = await harness({
      agents: {
        opponentAct: spyAct(calls, () => hh),
        // 忽略中止信号、由测试决定何时返回成功：写入只看 thread 手号与 ctrl，不看牌桌当前手号
        opponentTalk: (i, signal) => new Promise<Res>((resolve) => pending.push({ name: i.name, signal, resolve: () => resolve(okCall({ say: `${i.name}晚到` })) }))
      }
    })
    await hh.runner.start(free3)
    await drive(hh, () => hands(hh) >= 1 && hh.runner.canNext(), () => 'call')
    expect(pending.length).toBeGreaterThan(0)
    hh.runner.nextHand()
    for (const p of pending) p.resolve()
    await tick(10)
    const said = (name: string) => hh.chat.some((m) => m.text === `[第 1 手赛后] ${name}晚到`)
    for (const p of pending) expect(said(p.name)).toBe(!p.signal.aborted)
    const written = pending.filter((p) => !p.signal.aborted)
    expect(written.length).toBeGreaterThan(0)
    await drive(hh, () => calls.some((c) => c.name === written[0].name && c.hand === 2), () => 'call')
    expect(JSON.stringify(calls.find((c) => c.name === written[0].name && c.hand === 2)!.messages)).toContain(`赛后说：${written[0].name}晚到`)
  })

  it('赛后发言在该对手下一手被调用后才返回：已被中止，不写公屏', async () => {
    const pending: { name: string; signal: AbortSignal; resolve: () => void }[] = []
    const calls: Call[] = []
    let hh: Harness
    hh = await harness({
      agents: {
        opponentAct: spyAct(calls, () => hh),
        opponentTalk: (i, signal) => new Promise<Res>((resolve) => pending.push({ name: i.name, signal, resolve: () => resolve(okCall({ say: `${i.name}太晚` })) }))
      }
    })
    await hh.runner.start(free3)
    await drive(hh, () => hands(hh) >= 1 && hh.runner.canNext(), () => 'call')
    const names = pending.map((p) => p.name)
    expect(names.length).toBeGreaterThan(0)
    await drive(hh, () => names.every((n) => calls.some((c) => c.name === n && c.hand === 2)), () => 'call')
    for (const p of pending) expect(p.signal.aborted).toBe(true)
    for (const p of pending) p.resolve()
    await tick(10)
    expect(hh.chat.some((m) => m.text?.includes('太晚'))).toBe(false)
  })

  it('入过池的对手才发言；赛后 note 立即落库；对手读到的新发言不含自己的', async () => {
    const calls: Call[] = []
    const talks: { name: string; hand: number }[] = []
    let hh: Harness
    hh = await harness({
      agents: {
        opponentAct: async (i) => (calls.push({ name: i.name, hand: hh.runner.table!.handNumber(), messages: i.messages }), okCall({ action: i.name === '老K' ? 'fold' : 'call', say: `${i.name}说话` })),
        opponentTalk: async (i) => (talks.push({ name: i.name, hand: hh.runner.table!.handNumber() }), okCall({ note: `${i.name}的赛后印象` }))
      }
    })
    await hh.runner.start(free3)
    await drive(hh, () => hands(hh) >= 4, () => 'call')
    const recs = await Promise.all((await db.listHands()).map((x) => db.getHand(x.id)))
    for (const rec of recs) {
      for (const name of ['阿狸', '老K']) {
        const seat = hh.runner.seats.findIndex((x) => x.name === name)
        expect(talks.some((t) => t.name === name && t.hand === rec!.hand)).toBe(enteredPot(rec!, seat))
      }
    }
    expect(await db.memoryOf('li')).toContain('阿狸的赛后印象')
    for (const c of calls) expect((c.messages.at(-1)!.content as string).split('新发言')[1] ?? '').not.toContain(`${c.name}：`)
  })

  it('还在进行的赛后发言：该对手下一手首次被调用时中止，返回结果不写入', async () => {
    let aborted = 0
    let hh: Harness
    hh = await harness({
      agents: {
        opponentTalk: (_i, signal) =>
          delayed<Res>(60_000, signal, () => okCall({ say: '迟到' }), () => (aborted++, { ok: false, aborted: true, text: '' }))
      }
    })
    await hh.runner.start(free3)
    await drive(hh, () => hands(hh) >= 3, () => 'call')
    expect(aborted).toBeGreaterThan(0)
    expect(hh.chat.some((m) => m.text?.includes('迟到'))).toBe(false)
  })

  it('入池判定：主动投入或看到翻牌；翻牌前弃牌、只下盲注的不算', () => {
    const rec = (log: HandRecord['log'], board: string[] = []) => ({ log, board }) as HandRecord
    const e = (seat: number, type: HandRecord['log'][number]['type'], street: 'preflop' | 'flop' = 'preflop') => ({ street, board: false, name: '', label: '', seat, type })
    expect(enteredPot(rec([e(1, 'call')]), 1)).toBe(true)
    expect(enteredPot(rec([e(1, 'blind'), e(1, 'fold')]), 1)).toBe(false)
    expect(enteredPot(rec([e(1, 'blind'), e(1, 'check', 'flop')], ['As', 'Kd', '2c']), 1)).toBe(true)
    expect(enteredPot(rec([e(1, 'fold')], ['As', 'Kd', '2c']), 1)).toBe(false)
  })

  it('用量统计单列 talk', async () => {
    expect((await usageSummary()).purposes.map((p) => p.purpose)).toContain('talk')
  })
})

// ---- unified-agent T4：教练 thread ----

describe('教练 thread', () => {
  beforeEach(() => setup())

  const text = (m: Msg[]) => m.map((x) => (typeof x.content === 'string' ? x.content : JSON.stringify(x.content))).join('\n')
  const unlockedTurn = (h: Harness) => () => !!h.runner.view()?.hero.isTurn && !h.runner.view()!.coach!.locked && h.runner.view()!.coach!.busy === null

  it('讲解之后提问：提问带着讲解；局面没变不重复附上', async () => {
    const asks: Msg[][] = []
    const h = await harness({
      agents: {
        coachSpeak: async (_o, onDelta) => (onDelta('先看赔率'), { ok: true, aborted: false, text: '先看赔率' }),
        coachAsk: async (o, onDelta) => (asks.push(o.messages), onDelta('答'), { ok: true, aborted: false, text: '答' })
      }
    })
    await h.runner.start(coach3)
    await drive(h, unlockedTurn(h), () => null)
    h.runner.ask('为什么')
    await tick(10)
    const m = asks[0]
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user'])
    expect(m[1].content).toBe('先看赔率')
    expect(m[2].content).not.toContain('当前局面（玩家视角）')
    expect(m[2].content).toContain('为什么')
  })

  it('讲解被「不等了」打断但已有文字：追问时带着「（被打断）」的半句', async () => {
    const asks: Msg[][] = []
    const h = await harness({
      agents: {
        coachSpeak: (_o, onDelta, signal) => (onDelta('先看'), delayed<Res>(60_000, signal, () => ({ ok: true, aborted: false, text: 'x' }), () => ({ ok: false, aborted: true, text: '' }))),
        coachAsk: async (o, onDelta) => (asks.push(o.messages), onDelta('答'), { ok: true, aborted: false, text: '答' })
      }
    })
    await h.runner.start(coach3)
    await drive(h, () => !!h.runner.view()?.coach?.locked, () => null)
    h.runner.skip()
    await tick(10)
    h.runner.ask('你说的是什么')
    await tick(10)
    expect(asks[0][1].content).toBe('先看（被打断）')
  })

  it('讲解失败且没有文字：不写入；重试成功后只有一组', async () => {
    let n = 0
    const asks: Msg[][] = []
    const h = await harness({
      agents: {
        coachSpeak: async (_o, onDelta) => (n++ === 0 ? { ok: false, aborted: false, text: '', error: 'boom' } : (onDelta('好'), { ok: true, aborted: false, text: '好' })),
        coachAsk: async (o, onDelta) => (asks.push(o.messages), onDelta('答'), { ok: true, aborted: false, text: '答' })
      }
    })
    await h.runner.start(coach3)
    await drive(h, () => !!h.runner.view()?.coach?.retry, () => null)
    h.runner.retryCoach()
    await tick(10)
    h.runner.ask('然后呢')
    await tick(10)
    expect(asks[0].filter((x) => x.role === 'assistant')).toHaveLength(1)
  })

  it('复盘后同一手提问：历史里有 recap 的 tool-call；下一手第一次讲解只有一条带往手回顾的 user', async () => {
    const speaks: Msg[][] = []
    const asks: Msg[][] = []
    let asked = false
    const h = await harness({
      agents: {
        coachSpeak: async (o, onDelta) => (speaks.push(o.messages), onDelta('讲'), { ok: true, aborted: false, text: '讲' }),
        coachAsk: async (o, onDelta) => (asks.push(o.messages), onDelta('答'), { ok: true, aborted: false, text: '答' })
      }
    })
    await h.runner.start(coach3)
    await drive(h, () => h.runner.view()!.done && h.runner.canNext(), () => 'call')
    h.runner.ask('这手怎么样')
    asked = true
    await tick(10)
    expect(asked).toBe(true)
    const recapCall = asks[0].find((x) => x.role === 'assistant' && typeof x.content !== 'string')
    expect(JSON.stringify(recapCall)).toContain('"toolName":"recap"')
    const before = speaks.length
    await drive(h, () => speaks.length > before, () => 'call')
    const first = speaks[before]
    expect(first).toHaveLength(1)
    expect(first[0].content as string).toMatch(/^【往手回顾】\n\[第 1 手\] 第 1 手，盲注/)
    expect(first[0].content as string).toContain('你本手：')
    expect(first[0].content as string).toContain('复盘：h；下次记住：t')
  })

  it('对手的发言出现在教练下一次讲解的新发言里', async () => {
    const speaks: Msg[][] = []
    const h = await harness({
      agents: {
        opponentAct: async () => okCall({ action: 'call', say: '跟了跟了' }),
        coachSpeak: async (o, onDelta) => (speaks.push(o.messages), onDelta('讲'), { ok: true, aborted: false, text: '讲' })
      }
    })
    await h.runner.start(coach3)
    await drive(h, () => speaks.some((m) => text(m).includes('新发言') && text(m).includes('跟了跟了')), () => 'call')
  })

  it('玩家本手没有决策点（大盲、对手全弃）：复盘是本手第一组，带往手回顾', async () => {
    const recaps: Msg[][] = []
    const asks: Msg[][] = []
    const h = await harness({
      agents: {
        opponentAct: async () => okCall({ action: 'fold' }),
        coachAsk: async (o, onDelta) => (asks.push(o.messages), onDelta('答'), { ok: true, aborted: false, text: '答' }),
        coachRecap: async (o) => (recaps.push(o.messages), okCall({ headline: 'h', good: 'g', improve: 'i', tip: 't' }))
      }
    })
    await h.runner.start(coach3)
    await drive(h, () => recaps.some((m) => m.length === 1 && (m[0].content as string).startsWith('【往手回顾】')) && h.runner.view()!.coach!.busy === null, () => 'call')
    // 写回 thread 的也必须是带往手回顾的原文：同一手再提问，第一组就是这次复盘
    h.runner.ask('这手我没动作')
    await tick(10)
    const m = asks.at(-1)!
    expect(m[0].content as string).toMatch(/^【往手回顾】/)
    expect(JSON.stringify(m[1])).toContain('"toolName":"recap"')
  })

  it('局面变了再提问：重新附上当前局面', async () => {
    const asks: Msg[][] = []
    const h = await harness({ agents: { coachAsk: async (o, onDelta) => (asks.push(o.messages), onDelta('答'), { ok: true, aborted: false, text: '答' }) } })
    await h.runner.start(coach3)
    await drive(h, unlockedTurn(h), () => null)
    h.runner.heroAct({ type: 'call' })
    h.runner.ask('刚才跟对了吗')
    await tick(10)
    expect(asks[0].at(-1)!.content).toContain('当前局面（玩家视角）')
  })

  it('回放页复盘不读牌桌 thread', async () => {
    const recaps: Msg[][] = []
    const h = await harness({ agents: { coachRecap: async (o) => (recaps.push(o.messages), okCall({ headline: 'h', good: 'g', improve: 'i', tip: 't' })) } })
    await h.runner.start(coach3)
    await drive(h, () => hands(h) >= 2, () => 'call')
    const id = (await db.listHands())[0].id
    await h.runner.review(id)
    expect(recaps.at(-1)).toHaveLength(1)
    expect(recaps.at(-1)![0].content).not.toContain('【往手回顾】')
  })
})
