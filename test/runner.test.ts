import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../src/main/db'
import { commandHandlers, guardQuit } from '../src/main/ipc'
import { needsKey } from '../src/main/models/resolve'
import type { HandRecord, TableStart, TableView } from '../src/shared/types'
import { delayed, drive, harness, ok, seeded, setup, teardown, tick, type Harness } from './table-helpers'

afterEach(teardown)

type Answer = { ok: boolean; text: string; aborted: boolean }

const table6: TableStart = { size: 6, blinds: 1, picks: ['li', 'prof', 'bai', 'k', 'rock'], guided: false }
const table2: TableStart = { size: 2, blinds: 1, picks: ['li'], guided: false }
const opponentActs = (h: Harness) => h.chat.filter((m) => m.kind !== 'sys' && m.from !== 'hero' && m.act)
const heroFolds = (v: TableView) => (v.hero.toCall > 0 ? 'fold' : 'call')

// 每次推送视图时核对（规则独立于被测实现）：未结束时任何对手底牌都不得出现；
// 结束且摊牌时只允许未弃牌的对手；结束但未摊牌时一张都不允许
function noHoleLeak(h: Harness, _e: string, payload: unknown) {
  const g = h.runner.game
  if (!g || !payload) return
  const json = JSON.stringify(payload)
  for (const p of g.players) {
    if (p.isHero || (g.done && g.showdown && !p.folded)) continue
    for (const c of p.hole) if (json.includes(`"${c}"`)) throw new Error(`leaked ${p.name} ${c}`)
  }
}

describe('完整牌局', () => {
  beforeEach(() => setup({ autoNext: true }))

  it('6 人桌全 AI 决策 20 手：筹码守恒、每手落库并写入对手 thread、视图不含未亮底牌', async () => {
    const rng = seeded(42)
    const appended: string[] = []
    const leaks: string[] = []
    const h = harness({
      rng,
      agents: {
        opponentDecide: async (ctx) => {
          const v = ctx.table.viewFor(ctx.seat)
          const r = rng()
          const act = r < 0.1 && v.canRaise ? { type: 'raise' as const, to: v.maxTo } : r < 0.25 && v.canRaise ? { type: 'raise' as const, to: v.minTo } : r < 0.4 ? { type: 'fold' as const } : { type: 'call' as const }
          return ok({ act })
        },
        appendResult: async (pid, thread, text) => void appended.push(`${pid}|${thread}|${text}`)
      },
      onEmit: (hh, e, p) => {
        try {
          if (e === 'table:view') noHoleLeak(hh, e, p)
        } catch (err) {
          leaks.push(String(err))
        }
      }
    })
    await h.runner.init()
    await h.runner.start(table6)
    const buy = 100 * 100
    let rebuys = 0
    const baseline = 100000 + 5 * buy
    const seen = new Set<number>()
    await drive(
      h,
      () => {
        const g = h.runner.game!
        if (g.done && !seen.has(g.hand)) {
          seen.add(g.hand)
          rebuys = h.chat.filter((m) => m.kind === 'sys' && /重新买入/.test(m.text!)).length
          expect(h.runner.bankroll + g.players.reduce((a, p) => a + p.stack, 0)).toBe(baseline + rebuys * buy)
        }
        return seen.size >= 20 && g.hand > 20
      },
      (v) => (v.hero.toCall > 2000 ? 'fold' : 'call')
    )
    expect(leaks).toEqual([])
    await tick(1000)
    const hands = await db.listHands()
    expect(hands.length).toBeGreaterThanOrEqual(20)
    expect(h.of('hands:changed').length).toBe(hands.length)
    for (const { id } of hands) {
      const rec = (await db.getHand(id))!
      for (const p of rec.players) {
        const mayShow = p.id === 'hero' || (rec.showdown && !p.folded)
        if (mayShow) expect(p.hole).toHaveLength(2)
        else expect(p.hole).toBeNull()
      }
      expect(rec.log.every((x) => typeof x.board === 'boolean')).toBe(true)
    }
    expect(hands.some((x) => x.showdown)).toBe(true)
    for (const pid of ['li', 'prof', 'bai', 'k', 'rock']) expect(appended.filter((a) => a.startsWith(pid + '|')).length).toBeGreaterThanOrEqual(20)
    // 视图里的摊牌亮牌确实出现过：断言不是空转
    expect(h.views.some((v) => v.seats.some((s) => s.personaId && s.cards))).toBe(true)
    await h.runner.leave()
    const g0 = h.runner.game
    expect(g0).toBeNull()
    expect(await db.getBankroll()).toBe(h.runner.bankroll)
  })
})

describe('超时托管与熔断', () => {
  beforeEach(() => setup())

  it('决策 11 秒 → 托管并标记；连续 3 次 → breaker 且不再调用；retryModels 恢复', async () => {
    let calls = 0
    let slow = true
    const h = harness({
      agents: {
        opponentDecide: (ctx, s) => {
          calls++
          const v = ctx.table.viewFor(ctx.seat)
          const act = { type: v.toCall ? 'call' : 'check' } as const
          return slow ? delayed(11_000, s, () => ok({ act }), () => ({ ok: false, aborted: true, intents: {} })) : Promise.resolve(ok({ act }))
        }
      }
    })
    await h.runner.init()
    await h.runner.start(table6)
    await drive(h, () => opponentActs(h).length >= 1)
    const first = opponentActs(h)[0]
    expect(first.autopilot).toBe(true)
    expect(h.runner.game!.log.some((x) => x.autopilot)).toBe(true)
    expect(h.views.some((v) => v.seats.some((s) => s.autopilot && s.status.startsWith('托管 · ')))).toBe(true)
    await drive(h, () => h.of('breaker').some((b) => b.opponent))
    expect(calls).toBe(3)
    expect(h.runner.autopilotCount).toBe(3)
    const acts = opponentActs(h).length
    await drive(h, () => opponentActs(h).length >= acts + 3)
    expect(calls).toBe(3)
    expect(opponentActs(h).slice(acts).every((m) => m.autopilot)).toBe(true)
    slow = false
    h.runner.retryModels()
    expect(h.of('breaker').at(-1)).toEqual({ opponent: false, coach: false })
    const n = opponentActs(h).length
    await drive(h, () => opponentActs(h).length >= n + 1)
    expect(calls).toBe(4)
    expect(opponentActs(h).at(-1)!.autopilot).toBeUndefined()
  })

  it('过期结果丢弃：决策期间离桌，返回后不 apply、不计失败', async () => {
    let started = false
    const h = harness({
      agents: {
        opponentDecide: async () => {
          started = true
          await new Promise((r) => setTimeout(r, 3000))
          return ok({ act: { type: 'raise' as const, to: 999999 } })
        }
      }
    })
    await h.runner.init()
    await h.runner.start(table6)
    await drive(h, () => started)
    const g = h.runner.game!
    const logLen = g.log.length
    const stack = g.players[0].stack
    await h.runner.leave()
    const after = h.events.length
    await tick(5000)
    expect(g.log.length).toBe(logLen)
    expect(h.events.slice(after).filter((e) => e.event === 'chat:append')).toEqual([])
    expect(h.runner.breaker.opponent).toBe(0)
    // 已入池部分作废，只退回剩余筹码
    expect(await db.getBankroll()).toBe(100000 - 10000 + stack)
  })

  it('暂停挂起：决策返回时已暂停，resume 后提交原决策', async () => {
    let started = false
    const h = harness({
      agents: {
        opponentDecide: async () => {
          started = true
          await new Promise((r) => setTimeout(r, 2000))
          return ok({ act: { type: 'call' as const }, say: { text: '看我的', kind: 'reply' as const } })
        },
        coachAsk: async (_c, _q, _d, s) => delayed<Answer>(500, s, () => ({ ok: true, text: '答', aborted: false }), () => ({ ok: false, text: '', aborted: true }))
      }
    })
    await h.runner.init()
    await h.runner.start(table6)
    await drive(h, () => started)
    const n = opponentActs(h).length
    h.runner.ask('现在怎么办')
    expect(h.runner.paused).toBe(true)
    await tick(3000)
    expect(h.runner.pendingAI).not.toBeNull()
    expect(opponentActs(h).length).toBe(n)
    h.runner.resume()
    expect(opponentActs(h).length).toBe(n + 1)
    expect(opponentActs(h).at(-1)).toMatchObject({ kind: 'msg', text: '看我的', triggers: false })
  })

  it('决策在途时暂停又恢复：不重复发起决策，原结果照常提交且不算失败', async () => {
    let calls = 0
    const h = harness({
      agents: {
        opponentDecide: async (_c, s) => (calls++, delayed(3000, s, () => ok({ act: { type: 'call' } }), () => ({ ok: false, aborted: true, intents: {} }))),
        coachAsk: async () => ({ ok: true, text: '答', aborted: false })
      }
    })
    await h.runner.init()
    await h.runner.start(table6)
    await drive(h, () => calls === 1)
    const n = opponentActs(h).length
    h.runner.ask('等等')
    await tick(100)
    h.runner.resume()
    await tick(3000)
    expect(calls).toBe(1)
    expect(opponentActs(h).length).toBe(n + 1)
    expect(opponentActs(h).at(-1)!.autopilot).toBeUndefined()
    expect(h.runner.breaker.opponent).toBe(0)
  })
})

describe('教练', () => {
  beforeEach(() => setup({ coachOn: true }))

  it('proactive 返回 pause → 暂停；resume 后同一决策点不再调用教练', async () => {
    let calls = 0
    const h = harness({ agents: { coachProactive: async () => (calls++, ok({ pause: '想清楚' })) } })
    await h.runner.init()
    await h.runner.start(table6)
    await drive(h, () => calls > 0, () => null)
    await tick(0)
    expect(h.runner.paused).toBe(true)
    expect(h.of('coach:alert').at(-1)).toEqual({ level: 'pause', message: '想清楚' })
    h.runner.resume()
    await tick(1000)
    expect(h.runner.paused).toBe(false)
    expect(calls).toBe(1)
  })

  it('教练晚到：proactive 返回前玩家已行动 → 丢弃 pause', async () => {
    let calls = 0
    const h = harness({
      agents: {
        coachProactive: async (_c, s) => (calls++, delayed(2000, s, () => ok({ pause: '晚了' }), () => ({ ok: false, aborted: true, intents: {} }))),
        // 对手慢一些：保证教练返回时还没轮回到玩家（否则新一轮 proactive 会先抢占它）
        opponentDecide: (ctx, s) => delayed(5000, s, () => ok({ act: { type: 'call' as const } }), () => ({ ok: false, aborted: true, intents: {} }))
      }
    })
    await h.runner.init()
    await h.runner.start(table2)
    await drive(h, () => calls > 0, () => null)
    h.runner.heroAct({ type: 'call' })
    await tick(2500)
    expect(calls).toBe(1)
    expect(h.of('coach:alert').filter((a) => a?.level === 'pause')).toEqual([])
    expect(h.runner.paused).toBe(false)
  })

  it('教练连续 3 次失败 → breaker，之后 proactive 与 ask 都不发起', async () => {
    let calls = 0
    await db.updateSettings({ autoNext: true })
    const h = harness({ agents: { coachProactive: async () => (calls++, { ok: false, aborted: false, intents: {}, error: 'boom' }) } })
    await h.runner.init()
    await h.runner.start(table6)
    await drive(h, () => h.of('breaker').some((b) => b.coach))
    expect(calls).toBe(3)
    await drive(h, () => h.runner.game!.hand >= 4)
    expect(calls).toBe(3)
    const id = h.runner.ask('还在吗')
    await new Promise((r) => setImmediate(r))
    expect(h.of('coach:done').at(-1)).toEqual({ requestId: id, ok: false, error: 'breaker' })
  })

  it('未配置教练模型：ask 不暂停，命令返回后才推 coach:done not_configured', async () => {
    const h = harness({ agents: { modelReady: (role) => role !== 'coach' } })
    await h.runner.init()
    await h.runner.start(table6)
    const id = h.runner.ask('问')
    expect(h.of('coach:done')).toEqual([])
    expect(h.runner.paused).toBe(false)
    await new Promise((r) => setImmediate(r))
    expect(h.of('coach:done')).toEqual([{ requestId: id, ok: false, error: 'not_configured' }])
  })

  it('连续两次 ask：第一次 interrupted，askInFlight 在第二次结束才清除；ask 期间不发起 proactive', async () => {
    let proactive = 0
    const h = harness({
      agents: {
        coachProactive: async () => (proactive++, ok({})),
        coachAsk: (_c, q, onDelta, s) => {
          onDelta(q + '…')
          return delayed<Answer>(3000, s, () => ({ ok: true, text: q, aborted: false }), () => ({ ok: false, text: q + '…', aborted: true }))
        }
      }
    })
    await h.runner.init()
    await h.runner.start(table6)
    await drive(h, () => proactive > 0, () => null)
    const a = h.runner.ask('一')
    await tick(500)
    const b = h.runner.ask('二')
    await tick(2000)
    expect(h.of('coach:done')).toEqual([{ requestId: a, ok: false, error: 'interrupted' }])
    expect(h.runner.askInFlight).toBe(true)
    expect(h.runner.coachThread.find((e) => e.requestId === a && e.role === 'assistant')).toMatchObject({ text: '一…', interrupted: true })
    await tick(1500)
    expect(h.of('coach:done').at(-1)).toEqual({ requestId: b, ok: true })
    expect(h.runner.askInFlight).toBe(false)
    expect(proactive).toBe(1)
    // 回到同一决策点不再触发；玩家行动后到下一个决策点才再次触发
    h.runner.resume()
    await drive(h, () => proactive > 1)
  })

  it('自动下一手等 ask 结束', async () => {
    await db.updateSettings({ autoNext: true, coachOn: false })
    const h = harness({
      agents: {
        opponentDecide: async () => ok({ act: { type: 'raise' as const, to: 400 } }),
        coachAsk: (_c, q, _d, s) => delayed<Answer>(8000, s, () => ({ ok: true, text: q, aborted: false }), () => ({ ok: false, text: '', aborted: true }))
      }
    })
    await h.runner.init()
    await h.runner.start(table2)
    await drive(h, () => h.runner.game!.done, heroFolds)
    h.runner.ask('刚才那手')
    await tick(6000)
    expect(h.runner.game!.hand).toBe(1)
    await tick(2100)
    expect(h.runner.game!.hand).toBe(2)
  })

  it('复盘：失败与被队列拒绝都推 review:done 带 error；成功落库', async () => {
    const rec = { hand: 1, sb: 50, bb: 100, net: 0, pot: 150, showdown: false, hero: ['As', 'Kd'], board: [], players: [], log: [], vpip: false, pfr: false } as HandRecord
    const ids = [] as number[]
    for (let i = 0; i < 5; i++) ids.push(await db.insertHand('t', rec))
    const h = harness({
      agents: {
        coachReview: async (id, _r, s) =>
          id === ids[0] ? { ok: false, error: 'boom' } : delayed<{ ok: boolean; text?: string; error?: string }>(1000, s, () => ({ ok: true, text: '复盘' + id }), () => ({ ok: false, error: 'aborted' }))
      }
    })
    await h.runner.review(ids[0])
    expect(h.of('review:done')).toEqual([{ handId: ids[0], error: 'boom' }])
    const running = [1, 2, 3, 4].map((k) => h.runner.review(ids[k]))
    void h.runner.review(ids[1])
    await tick(0)
    await tick(5000)
    await Promise.all(running)
    const done = h.of('review:done').slice(1)
    expect(done).toContainEqual({ handId: ids[4], error: 'dropped' })
    expect(done).toContainEqual({ handId: ids[1], text: '复盘' + ids[1] })
    expect(done.filter((d) => d.handId === ids[1])).toHaveLength(1)
    expect(await db.getReview(ids[1])).toBe('复盘' + ids[1])
  })
})

describe('一手结束', () => {
  beforeEach(() => setup({ autoNext: true }))

  const raiser = { opponentDecide: async () => ok({ act: { type: 'raise' as const, to: 400 } }) }

  it('赢家发言延迟 6 秒：发言写入公屏，下一手在发言返回后才开始', async () => {
    const h = harness({
      agents: {
        ...raiser,
        opponentChat: (_c, mode, _i, s) => delayed(6000, s, () => ok(mode === 'win' ? { say: { text: '承让', kind: 'reply' as const } } : {}), () => ({ ok: false, aborted: true, intents: {} }))
      }
    })
    await h.runner.init()
    await h.runner.start(table2)
    await drive(h, () => h.runner.game!.done, heroFolds)
    expect(h.runner.winSpeechInFlight).toBe(1)
    await tick(5000)
    expect(h.runner.game!.hand).toBe(1)
    await tick(1100)
    const said = h.chat.find((m) => m.text === '承让')!
    expect(said).toMatchObject({ kind: 'msg', from: 'li', triggers: true })
    expect(h.runner.game!.hand).toBe(2)
    expect(h.chat.indexOf(said)).toBeLessThan(h.chat.findIndex((m) => m.text === '第 2 手 · 翻牌前'))
  })

  it('赢家发言被队列拒绝：取预设台词，自动下一手仍在 4.5 秒后触发', async () => {
    let chatCalls = 0
    const h = harness({
      rng: () => 0.01,
      agents: { ...raiser, opponentChat: async () => (chatCalls++, ok({ say: { text: '不该出现', kind: 'free' as const } })) },
      onEmit: (hh, e, p) => {
        // 一手结束的第一条系统消息之后才入队结果与赢家发言：此刻把赢家队列塞满（1 个运行 + 2 个排队）
        if (e === 'chat:append' && / 赢得 /.test((p as { text?: string }).text ?? '') && !filled) {
          filled = true
          const q = hh.runner.queue('li')
          for (let i = 0; i < 3; i++) void q.run({ fn: () => new Promise((r) => setTimeout(r, 60_000)) })
        }
      }
    })
    let filled = false
    await h.runner.init()
    await h.runner.start(table2)
    await drive(h, () => h.runner.game!.done, heroFolds)
    await tick(0)
    expect(chatCalls).toBe(0)
    expect(h.runner.winSpeechInFlight).toBeNull()
    expect(h.chat.at(-1)).toMatchObject({ from: 'li', text: '谢谢各位～', triggers: false })
    // drive 以 100ms 步进发现一手结束，故留出这一步的误差
    await tick(4300)
    expect(h.runner.game!.hand).toBe(1)
    await tick(300)
    expect(h.runner.game!.hand).toBe(2)
  })

  it('赢家发言返回前手动发下一手：整体丢弃，不补台词', async () => {
    const h = harness({
      rng: () => 0.01,
      agents: { ...raiser, opponentChat: (_c, _m, _i, s) => delayed(3000, s, () => ok({ say: { text: '迟到的话', kind: 'free' as const } }), () => ({ ok: false, aborted: true, intents: {} })) }
    })
    await db.updateSettings({ autoNext: false })
    await h.runner.init()
    await h.runner.start(table2)
    await drive(h, () => h.runner.game!.done, heroFolds)
    h.runner.nextHand()
    const n = h.chat.length
    await tick(4000)
    expect(h.chat.slice(n).filter((m) => m.from === 'li' && m.kind === 'msg')).toEqual([])
  })

  it('每手结果 durable：下一手决策抢占时仍写入 thread，且先于决策', async () => {
    const order: string[] = []
    const h = harness({
      agents: {
        ...raiser,
        opponentDecide: async (ctx) => (order.push(`decide:${ctx.table.viewFor(ctx.seat).handNo}`), ok({ act: { type: 'raise' as const, to: 400 } })),
        appendResult: async (_p, _t, text) => {
          await new Promise((r) => setTimeout(r, 3000))
          order.push(`append:${text.match(/第 (\d+) 手/)![1]}`)
        }
      }
    })
    await db.updateSettings({ autoNext: false })
    await h.runner.init()
    await h.runner.start(table2)
    await drive(h, () => h.runner.game!.done, heroFolds)
    h.runner.nextHand()
    await drive(h, () => order.includes('decide:2'), heroFolds)
    expect(order.indexOf('append:1')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('append:1')).toBeLessThan(order.indexOf('decide:2'))
  })
})

describe('离桌与退出', () => {
  beforeEach(() => setup())

  it('中途退出：before-quit 先拦下，余额加回玩家筹码并写库后才退出', async () => {
    const h = harness()
    await h.runner.init()
    await h.runner.start(table6)
    await drive(h, () => h.runner.game!.log.length > 4)
    const stack = h.runner.game!.players[0].stack
    let handler!: (e: { preventDefault: () => void }) => void
    const quit = vi.fn(() => handler({ preventDefault: prevent }))
    const prevent = vi.fn()
    guardQuit({ on: (_: string, fn: typeof handler) => (handler = fn), quit } as never, h.runner)
    handler({ preventDefault: prevent })
    expect(prevent).toHaveBeenCalledTimes(1)
    handler({ preventDefault: prevent })
    expect(prevent).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))
    expect(prevent).toHaveBeenCalledTimes(2)
    expect(await db.getBankroll()).toBe(100000 - 10000 + stack)
    expect(h.runner.game).toBeNull()
  })

  it('table.start 已有桌时先退回原桌筹码；rebuy 扣余额；教学牌局固定配置', async () => {
    const h = harness()
    await h.runner.init()
    await h.runner.start(table6)
    expect(h.runner.bankroll).toBe(90000)
    const back = h.runner.game!.players[0].stack
    await h.runner.start({ ...table6, guided: true })
    const g = h.runner.game!
    expect(h.runner.bankroll).toBe(90000 + back - 2000)
    expect(g.players.map((p) => p.personaId ?? p.id)).toEqual(['hero', 'bai', 'zen'])
    expect([g.sb, g.bb]).toEqual([10, 20])
    expect(db.getSettings()).toMatchObject({ coachOn: true, level: 'novice' })
    expect(h.of('coach:alert').at(-1)?.message).toMatch(/教学牌局/)
    g.players[0].stack = 0
    g.done = true
    await h.runner.rebuy()
    expect(h.runner.bankroll).toBe(90000 + back - 4000)
    expect(g.players[0].stack).toBe(2000 - (g.players[0].bet || 0))
  })
})

describe('IPC', () => {
  beforeEach(() => setup())

  it('provider.save 带新 key 后清除 needsKey；bootstrap 不含明文 key 与底牌', async () => {
    const h = harness()
    await h.runner.init()
    const cmd = commandHandlers(h.runner)
    const p = await cmd['provider.save']({ name: 'x', kind: 'openai', apiKey: 'sk-secret-1234' })
    needsKey.add(p.id)
    const again = await cmd['provider.save']({ id: p.id, name: 'x', kind: 'openai' })
    expect(again.needsKey).toBe(true)
    const fixed = await cmd['provider.save']({ id: p.id, name: 'x', kind: 'openai', apiKey: 'sk-new-5678' })
    expect(fixed.needsKey).toBe(false)
    await h.runner.start(table6)
    const boot = await cmd['app.bootstrap']()
    const json = JSON.stringify(boot)
    expect(json).not.toMatch(/sk-/)
    expect(boot.providers[0].keyTail).toBe('5678')
    expect(boot.hasTable).toBe(true)
    const g = h.runner.game!
    for (const q of g.players.slice(1)) for (const c of q.hole) expect(json).not.toContain(`"${c}"`)
    expect((await cmd['provider.registry']()).at(-1)!.kind).toBe('openai-compatible')
    await expect(cmd['data.resetMemory']()).rejects.toThrow()
  })
})
