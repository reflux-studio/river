import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../src/main/db'
import { commandHandlers } from '../src/main/ipc'
import type { TableStart } from '../src/shared/types'
import { scriptModel, type Step } from './mock-model'
import { drive, harness, seeded, setup, teardown, type Harness } from './table-helpers'

// 走真实的 Agent 与 callModel，只把模型换成替身：发给模型的 system、messages、工具定义都能收集到
let model: ReturnType<typeof scriptModel>
vi.mock('../src/main/models/resolve', async (orig) => ({
  ...(await orig<typeof import('../src/main/models/resolve')>()),
  modelFor: () => model,
  selectedModel: () => ({ kind: 'anthropic', modelId: 'm' }),
  supportsRequired: () => true,
  modelReady: () => true
}))

const { opponentAct, opponentTalk } = await import('../src/main/agents/opponent')
const { coachAsk, coachRecap, coachSpeak } = await import('../src/main/agents/coach')
const agents = { opponentAct, opponentTalk, coachAsk, coachRecap, coachSpeak }

const HAN = /\p{Script=Han}/u
const hands = (h: Harness) => h.of('hands:changed').length
const free4: TableStart = { size: 4, blinds: 1, picks: ['li', 'k', 'bai'], mode: 'free', guided: false }
const coach3: TableStart = { size: 3, blinds: 1, picks: ['li', 'zen'], mode: 'coach', guided: false }

// 随机出牌与发言；模型输出是动态内容，这里只用英文，好让断言只检查固定文字
function randomModel(rng: () => number) {
  const maybe = (s: string) => (rng() < 0.5 ? s : undefined)
  return scriptModel((call): Step => {
    if (call.tools.includes('act')) {
      const r = rng()
      const action = r < 0.15 ? 'raise' : r < 0.3 ? 'fold' : r < 0.35 ? 'allin' : r < 0.4 ? 'bet' : 'call'
      return { tools: [{ name: 'act', input: { think: 'hmm', action, to: Math.round(rng() * 2000), say: maybe('nice'), note: maybe('player calls a lot') } }] }
    }
    if (call.tools.includes('talk')) return { tools: [{ name: 'talk', input: { say: maybe('gg'), note: maybe('tilted') } }] }
    if (call.tools.includes('recap')) return { tools: [{ name: 'recap', input: { headline: 'h', good: 'g', improve: 'i', tip: 't', note: maybe('calls too wide') } }] }
    return { text: 'Looks fine.' }
  })
}

async function enTable() {
  await setup()
  await db.completeOnboarding('en')
}

async function collect(h: Harness) {
  const recs = await Promise.all((await db.listHands()).map((x) => db.getHand(x.id)))
  return [
    ...model.calls.map((c) => JSON.stringify({ system: c.system, prompt: c.prompt, tools: c.toolDefs })),
    ...h.views.map((v) => JSON.stringify(v)),
    ...h.chat.map((m) => JSON.stringify(m)),
    ...[...h.coach.values()].map((e) => JSON.stringify(e)),
    ...recs.map((r) => JSON.stringify(r))
  ]
}

afterEach(teardown)

describe('英文：发给模型与推给界面的固定文字没有汉字', () => {
  beforeEach(enTable)

  it('自由局 20 手', async () => {
    const rng = seeded(7)
    model = randomModel(rng)
    const h = await harness({ rng, agents })
    await h.runner.start(free4)
    const pick = () => (['fold', 'call', 'raise'] as const)[(rng() * 3) | 0]
    await drive(h, () => hands(h) >= 20, pick, 40000)
    const all = await collect(h)
    expect(model.calls.some((c) => c.toolDefs.some((t) => t.name === 'act' && t.description))).toBe(true)
    expect(model.calls.some((c) => c.tools.includes('talk'))).toBe(true)
    expect(h.chat.some((m) => m.sysKind === 'rebuy')).toBe(true)
    expect(all.filter((s) => HAN.test(s))).toEqual([])
  }, 60_000)

  it('教练局 20 手（含提问）', async () => {
    const rng = seeded(11)
    model = randomModel(rng)
    const h = await harness({ rng, agents })
    await h.runner.start(coach3)
    let asked = 0
    const pick = () => {
      if (asked < 5 && rng() < 0.2) (asked++, h.runner.ask('What should I do?'))
      return (['fold', 'call', 'raise'] as const)[(rng() * 3) | 0]
    }
    await drive(h, () => hands(h) >= 20, pick, 40000)
    const all = await collect(h)
    expect(asked).toBeGreaterThan(0)
    expect(model.calls.some((c) => c.tools.includes('recap'))).toBe(true)
    expect(all.filter((s) => HAN.test(s))).toEqual([])
  }, 60_000)
})

describe('英文 newChat', () => {
  beforeEach(enTable)

  it('“Hand N” 分隔与重新买入消息仍交给 Agent', async () => {
    const seen: string[] = []
    const h = await harness({
      agents: {
        opponentAct: async (i) => (seen.push(i.messages.at(-1)!.content as string), { ok: true, aborted: false, text: '', args: { action: 'allin' } }),
        opponentTalk: async () => ({ ok: true, aborted: false, text: '', args: { say: 'gg' } })
      }
    })
    await h.runner.start({ size: 3, blinds: 1, picks: ['li', 'k'], mode: 'free', guided: false })
    await drive(h, () => hands(h) >= 6 && h.chat.some((m) => m.sysKind === 'rebuy'), () => 'call')
    await drive(h, () => seen.some((s) => /System: .* rebought /.test(s)), () => 'call')
    expect(seen.some((s) => /System: Hand \d+ · Preflop/.test(s))).toBe(true)
  })
})

describe('牌局中途在设置页切换语言', () => {
  beforeEach(enTable)

  it('下一次模型调用的 system 换成新语言', async () => {
    model = scriptModel(() => ({ tools: [{ name: 'act', input: { think: 'hmm', action: 'call' } }] }))
    const h = await harness({ agents })
    await h.runner.start(free4)
    await drive(h, () => model.calls.length >= 1)
    const before = model.calls.length
    await commandHandlers(h.runner)['settings.update']({ locale: 'zh' })
    await drive(h, () => model.calls.length > before)
    expect(model.calls[before - 1].system).toMatch(/Reply in English\.$/)
    expect(model.calls[before].system).toMatch(/请用中文回复。$/)
  })
})
