import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import { RequestContext } from '@mastra/core/request-context'
import * as db from '../src/main/db'
import { coachAlert } from '../src/main/agents/intents'
import { appendThreadMessage, closeMastra, initMastra, resetMemories, rt } from '../src/main/agents/mastra'
import { OPPONENT_WM, opponentChat, opponentDecide } from '../src/main/agents/opponent'
import { COACH_WM, coachAsk, coachProactive, coachReview } from '../src/main/agents/coach'
import { coachTools, opponentTools } from '../src/main/agents/tools'
import { buildSeatView, type TableQuery } from '../src/main/agents/views'
import { newGame, startHand } from '../src/main/engine/poker'
import type { HandRecord } from '../src/shared/types'
import { scriptModel, type Step } from './mock-model'

const crypto = { encrypt: (t: string) => Buffer.from(t), decrypt: (b: Buffer) => b.toString() }

let dir: string
let url: string
let model: ReturnType<typeof scriptModel>
const calls: { role: string; ok: boolean }[] = []
const script = (steps: Step[]) => (model = scriptModel(steps))

// 固定种子的真实牌局，座位 0 为玩家，1 为阿狸
function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
}
function makeTable() {
  const g = newGame(
    { sb: 50, bb: 100, players: [{ id: 'hero', name: '你', isHero: true, stack: 10000 }, { id: 'li', personaId: 'li', name: '阿狸', isHero: false, stack: 10000 }, { id: 'k', personaId: 'k', name: '老K', isHero: false, stack: 10000 }] },
    seeded(7)
  )
  startHand(g)
  const viewed: number[] = []
  const table: TableQuery = {
    viewFor: (seat) => (viewed.push(seat), buildSeatView(g, seat, (id) => g.players.find((p) => p.id === id)!.name, () => '')),
    chat: () => [{ id: 'm1', kind: 'msg', from: 'hero', text: '来啊', triggers: true, at: 1 }],
    equityFor: () => ({ eq: 0.5, need: 0.3, outs: null, handName: '高牌' })
  }
  return { g, table, viewed }
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'river-agents-'))
  url = 'file:' + join(dir, 'river.db')
  await db.initDb({ url, ...crypto })
  calls.length = 0
  script([])
  await initMastra({ url, model: (() => model) as never, onCall: (e) => calls.push(e) })
})

afterEach(async () => {
  await closeMastra()
  db.closeDb()
  rmSync(dir, { recursive: true, force: true })
})

const liCtx = (table: TableQuery) => ({ tableId: 't1', seat: 1, personaId: 'li', table })
const never = () => new AbortController().signal

describe('opponent decide', () => {
  it('依次调用 view_table、act：意图写入，act 之后不再调用模型', async () => {
    const { table, viewed } = makeTable()
    script([{ tools: [{ name: 'view_table', input: {} }] }, { tools: [{ name: 'act', input: { action: 'raise', to: 400 } }] }, { text: '不该到这里' }])
    const r = await opponentDecide(liCtx(table), never())
    expect(r).toMatchObject({ ok: true, aborted: false, intents: { act: { type: 'raise', to: 400 } } })
    expect(viewed).toEqual([1])
    expect(model.calls).toHaveLength(2)
    expect(model.calls[0].toolChoice).toEqual({ type: 'required' })
    expect(model.calls[0].tools.sort()).toEqual(['act', 'estimate_equity', 'hand_history', 'read_chat', 'say', 'updateWorkingMemory', 'view_table'])
    expect(calls).toEqual([expect.objectContaining({ role: 'opponent', ok: true })])
  })

  it('同一步 say + act + updateWorkingMemory 三者都执行，WM 写入 SQLite', async () => {
    const { table } = makeTable()
    const wm = OPPONENT_WM.replace('- 心情：', '- 心情：不错')
    script([{ tools: [
      { name: 'say', input: { text: '谁敢跟？', kind: 'reply', reply_to: 'm1' } },
      { name: 'act', input: { action: 'call' } },
      { name: 'updateWorkingMemory', input: { memory: wm } }
    ] }])
    const r = await opponentDecide(liCtx(table), never())
    expect(r.intents).toEqual({ say: { text: '谁敢跟？', kind: 'reply', replyTo: 'm1' }, act: { type: 'call', to: undefined } })
    expect(model.calls).toHaveLength(1)
    const c = createClient({ url })
    const row = (await c.execute({ sql: 'SELECT workingMemory FROM mastra_resources WHERE id = ?', args: ['opponent:li'] })).rows[0]
    c.close()
    expect(String(row.workingMemory)).toContain('心情：不错')
    // thread 按 task 约定命名
    expect(await rt().opponentMemory.getThreadById({ threadId: 'table:t1:li' })).not.toBeNull()
  })

  it('instructions：人设名、提示词覆盖、健谈度、泄牌约束与 decide 片段', async () => {
    const { table } = makeTable()
    await db.setPrompt('li', '自定义阿狸提示词。')
    script([{ tools: [{ name: 'act', input: { action: 'check' } }] }])
    await opponentDecide(liCtx(table), never())
    const sys = model.calls[0].system
    for (const t of ['扮演「阿狸」', '自定义阿狸提示词。你爱说话。', '绝不透露或暗示自己的底牌', '先用 view_table']) expect(sys).toContain(t)
  })

  it('一步里两个 act 取第一个', async () => {
    const { table } = makeTable()
    script([{ tools: [{ name: 'act', input: { action: 'fold' } }, { name: 'act', input: { action: 'raise', to: 999 } }] }])
    const r = await opponentDecide(liCtx(table), never())
    expect(r.intents.act).toEqual({ type: 'fold', to: undefined })
  })

  it('提供方不支持 required 时改用 auto', async () => {
    const { table } = makeTable()
    await db.saveProvider({ id: 'p1', name: 'x', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:1' })
    await db.setSupportsRequired('p1', false)
    await db.updateSettings({ models: { opponent: { providerId: 'p1', modelId: 'm' } } })
    script([{ tools: [{ name: 'act', input: { action: 'check' } }] }])
    await opponentDecide(liCtx(table), never())
    expect(model.calls[0].toolChoice).toEqual({ type: 'auto' })
  })

  it('被中止时不抛错：aborted=true、ok=false，onCall 记失败', async () => {
    const { table } = makeTable()
    script([{ delayMs: 5000, text: 'x' }])
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 50)
    const r = await opponentDecide(liCtx(table), ac.signal)
    expect(r).toMatchObject({ ok: false, aborted: true })
    expect(calls).toEqual([expect.objectContaining({ role: 'opponent', ok: false })])
  })

  it('模型报错时返回 error 不抛出', async () => {
    const { table } = makeTable()
    script([{ error: 'boom' }])
    const r = await opponentDecide(liCtx(table), never())
    expect(r.ok).toBe(false)
    expect(r.aborted).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('chat 模式只开放 read_chat、hand_history、say、updateWorkingMemory，toolChoice auto', async () => {
    const { table } = makeTable()
    script([{ tools: [{ name: 'say', input: { text: '哈哈', kind: 'free' } }] }, { text: '' }])
    const r = await opponentChat(liCtx(table), 'chat', '玩家说：来啊', never())
    expect(r.intents.say?.text).toBe('哈哈')
    expect(model.calls[0].tools.sort()).toEqual(['hand_history', 'read_chat', 'say', 'updateWorkingMemory'])
    expect(model.calls[0].toolChoice).toEqual({ type: 'auto' })
  })
})

describe('coach', () => {
  it('proactive：pause 优先于 hint，工具含 updateWorkingMemory', async () => {
    const { table, viewed } = makeTable()
    script([{ tools: [{ name: 'view_hero', input: {} }, { name: 'hint', input: { message: 'h1' } }, { name: 'pause_game', input: { message: 'p1' } }, { name: 'hint', input: { message: 'h2' } }] }, { text: '' }])
    const r = await coachProactive({ tableId: 't1', table }, never())
    expect(viewed).toEqual([0])
    expect(r.intents).toEqual({ hint: 'h1', pause: 'p1' })
    expect(coachAlert(r.intents)).toEqual({ level: 'pause', message: 'p1' })
    expect(coachAlert({ hint: 'h1' })).toEqual({ level: 'hint', message: 'h1' })
    expect(model.calls[0].tools.sort()).toEqual(['estimate_equity', 'hint', 'pause_game', 'read_chat', 'recent_hands', 'updateWorkingMemory', 'view_hero'])
    for (const t of ['人设：温和老师', '只知道玩家能看到的信息', '玩家是新手', '常规决策不打扰']) expect(model.calls[0].system).toContain(t)
  })

  it('ask 流式输出', async () => {
    const { table } = makeTable()
    script([{ text: '先看位置。' }])
    const deltas: string[] = []
    const r = await coachAsk({ tableId: 't1', table }, '怎么打？', (d) => deltas.push(d), never())
    expect(r).toMatchObject({ ok: true, aborted: false, text: '先看位置。' })
    expect(deltas.join('')).toBe('先看位置。')
    expect(model.calls[0].tools.sort()).toEqual(['estimate_equity', 'read_chat', 'recent_hands', 'updateWorkingMemory', 'view_hero'])
  })

  it('ask 被中止返回 aborted', async () => {
    const { table } = makeTable()
    script([{ delayMs: 5000, text: 'x' }])
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 50)
    const r = await coachAsk({ tableId: 't1', table }, '？', () => {}, ac.signal)
    expect(r).toMatchObject({ ok: false, aborted: true })
  })

  it('review 不暴露 updateWorkingMemory，且不写 working memory', async () => {
    const rec: HandRecord = { hand: 3, sb: 50, bb: 100, net: -100, pot: 300, showdown: false, hero: ['As', 'Kd'], board: [], players: [], log: [], vpip: true, pfr: false }
    script([{ text: '做得好的一步……' }])
    const r = await coachReview(9, rec, never())
    expect(r).toEqual({ ok: true, text: '做得好的一步……' })
    expect(model.calls[0].tools).toEqual(['recent_hands'])
    // readOnly 下 Mastra 仍会建 thread，但不保存消息
    const { messages } = await rt().coachMemory.recall({ threadId: 'review:9', resourceId: 'hero' })
    expect(messages).toEqual([])
  })
})

describe('memory 维护', () => {
  it('appendThreadMessage 先建 thread 再写消息；resetMemories 删 thread 并恢复模板', async () => {
    const { opponentMemory, coachMemory } = rt()
    await appendThreadMessage(opponentMemory, 'table:t1:li', 'opponent:li', '第 1 手结束')
    await appendThreadMessage(opponentMemory, 'table:t1:li', 'opponent:li', '第 2 手结束')
    const { messages } = await opponentMemory.recall({ threadId: 'table:t1:li', resourceId: 'opponent:li' })
    expect(messages.map((m) => m.content.parts[0])).toEqual([{ type: 'text', text: '第 1 手结束' }, { type: 'text', text: '第 2 手结束' }])
    await opponentMemory.updateWorkingMemory({ threadId: 'x', resourceId: 'opponent:li', workingMemory: '改过' })
    await appendThreadMessage(coachMemory, 'coach:t1', 'hero', 'hi')

    await resetMemories()
    expect(await opponentMemory.getThreadById({ threadId: 'table:t1:li' })).toBeNull()
    expect(await coachMemory.getThreadById({ threadId: 'coach:t1' })).toBeNull()
    expect(await opponentMemory.getWorkingMemory({ threadId: 'x', resourceId: 'opponent:li' })).toBe(OPPONENT_WM)
    expect(await coachMemory.getWorkingMemory({ threadId: 'x', resourceId: 'hero' })).toBe(COACH_WM)
  })
})

describe('工具', () => {
  it('read_chat 把 from 换成名字，hero 为“你”', async () => {
    const { table } = makeTable()
    const requestContext = new RequestContext()
    requestContext.set('table', table)
    const out = await opponentTools.read_chat.execute!({}, { requestContext } as never)
    expect(out).toEqual([{ id: 'm1', from: '你', text: '来啊', at: 1 }])
  })

  it('hand_history 经 publicHandResult 输出，不含玩家未亮的底牌', async () => {
    const rec: HandRecord = {
      hand: 4, sb: 50, bb: 100, net: 150, pot: 300, showdown: false, hero: ['As', 'Kd'], board: ['2c', '7h', 'Td'],
      players: [
        { id: 'hero', name: '你', hole: ['As', 'Kd'], folded: false, handName: '', won: 300, net: 150 },
        { id: 'li', personaId: 'li', name: '阿狸', hole: null, folded: true, handName: '', won: 0, net: -150 }
      ],
      log: [], vpip: true, pfr: true
    }
    await db.insertHand('t1', rec)
    const requestContext = new RequestContext()
    requestContext.set('role', 'opponent')
    requestContext.set('personaId', 'li')
    const out = (await opponentTools.hand_history.execute!({ n: 99 }, { requestContext } as never)) as string[]
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('玩家赢得 300')
    expect(out[0]).toContain('你本手 −150')
    for (const f of ['As', 'Kd', 'A♠', 'K♦']) expect(out[0]).not.toContain(f)
  })

  it('越权调用按 role 拒绝：对手调教练工具、教练调对手工具都抛错且不读数据', async () => {
    const { table, viewed } = makeTable()
    const requestContext = new RequestContext()
    requestContext.set('table', table)
    requestContext.set('seat', 1)
    requestContext.set('intents', {})
    requestContext.set('role', 'opponent')
    await expect(coachTools.view_hero.execute!({}, { requestContext } as never)).rejects.toThrow()
    await expect(coachTools.recent_hands.execute!({}, { requestContext } as never)).rejects.toThrow()
    await expect(coachTools.hint.execute!({ message: 'x' }, { requestContext } as never)).rejects.toThrow()
    requestContext.set('role', 'coach')
    await expect(opponentTools.view_table.execute!({}, { requestContext } as never)).rejects.toThrow()
    await expect(opponentTools.act.execute!({ action: 'fold' }, { requestContext } as never)).rejects.toThrow()
    expect(viewed).toEqual([])
    expect(requestContext.get('intents')).toEqual({})
  })
})

describe('按 agent 分别注册工具', () => {
  it('对手 agent 调用 view_hero、recent_hands 不会执行，拿不到玩家底牌', async () => {
    const { g, table, viewed } = makeTable()
    await db.insertHand('t0', {
      hand: 1, sb: 50, bb: 100, net: 0, pot: 150, showdown: false, hero: ['As', 'Kd'], board: [],
      players: [{ id: 'hero', name: '你', hole: ['As', 'Kd'], folded: false, handName: '', won: 0, net: 0 }], log: [], vpip: false, pfr: false
    })
    script([{ tools: [{ name: 'view_hero', input: {} }, { name: 'recent_hands', input: {} }] }, { tools: [{ name: 'act', input: { action: 'fold' } }] }])
    const r = await opponentDecide(liCtx(table), never())
    expect(model.calls).toHaveLength(2)
    expect(viewed).toEqual([])
    expect(r.intents.act).toEqual({ type: 'fold', to: undefined })
    // 工具结果写进了 thread；检查其中没有玩家底牌
    const { messages } = await rt().opponentMemory.recall({ threadId: 'table:t1:li', resourceId: 'opponent:li' })
    const dump = JSON.stringify(messages)
    for (const c of [...g.players[0].hole, 'As', 'Kd']) expect(dump).not.toContain(`"${c}"`)
    expect(dump).not.toContain('玩家底牌')
  })

  it('两个 agent 各自只注册本角色的工具', async () => {
    const { opponent, coach } = rt()
    expect(Object.keys(await opponent.listTools()).sort()).toEqual(['act', 'estimate_equity', 'hand_history', 'read_chat', 'say', 'view_table'])
    expect(Object.keys(await coach.listTools()).sort()).toEqual(['estimate_equity', 'hint', 'pause_game', 'read_chat', 'recent_hands', 'view_hero'])
  })
})
