import { describe, expect, it } from 'vitest'
import { Thread } from '../src/main/agents/thread'

const last = (m: { content: unknown }[]) => m.at(-1)!.content as string

describe('Thread', () => {
  it('成功写入：文本组两条、工具组三条，tool-call 与 tool-result 配对', () => {
    const t = new Thread()
    const o1 = last(t.messagesFor(1, '局面1'))
    expect(t.pushText(1, o1, '讲解', 'd1')).toBe(true)
    const m = t.messagesFor(1, '局面2')
    expect(t.pushTool(1, last(m), 'act', { action: 'call', think: '看看' }, { 实际: '跟注 100' }, 'd2')).toBe(true)
    const all = t.messagesFor(1, '局面3')
    expect(all.map((x) => x.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'tool', 'user'])
    const call = (all[3].content as { toolCallId: string; input: unknown }[])[0]
    const res = (all[4].content as { toolCallId: string; output: unknown }[])[0]
    expect(call.toolCallId).toBe(res.toolCallId)
    expect(call.toolCallId).toBe('h1-1')
    expect(call.input).toEqual({ action: 'call', think: '看看' })
    expect(res.output).toEqual({ type: 'json', value: { 实际: '跟注 100' } })
  })

  it('没写入的调用不留痕迹；手号不符的写入被丢弃', () => {
    const t = new Thread()
    t.messagesFor(1, '局面1')
    expect(t.messagesFor(1, '局面1b')).toHaveLength(1)
    t.messagesFor(2, '新一手')
    expect(t.pushText(1, 'x', '迟到的发言', 'd')).toBe(false)
    expect(t.pushTool(1, 'x', 'talk', {}, {}, 'd')).toBe(false)
    expect(t.messagesFor(2, '局面')).toHaveLength(1)
  })

  it('跨手压缩：摘要 + 自己的动作进往手回顾，只放在本手第一条 user 里', () => {
    const t = new Thread()
    const o = last(t.messagesFor(1, '局面1'))
    t.pushText(1, o, '讲解', '讲解：先看赔率')
    t.setSummary(1, '玩家赢 300')
    const compressed: number[] = []
    const m = t.messagesFor(2, '局面2', (h) => compressed.push(h))
    expect(compressed).toEqual([1])
    expect(m).toHaveLength(1)
    expect(last(m)).toBe('【往手回顾】\n[第 1 手] 玩家赢 300\n你本手：讲解：先看赔率\n\n局面2')
    t.pushText(2, last(m), '好', 'd')
    const m2 = t.messagesFor(2, '局面3')
    expect(m2[0].content).toContain('【往手回顾】')
    expect(last(m2)).toBe('局面3')
  })

  it('跳过的手：摘要缺失时仍按空摘要压缩；窗口只留 5 手', () => {
    const t = new Thread()
    t.messagesFor(1, 'a')
    const m = t.messagesFor(2, 'b')
    expect(last(m)).toBe('【往手回顾】\n[第 1 手] \n你本手：无\n\nb')
    for (let h = 3; h <= 8; h++) t.messagesFor(h, 'x')
    const r = last(t.messagesFor(9, 'y'))
    expect(r).not.toContain('[第 3 手]')
    expect(r).toContain('[第 4 手]')
    expect(r).toContain('[第 8 手]')
  })

  it('setSummary：同一手直接写；hand 为空时进入该手；更早的手先压缩；过期的忽略', () => {
    const t = new Thread()
    t.setSummary(3, 's3')
    expect(t.hand).toBe(3)
    const seen: number[] = []
    t.setSummary(4, 's4', (h) => seen.push(h))
    expect(seen).toEqual([3])
    t.setSummary(3, '过期', (h) => seen.push(h))
    expect(seen).toEqual([3])
    expect(t.hand).toBe(4)
    const r = last(t.messagesFor(5, 'z'))
    expect(r).toContain('[第 3 手] s3')
    expect(r).toContain('[第 4 手] s4')
    expect(r).not.toContain('过期')
  })
})
