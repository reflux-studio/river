// 工具只读局面或写意图，不改牌局；身份一律取自 requestContext，模型无法借参数看到别的座位
import { createTool } from '@mastra/core/tools'
import type { RequestContext } from '@mastra/core/request-context'
import { z } from 'zod'
import { personaOf } from '../../shared/personas'
import { handsForPersona, recentHands } from '../db'
import { recordIntent, type IntentCollector } from './intents'
import { heroHandSummary, publicHandResult, type TableQuery } from './views'

type Ctx = { requestContext?: RequestContext }
const get = <T>(ctx: Ctx, key: string) => ctx.requestContext!.get(key) as T
const table = (ctx: Ctx) => get<TableQuery>(ctx, 'table')
const intents = (ctx: Ctx) => get<IntentCollector>(ctx, 'intents')
const clamp = (n: number | undefined, def: number, max: number) => Math.max(1, Math.min(max, Math.floor(n ?? def)))
const speaker = (from?: string) => (from === 'hero' ? '你' : (personaOf(from)?.name ?? '系统'))

const noInput = z.object({})

// 纵深防御：工具已按 agent 分别注册，这里再按 role 拒绝越权调用，
// 不依赖 Mastra 对 activeTools 的运行时过滤（库的实现细节，升级可能变化）
function allow(ctx: Ctx, role: 'opponent' | 'coach') {
  if (get<string>(ctx, 'role') !== role) throw new Error('tool not available for this role')
}

const all = {
  view_table: createTool({
    id: 'view_table',
    description: '查看当前牌局：阶段、盲注、你的底牌、公共牌、底池、需跟注、可选行动与加注范围、各玩家状态、本手行动记录',
    inputSchema: noInput,
    execute: async (_, ctx) => {
      allow(ctx, 'opponent')
      return table(ctx).viewFor(get<number>(ctx, 'seat'))
    }
  }),
  view_hero: createTool({
    id: 'view_hero',
    description: '查看玩家视角的当前牌局：玩家底牌、公共牌、底池、需跟注、可选行动、各对手公开状态、本手行动记录',
    inputSchema: noInput,
    execute: async (_, ctx) => {
      allow(ctx, 'coach')
      return table(ctx).viewFor(0)
    }
  }),
  estimate_equity: createTool({
    id: 'estimate_equity',
    description: '估算当前手牌对在手对手随机手牌的胜率，并给出所需胜率、出路、当前牌型',
    inputSchema: noInput,
    execute: async (_, ctx) => {
      const coach = get<string>(ctx, 'role') === 'coach'
      return table(ctx).equityFor(get<number>(ctx, 'seat'), coach ? 400 : 200)
    }
  }),
  read_chat: createTool({
    id: 'read_chat',
    description: '读取本桌公屏最近的消息；from 为发言者名字，“你”指玩家',
    inputSchema: z.object({ limit: z.number().optional() }),
    execute: async ({ limit }, ctx) =>
      table(ctx)
        .chat(clamp(limit, 12, 50))
        .map((m) => ({ id: m.id, from: speaker(m.from), text: [m.act, m.text].filter(Boolean).join('，'), at: m.at }))
  }),
  hand_history: createTool({
    id: 'hand_history',
    description: '你在座的最近几手的公开结果：摊牌亮出的牌、赢家与金额、你的盈亏',
    inputSchema: z.object({ n: z.number().optional() }),
    execute: async ({ n }, ctx) => {
      allow(ctx, 'opponent')
      const pid = get<string>(ctx, 'personaId')
      return (await handsForPersona(pid, clamp(n, 3, 10))).map((r) => publicHandResult(r, pid))
    }
  }),
  recent_hands: createTool({
    id: 'recent_hands',
    description: '玩家最近几手的记录摘要：底牌、公共牌、行动、结果、摊牌',
    inputSchema: z.object({ n: z.number().optional() }),
    execute: async ({ n }, ctx) => {
      allow(ctx, 'coach')
      return (await recentHands(clamp(n, 5, 20))).map(heroHandSummary)
    }
  }),
  say: createTool({
    id: 'say',
    description: '在公屏说一句话。kind：自己起的话题用 free，回应别人用 reply 并带上 reply_to（所回应消息的 id）',
    inputSchema: z.object({ text: z.string(), kind: z.enum(['free', 'reply']), reply_to: z.string().optional() }),
    execute: async ({ text, kind, reply_to }, ctx) => {
      allow(ctx, 'opponent')
      recordIntent(intents(ctx), 'say', { text, kind, replyTo: reply_to })
      return { ok: true }
    }
  }),
  act: createTool({
    id: 'act',
    description: '做出本次行动。raise 时 to 为加注到的总额',
    inputSchema: z.object({ action: z.enum(['fold', 'check', 'call', 'raise']), to: z.number().optional() }),
    execute: async ({ action, to }, ctx) => {
      allow(ctx, 'opponent')
      recordIntent(intents(ctx), 'act', { type: action, to })
      return { ok: true }
    }
  }),
  hint: createTool({
    id: 'hint',
    description: '给玩家一句提醒，不打断牌局',
    inputSchema: z.object({ message: z.string() }),
    execute: async ({ message }, ctx) => {
      allow(ctx, 'coach')
      recordIntent(intents(ctx), 'hint', message)
      return { ok: true }
    }
  }),
  pause_game: createTool({
    id: 'pause_game',
    description: '关键或高代价决策：暂停牌局并提醒玩家先想清楚',
    inputSchema: z.object({ message: z.string() }),
    execute: async ({ message }, ctx) => {
      allow(ctx, 'coach')
      recordIntent(intents(ctx), 'pause', message)
      return { ok: true }
    }
  })
}

const { view_table, view_hero, estimate_equity, read_chat, hand_history, recent_hands, say, act, hint, pause_game } = all
export const opponentTools = { view_table, estimate_equity, read_chat, hand_history, say, act }
export const coachTools = { view_hero, estimate_equity, read_chat, recent_hands, hint, pause_game }

export type ToolName = keyof typeof all | 'updateWorkingMemory'
