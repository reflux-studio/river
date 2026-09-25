import { z } from 'zod'
import { callModel, type CallResult, type Msg, type UsageTag } from './llm'

// schema 放宽：小模型常把 action 写成 bet、把 to 写成字符串，交给 runner 规范化，不因校验失败停下（reviews/design-3.md F3）
const act = {
  name: 'act',
  description: '做出本次行动，同时可以说一句话、记一条印象',
  schema: z.object({
    think: z.string().optional().describe('你的真实盘算，一两句，只有你自己看得到'),
    action: z.string().optional().describe('fold / check / call / raise；无人下注时 raise 即下注'),
    to: z.union([z.number(), z.string()]).optional().describe('raise 时下注或加注到的总额'),
    say: z.string().optional().describe('想说的一句话，不说留空'),
    note: z.string().optional().describe('对某位玩家的新观察或自己的心情，没有留空')
  })
}

const talk = {
  name: 'talk',
  description: '一手结束后说一句赛后的话',
  schema: z.object({
    say: z.string().optional().describe('赛后说的话，不超过 30 字；不想说留空'),
    note: z.string().optional().describe('对某位玩家的新观察，不超过 30 字；没有留空')
  })
}

export type RawAct = z.infer<typeof act.schema>
export type RawTalk = z.infer<typeof talk.schema>

export interface OpponentBase {
  name: string
  prompt: string
  memory: string[]
  tag: UsageTag
}

const MS = 45_000

function system(i: OpponentBase) {
  return [
    `你在一张 PvE 娱乐德州扑克桌上扮演「${i.name}」。${i.prompt}`,
    '按人设决策，但别做明显送钱的离谱决定。你只能看到自己的底牌和桌上的公开信息。',
    '轮到你行动时调用 act：think 写一两句你的真实盘算（只有你自己看得到）；action 为 fold、check、call 或 raise（无人下注时 raise 就是下注），raise 时 to 为下注或加注到的总额；say 是说出口的话，不超过 20 字，中文口语，符合人设，可以虚张声势，但不要如实报出底牌，不想说就留空；note 记对某位玩家的新观察或心情变化，不超过 30 字，没有就留空。',
    '一手结束后如果请你说句赛后的话，调用 talk：可以复盘、口嗨、嘴硬甚至撒谎，符合人设就行；不想说 say 留空。',
    i.memory.length ? `你之前记下的印象：\n${i.memory.map((m) => '- ' + m).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function opponentAct(i: OpponentBase & { messages: Msg[] }, signal: AbortSignal): Promise<CallResult<RawAct>> {
  return callModel({ role: 'opponent', purpose: 'decide', system: system(i), messages: i.messages, tool: act, maxRetries: 2, timeoutMs: MS, signal, tag: i.tag })
}

// 赛后发言可有可无：不重试，失败即当没说
export function opponentTalk(i: OpponentBase & { messages: Msg[] }, signal: AbortSignal): Promise<CallResult<RawTalk>> {
  return callModel({ role: 'opponent', purpose: 'talk', system: system(i), messages: i.messages, tool: talk, maxRetries: 0, timeoutMs: 20_000, signal, tag: i.tag })
}
