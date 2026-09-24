import { describe, expect, it } from 'vitest'
import { AgentQueue, Dropped } from '../src/main/agents/queue'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// 可中止的任务：被 abort 后 delay 毫秒才真正结束
function job(log: string[], name: string, ms: number, onAbortDelay = 0) {
  return (signal: AbortSignal) =>
    new Promise<string>((resolve) => {
      log.push(`start ${name}`)
      const t = setTimeout(() => (log.push(`end ${name}`), resolve(name)), ms)
      signal.addEventListener('abort', () => {
        clearTimeout(t)
        setTimeout(() => (log.push(`aborted ${name}`), resolve(`${name}:aborted`)), onAbortDelay)
      })
    })
}

describe('AgentQueue', () => {
  it('串行执行', async () => {
    const q = new AgentQueue()
    const log: string[] = []
    const a = q.run({ fn: job(log, 'a', 20) })
    const b = q.run({ fn: job(log, 'b', 5) })
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('非 durable 任务排队超过 2 个被拒，durable 不受限', async () => {
    const q = new AgentQueue()
    const log: string[] = []
    const running = q.run({ fn: job(log, 'r', 30) })
    const p1 = q.run({ fn: job(log, 'p1', 1) })
    const p2 = q.run({ fn: job(log, 'p2', 1) })
    const p3 = q.run({ fn: job(log, 'p3', 1) })
    const d = q.run({ fn: job(log, 'd', 1), durable: true })
    expect(await p3).toBe(Dropped)
    expect(await Promise.all([running, p1, p2, d])).toEqual(['r', 'p1', 'p2', 'd'])
  })

  it('抢占：中止当前任务并等待其结束，丢弃未开始的非 durable，先执行 durable', async () => {
    const q = new AgentQueue()
    const log: string[] = []
    const cur = q.run({ fn: job(log, 'chat', 5000, 100) })
    const chat2 = q.run({ fn: job(log, 'chat2', 1) })
    const durable = q.run({ fn: job(log, 'result', 1), durable: true })
    await sleep(10)
    const decide = q.run({ fn: job(log, 'decide', 1), preempt: true })
    expect(await chat2).toBe(Dropped)
    expect(await cur).toBe('chat:aborted')
    expect(await durable).toBe('result')
    expect(await decide).toBe('decide')
    expect(log).toEqual(['start chat', 'aborted chat', 'start result', 'end result', 'start decide', 'end decide'])
  })

  it('抢占：durable 当前任务不被中止', async () => {
    const q = new AgentQueue()
    const log: string[] = []
    const cur = q.run({ fn: job(log, 'result', 50), durable: true })
    await sleep(5)
    const decide = q.run({ fn: job(log, 'decide', 1), preempt: true })
    expect(await Promise.all([cur, decide])).toEqual(['result', 'decide'])
    expect(log).toEqual(['start result', 'end result', 'start decide', 'end decide'])
  })

  it('被中止任务 2 秒内未结束：直接执行抢占任务，旧结果作废；idle 等它也结束', async () => {
    const q = new AgentQueue()
    const log: string[] = []
    const cur = q.run({ fn: job(log, 'chat', 10_000, 2600) })
    await sleep(5)
    const t0 = Date.now()
    const decide = await q.run({ fn: job(log, 'decide', 1), preempt: true })
    const waited = Date.now() - t0
    expect(decide).toBe('decide')
    expect(waited).toBeGreaterThanOrEqual(1990)
    expect(waited).toBeLessThan(2500)
    expect(log).toEqual(['start chat', 'start decide', 'end decide'])
    await q.idle()
    expect(log.at(-1)).toBe('aborted chat')
    expect(await cur).toBe(Dropped)
  }, 10_000)

  it('durable 当前任务超过 2 秒也不被越过，返回真实结果', async () => {
    const q = new AgentQueue()
    const log: string[] = []
    const cur = q.run({ fn: job(log, 'result', 2300), durable: true })
    await sleep(5)
    const decide = q.run({ fn: job(log, 'decide', 1), preempt: true })
    expect(await Promise.all([cur, decide])).toEqual(['result', 'decide'])
    expect(log).toEqual(['start result', 'end result', 'start decide', 'end decide'])
  }, 10_000)

  it('开始前已被抢占：fn 拿到的 signal 已是 aborted，先检查它即可立即让位', async () => {
    const q = new AgentQueue()
    let sawAborted: boolean | undefined
    const cur = q.run({
      fn: async (signal) => {
        sawAborted = signal.aborted
        if (signal.aborted) return 'skipped'
        await sleep(5000)
        return 'late'
      }
    })
    const t0 = Date.now()
    const decide = q.run({ fn: async () => 'decide', preempt: true })
    expect(await decide).toBe('decide')
    expect(Date.now() - t0).toBeLessThan(500)
    expect(sawAborted).toBe(true)
    expect(await cur).toBe('skipped')
  })

  it('idle() 在队列清空后 resolve', async () => {
    const q = new AgentQueue()
    await q.idle()
    const log: string[] = []
    void q.run({ fn: job(log, 'a', 20) })
    void q.run({ fn: job(log, 'b', 20) })
    await q.idle()
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('任务抛错时 reject，队列继续', async () => {
    const q = new AgentQueue()
    const a = q.run({ fn: async () => { throw new Error('x') } })
    const b = q.run({ fn: async () => 'b' })
    await expect(a).rejects.toThrow('x')
    expect(await b).toBe('b')
  })
})
