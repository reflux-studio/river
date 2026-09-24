export const Dropped = Symbol('Dropped')
export type Dropped = typeof Dropped

export interface QueueTask<T> {
  // fn 在微任务里才开始：若同一轮里已被抢占，拿到的 signal 已是 aborted，不会再触发 abort 事件。
  // 自己监听 abort 的 fn 必须先检查 signal.aborted，否则只能等满 2 秒被越过。durable 任务不会被中止。
  fn: (signal: AbortSignal) => Promise<T>
  preempt?: boolean
  durable?: boolean
}

interface Entry {
  task: QueueTask<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

interface Running {
  durable: boolean
  ctrl: AbortController
  // 抢占等满 2 秒仍未结束（只发生在非 durable 任务上）：放弃等待，它的结果作废
  overtaken: boolean
  settled: Promise<void>
}

const PREEMPT_WAIT_MS = 2000
const MAX_PENDING = 2

// working memory 整份覆盖写入，同一 agent 并发调用会互相覆盖，因此每个 agent 实例串行执行
export class AgentQueue {
  private running: Running | null = null
  private pending: Entry[] = []
  // 含被放弃等待但仍在运行的任务：idle() 要等它们也结束，否则重置记忆后仍可能被写回
  private active = new Set<Promise<void>>()

  run<T>(task: QueueTask<T>): Promise<T | Dropped> {
    return new Promise((resolve, reject) => {
      const entry = { task, resolve, reject } as Entry
      if (!task.preempt) {
        if (!task.durable && this.pending.length >= MAX_PENDING) return resolve(Dropped)
        this.pending.push(entry)
        return this.pump()
      }
      this.pending = this.pending.filter((e) => e.task.durable || (e.resolve(Dropped), false))
      this.pending.push(entry)
      const cur = this.running
      // durable 任务不中止也不越过：它是无 LLM 的短写入，越过会与抢占任务并发写同一 thread
      if (!cur || cur.durable) return this.pump()
      cur.ctrl.abort()
      const timer = new Promise((r) => setTimeout(r, PREEMPT_WAIT_MS))
      void Promise.race([cur.settled, timer]).then(() => {
        if (this.running !== cur) return
        cur.overtaken = true
        this.running = null
        this.pump()
      })
    })
  }

  async idle(): Promise<void> {
    while (this.active.size) await Promise.all(this.active)
  }

  private pump() {
    if (this.running) return
    const entry = this.pending.shift()
    if (!entry) return
    const r: Running = { durable: !!entry.task.durable, ctrl: new AbortController(), overtaken: false, settled: Promise.resolve() }
    this.running = r
    r.settled = Promise.resolve()
      .then(() => entry.task.fn(r.ctrl.signal))
      .then(
        (v) => entry.resolve(r.overtaken ? Dropped : v),
        (e) => (r.overtaken ? entry.resolve(Dropped) : entry.reject(e))
      )
      .finally(() => {
        this.active.delete(r.settled)
        if (this.running === r) {
          this.running = null
          this.pump()
        }
      })
    this.active.add(r.settled)
  }
}
