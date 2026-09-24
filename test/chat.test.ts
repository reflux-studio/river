import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../src/main/db'
import type { OpponentCtx } from '../src/main/agents/opponent'
import type { TableStart, TableView } from '../src/shared/types'
import { delayed, drive, harness, ok, setup, teardown, tick, type Harness } from './table-helpers'

// 抽样恒中（0.01 < 所有角色健谈度）；预设台词概率判断也恒中
const always = () => 0.01
const table4: TableStart = { size: 4, blinds: 1, picks: ['li', 'bai', 'k'], guided: false }
const table3: TableStart = { size: 3, blinds: 1, picks: ['li', 'bai'], guided: false }
const heroFolds = (v: TableView) => (v.hero.toCall > 0 ? 'fold' : 'call')
const idle = { opponentDecide: (_c: OpponentCtx, s: AbortSignal) => delayed(600_000, s, () => ok({}), () => ({ ok: false, aborted: true, intents: {} })) }

type ChatCall = { pid: string; mode: string; input: string }

function recorder(say?: (c: ChatCall) => { text: string; kind: 'free' | 'reply' } | undefined) {
  const calls: ChatCall[] = []
  const opponentChat = async (ctx: OpponentCtx, mode: 'chat' | 'win', input: string) => {
    const c = { pid: ctx.personaId, mode, input }
    calls.push(c)
    const s = say?.(c)
    return ok(s ? { say: s } : {})
  }
  return { calls, opponentChat }
}

beforeEach(() => setup())
afterEach(teardown)

async function seat(h: Harness, t: TableStart = table4) {
  await h.runner.start(t)
  await tick(0)
}

describe('公屏触发表', () => {
  it('玩家发言触发；chat 模式的回应不再触发（限一层）', async () => {
    const r = recorder(() => ({ text: '哈哈好', kind: 'free' }))
    const h = await harness({ rng: always, agents: { ...idle, opponentChat: r.opponentChat } })
    await seat(h)
    const thinking = h.runner.thinking
    h.runner.sendChat('大家好')
    expect(h.chat.at(-1)).toMatchObject({ kind: 'msg', from: 'hero', text: '大家好', triggers: true })
    await tick(0)
    const expected = ['li', 'bai', 'k'].filter((p) => p !== thinking)
    expect(r.calls.map((c) => c.pid).sort()).toEqual(expected.sort())
    expect(r.calls.every((c) => c.mode === 'chat' && c.input.includes('大家好'))).toBe(true)
    const replies = h.chat.filter((m) => m.text === '哈哈好')
    expect(replies).toHaveLength(expected.length)
    expect(replies.every((m) => m.triggers === false && m.replyTo === h.chat.find((x) => x.text === '大家好')!.id)).toBe(true)
    await tick(1000)
    expect(r.calls).toHaveLength(expected.length)
  })

  it('10 秒冷却：冷却内再次发言不触发同一对手，满 10 秒后恢复', async () => {
    const r = recorder()
    const h = await harness({ rng: always, agents: { ...idle, opponentChat: r.opponentChat } })
    await seat(h)
    h.runner.sendChat('一')
    await tick(0)
    const n = r.calls.length
    expect(n).toBeGreaterThan(0)
    await tick(9000)
    h.runner.sendChat('二')
    await tick(0)
    expect(r.calls).toHaveLength(n)
    await tick(1100)
    h.runner.sendChat('三')
    await tick(0)
    expect(r.calls).toHaveLength(2 * n)
  })

  it('正在决策的对手不被触发', async () => {
    const r = recorder()
    const h = await harness({ rng: always, agents: { ...idle, opponentChat: r.opponentChat } })
    await seat(h)
    await drive(h, () => h.runner.thinking !== null)
    const thinking = h.runner.thinking
    h.runner.sendChat('嘿')
    await tick(0)
    expect(thinking).not.toBeNull()
    expect(r.calls.length).toBeGreaterThan(0)
    expect(r.calls.map((c) => c.pid)).not.toContain(thinking)
  })

  it('decide 的 free 发言触发，reply 发言不触发', async () => {
    let kind: 'free' | 'reply' = 'free'
    const r = recorder()
    const h = await harness({
      rng: always,
      agents: { opponentChat: r.opponentChat, opponentDecide: async () => ok({ act: { type: 'call' as const }, say: { text: kind === 'free' ? '我先说' : '回你', kind } }) }
    })
    await seat(h)
    await drive(h, () => h.chat.some((m) => m.text === '我先说'))
    expect(h.chat.find((m) => m.text === '我先说')).toMatchObject({ kind: 'msg', triggers: true })
    await tick(0)
    expect(r.calls.length).toBeGreaterThan(0)
    kind = 'reply'
    await tick(10_000)
    const before = r.calls.length
    await drive(h, () => h.chat.some((m) => m.text === '回你'))
    await tick(0)
    expect(h.chat.find((m) => m.text === '回你')).toMatchObject({ triggers: false })
    expect(r.calls).toHaveLength(before)
  })

  it('赢家发言触发其他对手回应', async () => {
    await db.updateSettings({ autoNext: false })
    const r = recorder((c) => (c.mode === 'win' ? { text: '赢啦', kind: 'reply' } : undefined))
    const h = await harness({ rng: always, agents: { opponentChat: r.opponentChat, opponentDecide: async () => ok({ act: { type: 'raise' as const, to: 400 } }) } })
    await seat(h, table3)
    await drive(h, () => h.runner.game!.done, heroFolds)
    await tick(0)
    const win = h.chat.find((m) => m.text === '赢啦')!
    expect(win).toMatchObject({ kind: 'msg', triggers: true })
    const replies = r.calls.filter((c) => c.mode === 'chat')
    expect(replies.length).toBeGreaterThan(0)
    expect(replies.every((c) => c.pid !== win.from && c.input.includes('赢啦'))).toBe(true)
  })

  it('托管预设台词不触发', async () => {
    const r = recorder()
    const h = await harness({ rng: always, limits: { decide: 1 }, agents: { ...idle, opponentChat: r.opponentChat } })
    await seat(h)
    await drive(h, () => h.chat.some((m) => m.autopilot))
    const m = h.chat.find((x) => x.autopilot)!
    expect(m).toMatchObject({ kind: 'msg', triggers: false })
    await tick(0)
    expect(r.calls).toHaveLength(0)
  })

  it('本地引擎模式：玩家发言不发起任何对手调用，行动台词取预设', async () => {
    await db.updateSettings({ engine: 'local' })
    let decides = 0
    const r = recorder()
    const h = await harness({ rng: always, agents: { opponentChat: r.opponentChat, opponentDecide: async () => (decides++, ok({})) } })
    await seat(h)
    h.runner.sendChat('有人吗')
    await drive(h, () => h.chat.filter((m) => m.act && m.from !== 'hero').length >= 2, () => 'call')
    expect(r.calls).toHaveLength(0)
    expect(decides).toBe(0)
    expect(h.chat.filter((m) => m.act && m.from !== 'hero').every((m) => !m.autopilot && m.kind === 'msg' && !m.triggers)).toBe(true)
  })
})

describe('泄牌过滤', () => {
  // 说出自己第一张底牌的点数
  const leakText = (ctx: OpponentCtx) => {
    const c = ctx.table.viewFor(ctx.seat).myCards[0]
    return `我拿到${c[0] === 'T' ? '10' : c[0]}了`
  }

  it('decide 的 say 含本人底牌点数 → 整句丢弃，行动照常', async () => {
    const said: string[] = []
    const h = await harness({
      rng: always,
      agents: { opponentDecide: async (ctx) => (said.push(leakText(ctx)), ok({ act: { type: 'call' as const }, say: { text: leakText(ctx), kind: 'free' as const } })) }
    })
    await seat(h)
    await drive(h, () => said.length >= 2, () => 'call')
    await tick(0)
    for (const t of said) expect(h.chat.some((m) => m.text === t)).toBe(false)
    expect(h.chat.filter((m) => m.from !== 'hero' && m.act).length).toBeGreaterThanOrEqual(2)
  })

  it('chat 与 win 的 say 含本人底牌点数 → 公屏不出现', async () => {
    await db.updateSettings({ autoNext: false })
    const said: string[] = []
    const h = await harness({
      rng: always,
      agents: {
        opponentDecide: async () => ok({ act: { type: 'raise' as const, to: 400 } }),
        opponentChat: async (ctx) => (said.push(leakText(ctx)), ok({ say: { text: leakText(ctx), kind: 'free' as const } }))
      }
    })
    await seat(h, table3)
    h.runner.sendChat('聊聊')
    await drive(h, () => h.runner.game!.done, heroFolds)
    await tick(0)
    expect(said.length).toBeGreaterThanOrEqual(2)
    for (const t of said) expect(h.chat.some((m) => m.text === t)).toBe(false)
  })
})
