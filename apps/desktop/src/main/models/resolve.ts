import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { dict } from '@river/i18n'
import { getProviderSecret, providersCache, setSupportsRequired, settingsCache, type ProviderRow } from '../db'

export type Role = 'opponent' | 'coach'

// 解密失败只在内存里标记：钥匙串恢复或重新输入 key 后即可用，不值得落库
export const needsKey = new Set<string>()
export const clearNeedsKey = (providerId: string) => needsKey.delete(providerId)

function secretOf(p: ProviderRow): string | undefined {
  try {
    return getProviderSecret(p.id)
  } catch (e) {
    needsKey.add(p.id)
    throw e
  }
}

function configFor(p: ProviderRow, modelId: string, apiKey: string | undefined): MastraModelConfig {
  // 内置提供方不能带 url：带 url 时 Mastra 改走 OpenAI 兼容协议
  return p.kind === 'openai-compatible'
    ? { providerId: p.id, modelId, url: p.baseUrl, apiKey }
    : { id: `${p.kind}/${modelId}`, apiKey }
}

function selected(role: Role) {
  const sel = settingsCache.models[role]
  const p = sel && providersCache.get(sel.providerId)
  return sel && p ? { sel, p } : undefined
}

// 每次调用时读最新设置：牌局停下后去设置页换了模型，重试即用新模型
export function modelFor(role: Role): MastraModelConfig {
  const s = selected(role)
  if (!s) throw new Error('model not configured')
  return configFor(s.p, s.sel.modelId, secretOf(s.p))
}

// 用量记账与查价用：提供方类型 + 模型 id
export function selectedModel(role: Role) {
  const s = selected(role)
  return s && { kind: s.p.kind, modelId: s.sel.modelId }
}

// 未配置、提供方已删除、解密失败都按“未配置”处理：入座前检查，牌局中直接停下并提示去设置
export function modelReady(role: Role): boolean {
  const s = selected(role)
  if (!s || needsKey.has(s.p.id)) return false
  try {
    secretOf(s.p)
    return true
  } catch {
    return false
  }
}

// 决策模式的 toolChoice：只有测试连接明确失败过的提供方才退回 auto
export function supportsRequired(role: Role): boolean {
  return selected(role)?.p.supportsRequired !== false
}

const TEST_TIMEOUT_MS = 20_000

const ping = () =>
  createTool({
    id: 'ping',
    description: dict(settingsCache.locale).prompt.ping.description,
    inputSchema: z.object({}),
    execute: async () => ({ ok: true })
  })

export async function testProvider(providerId: string, modelId: string): Promise<{ ok: boolean; supportsRequired?: boolean; error?: string }> {
  const d = dict(settingsCache.locale)
  const p = providersCache.get(providerId)
  if (!p) return { ok: false, error: d.desktop.error.noProvider }
  let apiKey: string | undefined
  try {
    apiKey = secretOf(p)
  } catch {
    return { ok: false, error: d.desktop.error.cantDecrypt }
  }
  const agent = new Agent({ id: 'provider-test', name: 'provider-test', instructions: d.prompt.ping.instructions, model: configFor(p, modelId, apiKey), tools: { ping: ping() } })
  const attempt = async (toolChoice: 'required' | 'auto') => {
    try {
      const r = await agent.generate('ping', { toolChoice, maxSteps: 1, abortSignal: AbortSignal.timeout(TEST_TIMEOUT_MS) })
      if (r.finishReason === 'aborted') return d.desktop.error.connectTimeout
      return r.error ? String((r.error as Error).message ?? r.error) : undefined
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }
  const { kind, baseUrl } = p
  let supports = true
  let error = await attempt('required')
  if (error) {
    // 拒绝原因无法可靠区分，auto 能通就当作是 required 不被支持
    supports = false
    error = await attempt('auto')
  }
  if (error) return { ok: false, error }
  // 测试期间提供方可能被删或改了端点：旧端点的结论不能写到新端点上
  const now = providersCache.get(providerId)
  if (now && now.kind === kind && now.baseUrl === baseUrl) await setSupportsRequired(providerId, supports)
  return { ok: true, supportsRequired: supports }
}
