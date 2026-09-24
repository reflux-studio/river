import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import type { Memory } from '@mastra/memory'
import { PERSONAS } from '../../shared/personas'
import { getPromptOverrides } from '../db'
import { supportsRequired, type resolveModel } from '../models/resolve'
import type { IntentCollector } from './intents'
import { callAgent } from './mastra'
import { opponentTools } from './tools'
import type { TableQuery } from './views'

export const OPPONENT_WM = `# 牌桌印象
## 玩家「你」
- 入池倾向：
- 诈唬倾向：
- 被我抓过的诈唬 / 诈唬过我的次数：
- 其他观察：
## 其他角色
- （角色名）：
## 我现在的状态
- 心情：
- 最近输赢：
`

const MODE_TEXT: Record<string, string> = {
  decide:
    '先用 view_table 了解局面、用 read_chat 看最近公屏，再调用 act。想说话就调用 say，必须声明 kind：自己起的话题用 free，回应别人用 reply 并带上 reply_to。需要更新对某人的印象或自己的心情时，与 act 在同一步调用 updateWorkingMemory。',
  chat: '公屏有人说话，你可以回应也可以不说；想回应就调用 say。',
  win: '你赢了这一手，可以说一句。'
}

const talkText = (talk: number) => (talk < 0.2 ? '你话很少，大多数时候不说话。' : talk < 0.5 ? '你偶尔说话。' : '你爱说话。')

async function instructions({ requestContext }: { requestContext: RequestContext }) {
  const pid = requestContext.get('personaId') as string
  const p = PERSONAS.find((x) => x.id === pid)!
  const prompt = (await getPromptOverrides())[pid] ?? p.prompt
  return [
    `你在一张 PvE 娱乐德州扑克桌上扮演「${p.name}」。按人设决策，但别做明显送钱的离谱决定。`,
    prompt + talkText(p.talk),
    '发言不超过 20 字，中文口语；绝不透露或暗示自己的底牌：不得出现牌面点数（A、K、Q、J、数字）、花色或“对子/口袋”等描述自己手牌的词。',
    MODE_TEXT[requestContext.get('mode') as string]
  ].join('\n')
}

export function createOpponentAgent(memory: Memory, model: MastraModelConfig | typeof resolveModel) {
  return new Agent({ id: 'opponent', name: 'opponent', instructions, model, tools: opponentTools, memory })
}

export interface OpponentCtx {
  tableId: string
  seat: number
  personaId: string
  table: TableQuery
}

export interface OpponentResult {
  ok: boolean
  intents: IntentCollector
  aborted: boolean
  error?: string
}

const CHAT_TOOLS = ['read_chat', 'hand_history', 'say', 'updateWorkingMemory'] as const

async function call(ctx: OpponentCtx, mode: 'decide' | 'chat' | 'win', input: string, signal: AbortSignal): Promise<OpponentResult> {
  const intents: IntentCollector = {}
  const decide = mode === 'decide'
  const r = await callAgent('opponent', mode, input, {
    context: { tableId: ctx.tableId, seat: ctx.seat, personaId: ctx.personaId, table: ctx.table, intents },
    memory: { thread: `table:${ctx.tableId}:${ctx.personaId}`, resource: `opponent:${ctx.personaId}` },
    activeTools: decide ? ['view_table', 'estimate_equity', 'read_chat', 'hand_history', 'say', 'act', 'updateWorkingMemory'] : [...CHAT_TOOLS],
    toolChoice: decide && supportsRequired('opponent') ? 'required' : 'auto',
    maxSteps: decide ? 6 : 3,
    // act 所在的那一步结束即停：同一步里的 say、updateWorkingMemory 会执行完
    ...(decide && { stopWhen: ({ steps }) => steps.at(-1)?.toolCalls?.some((c) => c.toolName === 'act') ?? false }),
    signal
  })
  return { ok: r.ok, intents, aborted: r.aborted, ...(r.error && { error: r.error }) }
}

export const opponentDecide = (ctx: OpponentCtx, signal: AbortSignal) => call(ctx, 'decide', '轮到你行动。', signal)

export const opponentChat = (ctx: OpponentCtx, mode: 'chat' | 'win', input: string, signal: AbortSignal) => call(ctx, mode, input, signal)
