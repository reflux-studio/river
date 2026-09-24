import { z } from 'zod'
import { callModel, type CallResult, type UsageTag } from './llm'

// schema 放宽：小模型常把 action 写成 bet、把 to 写成字符串，交给 runner 规范化，不因校验失败停下（reviews/design-3.md F3）
const act = {
  name: 'act',
  description: '做出本次行动，同时可以说一句话、记一条印象',
  schema: z.object({
    action: z.string().optional().describe('fold / check / call / raise；无人下注时 raise 即下注'),
    to: z.union([z.number(), z.string()]).optional().describe('raise 时下注或加注到的总额'),
    say: z.string().optional().describe('想说的一句话，不说留空'),
    note: z.string().optional().describe('对某位玩家的新观察或自己的心情，没有留空')
  })
}

export type RawAct = z.infer<typeof act.schema>

export interface OpponentInput {
  name: string
  prompt: string
  memory: string[]
  situation: string
  tag: UsageTag
}

const MS = 45_000

function system(i: OpponentInput) {
  return [
    `你在一张 PvE 娱乐德州扑克桌上扮演「${i.name}」。按人设决策，但别做明显送钱的离谱决定。`,
    i.prompt,
    '每次轮到你，只调用一次 act 工具：action 为 fold、check、call 或 raise（无人下注时 raise 就是下注），raise 时 to 为下注或加注到的总额。',
    '想说话就在 say 里说一句，不超过 20 字，中文口语，符合人设；可以虚张声势、谈论牌面，但不要如实报出自己的底牌；不想说就留空。',
    '对某位玩家有新的观察、或心情有变化时，在 note 里记一句，不超过 30 字；没有新东西就留空。',
    i.memory.length ? `你之前记下的印象：\n${i.memory.map((m) => '- ' + m).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function opponentAct(i: OpponentInput, signal: AbortSignal): Promise<CallResult<RawAct>> {
  return callModel({
    role: 'opponent',
    purpose: 'decide',
    system: system(i),
    messages: [{ role: 'user', content: i.situation }],
    tool: act,
    maxRetries: 2,
    timeoutMs: MS,
    signal,
    tag: i.tag
  })
}
