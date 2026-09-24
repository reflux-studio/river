// 所有模型调用的唯一入口：每次调用新建一个无记忆、无存储的 Agent（ADR-004），只带本次需要的工具。
// 重试用 Mastra 自带的模型调用重试：Agent 不显式设置 maxRetries 时为 0，不会重试（reviews/design-2.md F1）。
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import type { z } from 'zod'
import type { Purpose } from '../../shared/types'
import { modelFor, selectedModel, supportsRequired, type Role } from '../models/resolve'

export interface Usage {
  purpose: Purpose
  providerKind: string | null
  modelId: string | null
  input: number | null
  output: number | null
  cached: number | null
  tableId: string | null
  handNo: number | null
}

// 用量归属在发起调用时确定：回放页复盘、离桌时被中止的调用都不会记到当前牌桌（reviews/T2-T5-1.md F3）
export type UsageTag = { tableId: string; handNo: number } | null

let onUsage: (u: Usage) => void = () => {}
export const setUsageListener = (fn: (u: Usage) => void) => void (onUsage = fn)
// 测试替身模拟一次调用产生的用量
export const reportUsage = (u: Usage) => onUsage(u)

export interface Msg {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolSpec<S extends z.ZodTypeAny> {
  name: string
  description: string
  schema: S
}

export interface CallOpts<S extends z.ZodTypeAny> {
  role: Role
  purpose: Purpose
  system: string
  messages: Msg[]
  // 提供时强制（或按提供方能力自动）调用这一个工具，取第一次调用的参数
  tool?: ToolSpec<S>
  onDelta?: (text: string) => void
  maxRetries: number
  timeoutMs: number
  signal: AbortSignal
  tag: UsageTag
}

export interface CallResult<T> {
  ok: boolean
  aborted: boolean
  text: string
  args?: T
  error?: string
}

export async function callModel<S extends z.ZodTypeAny>(o: CallOpts<S>): Promise<CallResult<z.infer<S>>> {
  const sel = selectedModel(o.role)
  let args: z.infer<S> | undefined
  const tools = o.tool
    ? {
        [o.tool.name]: createTool({
          id: o.tool.name,
          description: o.tool.description,
          inputSchema: o.tool.schema,
          execute: async (input) => {
            args ??= input as z.infer<S>
            return { ok: true }
          }
        })
      }
    : undefined
  const signal = AbortSignal.any([o.signal, AbortSignal.timeout(o.timeoutMs)])
  let text = ''
  let error: unknown
  let finishReason: string | undefined
  let usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number } | undefined
  try {
    const agent = new Agent({ id: o.purpose, name: o.purpose, instructions: o.system, model: modelFor(o.role), maxRetries: o.maxRetries, ...(tools && { tools }) })
    // 按角色拆成判别联合，Mastra 的消息类型才能接受
    const messages = o.messages.map((m) => (m.role === 'user' ? { role: 'user' as const, content: m.content } : { role: 'assistant' as const, content: m.content }))
    const options = {
      maxSteps: 1,
      abortSignal: signal,
      ...(tools && { toolChoice: supportsRequired(o.role) ? ('required' as const) : ('auto' as const) })
    }
    if (o.onDelta) {
      const out = await agent.stream(messages, options)
      for await (const d of out.textStream) {
        text += d
        o.onDelta(d)
      }
      finishReason = await out.finishReason
      error = out.error
      usage = await out.totalUsage
    } else {
      const res = await agent.generate(messages, options)
      text = res.text
      finishReason = res.finishReason
      error = res.error
      usage = res.totalUsage
    }
  } catch (e) {
    error = e
  }
  // 被中止的调用返回 finishReason 'aborted' 而不抛错；超时也表现为中止
  const aborted = signal.aborted || finishReason === 'aborted'
  const timedOut = aborted && !o.signal.aborted
  onUsage({
    purpose: o.purpose,
    providerKind: sel?.kind ?? null,
    modelId: sel?.modelId ?? null,
    // 中止时 Mastra 可能给出 0：按未知处理
    input: aborted ? null : (usage?.inputTokens ?? null),
    output: aborted ? null : (usage?.outputTokens ?? null),
    cached: aborted ? null : (usage?.cachedInputTokens ?? null),
    tableId: o.tag?.tableId ?? null,
    handNo: o.tag?.handNo ?? null
  })
  const ok = !aborted && !error
  const msg = timedOut ? '调用超时' : error != null ? errorText(error) : undefined
  return { ok, aborted: aborted && !timedOut, text, ...(args !== undefined && { args }), ...(msg && { error: msg }) }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e))
