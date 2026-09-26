import { z } from 'zod'
import { dict } from '@river/i18n'
import type { Recap } from '../../shared/types'
import { settingsCache } from '../db'
import { callModel, type CallResult, type Msg, type UsageTag } from './llm'

export interface CoachBase {
  // 学员档案：复盘时记下的要点
  memory: string[]
  tag: UsageTag
}

// 讲解、提问、复盘共用一份 system；各自的要求（prompt.asks）写在当次 user 消息里（ADR-006）
function system(memory: string[]) {
  const st = settingsCache
  const p = dict(st.locale).prompt
  const c = p.coaches[st.coachPersona]
  return [
    p.coach.intro(c.n, c.s),
    p.coach.side,
    st.level === 'novice' ? p.coach.novice : p.coach.pro,
    p.coach.style,
    p.coach.moments,
    memory.length ? `${p.coach.memory}\n${memory.map((m) => '- ' + m).join('\n')}` : '',
    p.coach.reply
  ]
    .filter(Boolean)
    .join('\n')
}

// 轮到玩家时教练先说（A8：每步都说，不再判断是否沉默）
export function coachSpeak(o: CoachBase & { messages: Msg[] }, onDelta: (t: string) => void, signal: AbortSignal) {
  return callModel({ role: 'coach', purpose: 'speak', system: system(o.memory), messages: o.messages, onDelta, maxRetries: 1, timeoutMs: 20_000, signal, tag: o.tag })
}

export function coachAsk(o: CoachBase & { messages: Msg[] }, onDelta: (t: string) => void, signal: AbortSignal) {
  return callModel({ role: 'coach', purpose: 'ask', system: system(o.memory), messages: o.messages, onDelta, maxRetries: 2, timeoutMs: 45_000, signal, tag: o.tag })
}

function recapTool() {
  const p = dict(settingsCache.locale).prompt.recapTool
  return {
    name: 'recap',
    description: p.description,
    schema: z.object({
      headline: z.string().describe(p.headline),
      good: z.string().describe(p.good),
      improve: z.string().describe(p.improve),
      tip: z.string().describe(p.tip),
      note: z.string().optional().describe(p.note)
    })
  }
}

export async function coachRecap(o: CoachBase & { messages: Msg[] }, signal: AbortSignal): Promise<CallResult<Recap & { note?: string }>> {
  const r = await callModel({
    role: 'coach',
    purpose: 'recap',
    system: system(o.memory),
    messages: o.messages,
    tool: recapTool(),
    maxRetries: 2,
    timeoutMs: 45_000,
    signal,
    tag: o.tag
  })
  // 没调用工具等同失败：复盘卡需要四段内容
  return r.ok && !r.args ? { ...r, ok: false, error: dict(settingsCache.locale).desktop.table.coach.noRecap } : r
}
