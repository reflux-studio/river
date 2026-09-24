import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import type { Memory } from '@mastra/memory'
import { COACHES } from '../../shared/personas'
import type { HandRecord } from '../../shared/types'
import { settingsCache } from '../db'
import type { resolveModel } from '../models/resolve'
import type { IntentCollector } from './intents'
import { callAgent } from './mastra'
import { coachTools } from './tools'
import { heroHandSummary, type TableQuery } from './views'

export const COACH_WM = `# 学员档案
- 水平判断：
- 常见漏洞：
- 已讲过的概念：
- 近期进步：
`

const MODE_TEXT: Record<string, string> = {
  proactive: '现在轮到玩家决策。常规决策不打扰（不调用工具）；有值得提醒的点调用 hint；关键或高代价决策调用 pause_game。',
  review: '赛后复盘，200 字内：做得好的一步、可以改进的一步、下次可用的原则。'
}

// 文案沿用原型 coachSystem()（River.dc.html 第 521–524 行）
function instructions({ requestContext }: { requestContext: RequestContext }) {
  const st = settingsCache
  const c = COACHES[st.coachPersona]
  return [
    `你是德州扑克教学 App「River」里的教练，人设：${c.n}。${c.s}`,
    '你站在玩家这一边，只知道玩家能看到的信息：绝不假装知道对手底牌，只能根据行动推测范围。',
    st.level === 'novice' ? '玩家是新手：用最简单的语言，第一次出现的术语顺带解释。' : '玩家有基础：可以使用范围、EV、弃牌率、SPR 等术语。',
    '回答用中文，可夹少量英文术语，简洁（一般不超过 120 字，除非玩家要求详细）。不要使用 markdown 标题或列表符号。',
    MODE_TEXT[requestContext.get('mode') as string]
  ]
    .filter(Boolean)
    .join('\n')
}

export function createCoachAgent(memory: Memory, model: MastraModelConfig | typeof resolveModel) {
  return new Agent({ id: 'coach', name: 'coach', instructions, model, tools: coachTools, memory })
}

export interface CoachCtx {
  tableId: string
  table: TableQuery
  guided?: boolean
}

const context = (ctx: CoachCtx, intents: IntentCollector = {}) => ({ tableId: ctx.tableId, seat: 0, table: ctx.table, intents })
const memory = (ctx: CoachCtx) => ({ thread: `coach:${ctx.tableId}`, resource: 'hero' })

export async function coachProactive(ctx: CoachCtx, signal: AbortSignal) {
  const intents: IntentCollector = {}
  const r = await callAgent('coach', 'proactive', ctx.guided ? '轮到玩家决策。这是教学牌局：每一步都至少调用 hint，并解释现在该考虑什么。' : '轮到玩家决策。', {
    context: context(ctx, intents),
    memory: memory(ctx),
    activeTools: ['view_hero', 'estimate_equity', 'read_chat', 'recent_hands', 'hint', 'pause_game', 'updateWorkingMemory'],
    maxSteps: 4,
    signal
  })
  return { ok: r.ok, intents, aborted: r.aborted, ...(r.error && { error: r.error }) }
}

export async function coachAsk(ctx: CoachCtx, question: string, onDelta: (text: string) => void, signal: AbortSignal) {
  const r = await callAgent('coach', 'ask', question, {
    context: context(ctx),
    memory: memory(ctx),
    activeTools: ['view_hero', 'estimate_equity', 'read_chat', 'recent_hands', 'updateWorkingMemory'],
    maxSteps: 6,
    signal,
    onDelta
  })
  return { ok: r.ok, text: r.text, aborted: r.aborted, ...(r.error && { error: r.error }) }
}

export async function coachReview(handId: number, rec: HandRecord, signal: AbortSignal): Promise<{ ok: boolean; text?: string; error?: string }> {
  const r = await callAgent('coach', 'review', heroHandSummary(rec), {
    context: {},
    // 复盘与教练队列并行运行；只读保证它不会覆盖 working memory，也不开放 updateWorkingMemory
    memory: { thread: `review:${handId}`, resource: 'hero', options: { readOnly: true } },
    activeTools: ['recent_hands'],
    maxSteps: 6,
    signal
  })
  if (r.ok) return { ok: true, text: r.text.trim() }
  return { ok: false, error: r.error ?? (r.aborted ? 'aborted' : 'failed') }
}
