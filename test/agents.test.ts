import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scriptModel, type Step } from './mock-model'

let model: ReturnType<typeof scriptModel>
vi.mock('../src/main/models/resolve', () => ({
  modelFor: () => model,
  selectedModel: () => ({ kind: 'anthropic', modelId: 'm' }),
  supportsRequired: () => true
}))

const { setUsageListener } = await import('../src/main/agents/llm')
const { opponentAct, opponentTalk } = await import('../src/main/agents/opponent')
const { coachAsk, coachRecap, coachSpeak } = await import('../src/main/agents/coach')
const { Thread } = await import('../src/main/agents/thread')

const use = (steps: Step[]) => (model = scriptModel(steps))
const signal = () => new AbortController().signal
const usage: unknown[] = []
const input = { name: '阿狸', prompt: '你是阿狸', memory: ['老K 很紧'], messages: [{ role: 'user' as const, content: '轮到你' }], tag: { tableId: 't1', handNo: 3 } }

beforeEach(() => {
  usage.length = 0
  setUsageListener((u) => void usage.push(u))
})
afterEach(() => vi.useRealTimers())

describe('历史', () => {
  it('tool-call 与 tool-result 原样传给模型', async () => {
    use([{ tools: [{ name: 'talk', input: {} }] }])
    const th = new Thread()
    th.messagesFor(1, '局面1')
    th.pushTool(1, '局面1', 'act', { action: 'call' }, { 实际: '跟注 100' }, 'd')
    await opponentTalk({ ...input, messages: th.messagesFor(1, '说句话') }, signal())
    const prompt = model.calls[0].prompt as { role: string; content: { type: string }[] }[]
    expect(prompt.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'user'])
    expect(prompt[1].content[0].type).toBe('tool-call')
    expect(prompt[2].content[0].type).toBe('tool-result')
    expect(model.calls[0].tools).toEqual(['talk'])
  })
})

describe('历史（本次不带工具）', () => {
  it('教练提问不注册工具时，历史里的 recap tool-call 仍原样传给模型', async () => {
    use([{ text: '好' }])
    const th = new Thread()
    th.messagesFor(1, '复盘')
    th.pushTool(1, '复盘', 'recap', { headline: 'x' }, { ok: true }, 'd')
    await coachAsk({ memory: [], tag: null, messages: th.messagesFor(1, '为什么') }, () => {}, signal())
    const prompt = model.calls[0].prompt as { role: string; content: { type: string }[] }[]
    expect(model.calls[0].tools).toEqual([])
    expect(prompt.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'user'])
    expect(prompt[1].content[0].type).toBe('tool-call')
  })
})

describe('对手 talk', () => {
  it('只带 talk 工具、不重试，用量记为 talk；系统提示允许口嗨嘴硬', async () => {
    use([{ error: 'boom' }, { tools: [{ name: 'talk', input: { say: '运气而已' } }] }])
    const r = await opponentTalk(input, signal())
    expect(r.ok).toBe(false)
    expect(model.calls).toHaveLength(1)
    expect(model.calls[0].tools).toEqual(['talk'])
    expect(model.calls[0].system).toContain('嘴硬')
    expect((usage[0] as { purpose: string }).purpose).toBe('talk')
  })
})

describe('对手 act', () => {
  it('一次调用：只带 act 工具、强制调用，印象写进系统提示', async () => {
    use([{ tools: [{ name: 'act', input: { action: 'raise', to: 300, say: '加点料', note: '老K 在诈唬' } }] }])
    const r = await opponentAct(input, signal())
    expect(r.ok).toBe(true)
    expect(r.args).toEqual({ action: 'raise', to: 300, say: '加点料', note: '老K 在诈唬' })
    expect(model.calls).toHaveLength(1)
    expect(model.calls[0].tools).toEqual(['act'])
    expect(model.calls[0].toolChoice).toEqual({ type: 'required' })
    expect(model.calls[0].system).toContain('老K 很紧')
    expect(usage).toEqual([{ purpose: 'decide', providerKind: 'anthropic', modelId: 'm', input: 1, output: 1, cached: null, tableId: 't1', handNo: 3 }])
  })

  it('schema 宽松：action 写成 bet、to 写成字符串也能拿到参数', async () => {
    use([{ tools: [{ name: 'act', input: { action: 'bet', to: '300' } }] }])
    expect((await opponentAct(input, signal())).args).toEqual({ action: 'bet', to: '300' })
  })

  it('没调用工具：ok 但没有参数', async () => {
    use([{ text: '我跟' }])
    const r = await opponentAct(input, signal())
    expect(r.ok).toBe(true)
    expect(r.args).toBeUndefined()
  })

  it('Mastra 自带重试：两次失败后第三次成功（maxRetries 2）', async () => {
    use([{ error: 'ECONNRESET' }, { error: 'fetch failed' }, { tools: [{ name: 'act', input: { action: 'call' } }] }])
    const r = await opponentAct(input, signal())
    expect(model.calls).toHaveLength(3)
    expect(r.ok).toBe(true)
    expect(r.args).toEqual({ action: 'call' })
  }, 15_000)

  it('三次都失败：返回错误', async () => {
    use([{ error: 'boom' }, { error: 'boom' }, { error: 'boom' }])
    const r = await opponentAct(input, signal())
    expect(model.calls).toHaveLength(3)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('boom')
  }, 15_000)

  it('被中止：aborted，用量按未知记', async () => {
    use([{ delayMs: 5000, tools: [{ name: 'act', input: { action: 'call' } }] }])
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 50)
    const r = await opponentAct(input, ctrl.signal)
    expect(r.ok).toBe(false)
    expect(r.aborted).toBe(true)
    expect(usage.at(-1)).toMatchObject({ input: null, output: null })
  })
})

describe('教练', () => {
  it('speak 流式输出，不带工具', async () => {
    use([{ text: '先看底池赔率' }])
    const deltas: string[] = []
    const r = await coachSpeak({ memory: [], tag: null, messages: [{ role: 'user', content: '局面' }] }, (d) => void deltas.push(d), signal())
    expect(r.ok).toBe(true)
    expect(deltas.join('')).toBe('先看底池赔率')
    expect(model.calls[0].tools).toEqual([])
    expect(usage.at(-1)).toMatchObject({ purpose: 'speak' })
  })

  it('三种调用共用一份 system，提到三种时刻', async () => {
    use([{ text: 'a' }, { text: 'b' }, { tools: [{ name: 'recap', input: { headline: 'h', good: 'g', improve: 'i', tip: 't' } }] }])
    const messages = [{ role: 'user' as const, content: 'x' }]
    await coachSpeak({ memory: ['爱跟注'], tag: null, messages }, () => {}, signal())
    await coachAsk({ memory: ['爱跟注'], tag: null, messages }, () => {}, signal())
    await coachRecap({ memory: ['爱跟注'], tag: null, messages }, signal())
    const systems = model.calls.map((c) => c.system)
    expect(new Set(systems).size).toBe(1)
    expect(systems[0]).toContain('结合对手在最近几手表现出的倾向')
    expect(systems[0]).toContain('爱跟注')
  })

  it('recap 调用工具给出四段；不调用工具算失败', async () => {
    use([{ tools: [{ name: 'recap', input: { headline: 'h', good: 'g', improve: 'i', tip: 't', note: '爱跟注' } }] }])
    const r = await coachRecap({ memory: [], tag: null, messages: [{ role: 'user', content: '第 1 手' }] }, signal())
    expect(r.ok).toBe(true)
    expect(r.args).toMatchObject({ headline: 'h', note: '爱跟注' })
    use([{ text: '这手打得不错' }])
    expect((await coachRecap({ memory: [], tag: null, messages: [{ role: 'user', content: '第 1 手' }] }, signal())).ok).toBe(false)
  })
})
