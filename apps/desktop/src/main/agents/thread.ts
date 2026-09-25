// 每个牌桌 Agent（对手或教练）在本桌的对话线：本手按组原样保留，往手由代码压缩成摘要（ADR-006）
import type { Msg } from './llm'

const PAST_HANDS = 5

export class Thread {
  hand: number | null = null
  // 上次成功观察时公屏最后一条消息的 id；「新发言」从它之后读起
  chatSeen: string | null = null
  // 教练：上次写入的局面文本，提问时局面没变就不重复附上
  lastSituation: string | null = null
  private past: string[] = []
  private groups: Msg[][] = []
  private digest: string[] = []
  private summary: string | null = null
  private seq = 0

  // 新一手里第一次被调用时压缩往手；onCompress 收到被压缩的手号，用来中止那一手还在进行的赛后发言
  messagesFor(hand: number, observation: string, onCompress?: (hand: number) => void): Msg[] {
    this.enter(hand, onCompress)
    const recap = this.groups.length === 0 && this.past.length ? `【往手回顾】\n${this.past.join('\n')}\n\n` : ''
    return [...this.groups.flat(), { role: 'user', content: recap + observation }]
  }

  // observation 必须是 messagesFor 返回的最后一条 user 原文（可能带往手回顾）；手号已变的结果丢弃
  pushText(hand: number, observation: string, text: string, digest: string): boolean {
    if (this.hand !== hand) return false
    this.groups.push([{ role: 'user', content: observation }, { role: 'assistant', content: text }])
    this.digest.push(digest)
    return true
  }

  pushTool(hand: number, observation: string, tool: string, input: unknown, result: unknown, digest: string): boolean {
    if (this.hand !== hand) return false
    const toolCallId = `h${hand}-${++this.seq}`
    this.groups.push([
      { role: 'user', content: observation },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId, toolName: tool, input }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId, toolName: tool, output: { type: 'json', value: result } }] }
    ])
    this.digest.push(digest)
    return true
  }

  setSummary(hand: number, summary: string, onCompress?: (hand: number) => void) {
    if (this.hand !== null && this.hand > hand) return
    this.enter(hand, onCompress)
    this.summary = summary
  }

  private enter(hand: number, onCompress?: (hand: number) => void) {
    if (this.hand === hand) return
    if (this.hand !== null) {
      onCompress?.(this.hand)
      this.past.push(`[第 ${this.hand} 手] ${this.summary ?? ''}\n你本手：${this.digest.join('；') || '无'}`)
      this.past = this.past.slice(-PAST_HANDS)
    }
    this.hand = hand
    this.groups = []
    this.digest = []
    this.summary = null
  }
}
