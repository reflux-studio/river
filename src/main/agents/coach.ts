import { z } from 'zod'
import { COACHES } from '../../shared/personas'
import type { Recap } from '../../shared/types'
import { settingsCache } from '../db'
import { callModel, type CallResult, type Msg, type UsageTag } from './llm'

export interface CoachBase {
  // 学员档案：复盘时记下的要点
  memory: string[]
  tag: UsageTag
}

// 讲解、提问、复盘共用一份 system；各自的要求写在当次 user 消息里（ADR-006）
function system(memory: string[]) {
  const st = settingsCache
  const c = COACHES[st.coachPersona]
  return [
    `你是德州扑克教学 App「River」里的教练，人设：${c.n}。${c.s}`,
    '你站在玩家这一边，只知道玩家能看到的信息：绝不假装知道对手底牌，只能根据行动推测范围。',
    st.level === 'novice' ? '玩家是新手：用最简单的语言，第一次出现的术语顺带解释。' : '玩家有基础：可以使用范围、EV、弃牌率、SPR 等术语。',
    '回答用中文，可夹少量英文术语，简洁。提到具体的牌时用「A♠」这种写法。不要使用 markdown 标题或列表符号。',
    '你会在三种时刻收到消息：轮到玩家决策时（请讲解）、玩家提问时（请回答）、一手结束后（请调用 recap 复盘，结合对手在最近几手表现出的倾向来评价玩家的决策，只看决策质量，不以结果论英雄）。',
    memory.length ? `学员档案（你之前复盘时记下的）：\n${memory.map((m) => '- ' + m).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

// 讲解、提问、复盘各自的要求（runner 拼进当次 user 观察）
export const COACH_ASKS = {
  guided: '现在轮到玩家决策。这是教学牌局：说说局面、现在该考虑什么、你的建议，并解释用到的概念，150 字以内。',
  plain: '现在轮到玩家决策。说说局面和你的建议，抓住最关键的一两点，80 字以内。',
  ask: '回答一般不超过 150 字，除非玩家要求详细。',
  recap: '这一手结束了，调用 recap 复盘；不论输赢都要复盘。'
}

// 轮到玩家时教练先说（A8：每步都说，不再判断是否沉默）
export function coachSpeak(o: CoachBase & { messages: Msg[] }, onDelta: (t: string) => void, signal: AbortSignal) {
  return callModel({ role: 'coach', purpose: 'speak', system: system(o.memory), messages: o.messages, onDelta, maxRetries: 1, timeoutMs: 20_000, signal, tag: o.tag })
}

export function coachAsk(o: CoachBase & { messages: Msg[] }, onDelta: (t: string) => void, signal: AbortSignal) {
  return callModel({ role: 'coach', purpose: 'ask', system: system(o.memory), messages: o.messages, onDelta, maxRetries: 2, timeoutMs: 45_000, signal, tag: o.tag })
}

const recap = {
  name: 'recap',
  description: '给出这一手的复盘',
  schema: z.object({
    headline: z.string().describe('一句话总结这手牌，28 字以内'),
    good: z.string().describe('做得好的一步，50 字以内'),
    improve: z.string().describe('可以改进的一步；都没问题就说下一次可以更进一步的地方，50 字以内'),
    tip: z.string().describe('一条下次可用的原则，30 字以内'),
    note: z.string().optional().describe('值得记进学员档案的一条观察（例如反复出现的漏洞），没有留空')
  })
}

export async function coachRecap(o: CoachBase & { messages: Msg[] }, signal: AbortSignal): Promise<CallResult<Recap & { note?: string }>> {
  const r = await callModel({
    role: 'coach',
    purpose: 'recap',
    system: system(o.memory),
    messages: o.messages,
    tool: recap,
    maxRetries: 2,
    timeoutMs: 45_000,
    signal,
    tag: o.tag
  })
  // 没调用工具等同失败：复盘卡需要四段内容
  return r.ok && !r.args ? { ...r, ok: false, error: '教练没有给出复盘' } : r
}
