import { randomUUID } from 'node:crypto'
import { Mastra } from '@mastra/core'
import type { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { MastraMemory } from '@mastra/core/memory'
import { RequestContext } from '@mastra/core/request-context'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { PERSONAS } from '../../shared/personas'
import { settingsCache } from '../db'
import { resolveModel, type Role } from '../models/resolve'
import { COACH_WM, createCoachAgent } from './coach'
import { createOpponentAgent, OPPONENT_WM } from './opponent'
import type { ToolName } from './tools'

export type Mode = 'decide' | 'chat' | 'win' | 'proactive' | 'ask' | 'review'

// 超时由调用方（T5）用计时器 abort，这里只给出各模式的时限
export const MODE_TIMEOUT_MS: Record<Mode, number> = { decide: 10_000, chat: 8_000, win: 8_000, proactive: 12_000, ask: 30_000, review: 45_000 }

export type OnCall = (e: { role: Role; modelId: string; ms: number; ok: boolean }) => void
type ModelArg = MastraModelConfig | typeof resolveModel

interface Runtime {
  storage: LibSQLStore
  mastra: Mastra
  opponentMemory: Memory
  coachMemory: Memory
  opponent: Agent
  coach: Agent
  onCall?: OnCall
}

let runtime: Runtime | null = null

export function rt(): Runtime {
  if (!runtime) throw new Error('mastra not initialized')
  return runtime
}

// 必须在 initDb 成功之后调用（见 T3 启动顺序）。model 仅供测试注入 mock。
export async function initMastra(opts: { url: string; onCall?: OnCall; model?: ModelArg }) {
  // 自建 client，不能与业务层共用：业务层遇 BUSY 会关闭重建自己的 client（evidence/T3/r3-busy.md）
  const storage = new LibSQLStore({ id: 'river', url: opts.url })
  await storage.init()
  // 显式传入 storage：TableRunner 直接写 thread 时用这两个实例，不依赖 agent 首次调用时的注入
  const memory = (template: string) =>
    new Memory({ storage, options: { lastMessages: 40, workingMemory: { enabled: true, scope: 'resource', template } } })
  const opponentMemory = memory(OPPONENT_WM)
  const coachMemory = memory(COACH_WM)
  const model = opts.model ?? resolveModel
  const opponent = createOpponentAgent(opponentMemory, model)
  const coach = createCoachAgent(coachMemory, model)
  const mastra = new Mastra({ agents: { opponent, coach }, storage })
  runtime = { storage, mastra, opponentMemory, coachMemory, opponent, coach, onCall: opts.onCall }
  return runtime
}

export async function closeMastra() {
  await runtime?.storage.close()
  runtime = null
}

export interface CallResult {
  ok: boolean
  aborted: boolean
  text: string
  error?: string
}

type StopWhen = (o: { steps: { toolCalls?: { toolName: string }[] }[] }) => boolean

export async function callAgent(
  role: Role,
  mode: Mode,
  input: string,
  o: {
    context: Record<string, unknown>
    memory: { thread: string; resource: string; options?: { readOnly: boolean } }
    activeTools: ToolName[]
    toolChoice?: 'auto' | 'required'
    maxSteps: number
    stopWhen?: StopWhen
    signal: AbortSignal
    onDelta?: (text: string) => void
  }
): Promise<CallResult> {
  const r = rt()
  const agent = role === 'opponent' ? r.opponent : r.coach
  const requestContext = new RequestContext()
  requestContext.set('role', role)
  requestContext.set('mode', mode)
  for (const [k, v] of Object.entries(o.context)) requestContext.set(k, v)
  const options = {
    requestContext,
    // 带 Memory 的 agent 被中止时也要保存消息，缺 thread 会报 “Thread ID is required”
    memory: o.memory,
    activeTools: o.activeTools,
    toolChoice: o.toolChoice ?? 'auto',
    maxSteps: o.maxSteps,
    abortSignal: o.signal,
    ...(o.stopWhen && { stopWhen: o.stopWhen as never })
  }
  const start = Date.now()
  let text = ''
  let finishReason: string | undefined
  let error: unknown
  try {
    if (o.onDelta) {
      const out = await agent.stream(input, options)
      for await (const d of out.textStream) {
        text += d
        o.onDelta(d)
      }
      finishReason = await out.finishReason
      error = out.error
    } else {
      const res = await agent.generate(input, options)
      text = res.text
      finishReason = res.finishReason
      error = res.error
    }
  } catch (e) {
    error = e
  }
  // 被中止的 generate 返回 finishReason 'aborted' 而不抛错
  const aborted = o.signal.aborted || finishReason === 'aborted'
  const ok = !aborted && !error
  r.onCall?.({ role, modelId: settingsCache.models[role]?.modelId ?? '', ms: Date.now() - start, ok })
  return { ok, aborted, text, ...(error !== undefined && error !== null && { error: errorText(error) }) }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e))

export async function appendThreadMessage(memory: MastraMemory, threadId: string, resourceId: string, text: string) {
  if (!(await memory.getThreadById({ threadId }))) await memory.createThread({ threadId, resourceId })
  await memory.saveMessages({
    messages: [{ id: randomUUID(), role: 'user', createdAt: new Date(), threadId, resourceId, content: { format: 2, parts: [{ type: 'text', text }] } }]
  })
}

export async function resetMemories() {
  const { opponentMemory, coachMemory } = rt()
  const targets: [Memory, string, string][] = [
    ...PERSONAS.map((p): [Memory, string, string] => [opponentMemory, `opponent:${p.id}`, OPPONENT_WM]),
    [coachMemory, 'hero', COACH_WM]
  ]
  for (const [memory, resourceId, template] of targets) {
    const { threads } = await memory.listThreads({ filter: { resourceId }, perPage: false })
    for (const t of threads) await memory.deleteThread(t.id)
    // resource 作用域的 working memory 不依附 thread，threadId 只是必填占位
    await memory.updateWorkingMemory({ threadId: 'reset', resourceId, workingMemory: template })
  }
}
