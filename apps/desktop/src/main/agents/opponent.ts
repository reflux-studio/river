import { z } from 'zod'
import { dict } from '@river/i18n'
import { settingsCache } from '../db'
import { callModel, type CallResult, type Msg, type UsageTag } from './llm'

const tr = () => dict(settingsCache.locale).prompt

// schema 放宽：小模型常把 action 写成 bet、把 to 写成字符串，交给 runner 规范化，不因校验失败停下（reviews/design-3.md F3）
function actTool() {
  const p = tr().actTool
  return {
    name: 'act',
    description: p.description,
    schema: z.object({
      think: z.string().optional().describe(p.think),
      action: z.string().optional().describe(p.action),
      to: z.union([z.number(), z.string()]).optional().describe(p.to),
      say: z.string().optional().describe(p.say),
      note: z.string().optional().describe(p.note)
    })
  }
}

function talkTool() {
  const p = tr().talkTool
  return {
    name: 'talk',
    description: p.description,
    schema: z.object({
      say: z.string().optional().describe(p.say),
      note: z.string().optional().describe(p.note)
    })
  }
}

export type RawAct = z.infer<ReturnType<typeof actTool>['schema']>
export type RawTalk = z.infer<ReturnType<typeof talkTool>['schema']>

export interface OpponentBase {
  name: string
  prompt: string
  memory: string[]
  tag: UsageTag
}

const MS = 45_000

function system(i: OpponentBase) {
  const p = tr().opponent
  return [
    p.intro(i.name, i.prompt),
    p.rules,
    p.act,
    p.talk,
    i.memory.length ? `${p.memory}\n${i.memory.map((m) => '- ' + m).join('\n')}` : '',
    p.reply
  ]
    .filter(Boolean)
    .join('\n')
}

export function opponentAct(i: OpponentBase & { messages: Msg[] }, signal: AbortSignal): Promise<CallResult<RawAct>> {
  return callModel({ role: 'opponent', purpose: 'decide', system: system(i), messages: i.messages, tool: actTool(), maxRetries: 2, timeoutMs: MS, signal, tag: i.tag })
}

// 赛后发言可有可无：不重试，失败即当没说
export function opponentTalk(i: OpponentBase & { messages: Msg[] }, signal: AbortSignal): Promise<CallResult<RawTalk>> {
  return callModel({ role: 'opponent', purpose: 'talk', system: system(i), messages: i.messages, tool: talkTool(), maxRetries: 0, timeoutMs: 20_000, signal, tag: i.tag })
}
