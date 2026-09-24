import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import type { IntentCollector } from '../src/main/agents/intents'
import type { OpponentResult } from '../src/main/agents/opponent'
import * as db from '../src/main/db'
import { TableRunner, type AgentDeps, type Limits } from '../src/main/table/runner'
import type { ChatMessage, Events, Settings, TableView } from '../src/shared/types'

export function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
}

export const ok = (intents: IntentCollector): OpponentResult => ({ ok: true, aborted: false, intents })

// 可被 signal 中止的延迟：模拟被 abort 后按 Mastra 行为返回 aborted 结果
export function delayed<T>(ms: number, signal: AbortSignal, value: () => T, aborted: () => NoInfer<T>): Promise<T> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(aborted())
    const t = setTimeout(() => resolve(value()), ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve(aborted())))
  })
}

export const defaultAgents = (): AgentDeps => ({
  modelReady: () => true,
  opponentDecide: async (ctx) => {
    const v = ctx.table.viewFor(ctx.seat)
    return ok({ act: { type: v.toCall ? 'call' : 'check' } as const })
  },
  opponentChat: async () => ok({}),
  coachProactive: async () => ok({}),
  coachAsk: async (_ctx, _q, onDelta) => (onDelta('好'), { ok: true, text: '好', aborted: false }),
  coachReview: async () => ({ ok: true, text: '复盘' }),
  appendResult: async () => {}
})

export interface Harness {
  runner: TableRunner
  events: { event: keyof Events; payload: unknown }[]
  views: TableView[]
  chat: ChatMessage[]
  of<K extends keyof Events>(event: K): Events[K][]
}

export const plainCrypto = { encrypt: (t: string) => Buffer.from(t), decrypt: (b: Buffer) => b.toString() }

let dir = ''

export async function tempDb(crypto = plainCrypto) {
  dir = mkdtempSync(join(tmpdir(), 'river-'))
  const url = 'file:' + join(dir, 'river.db')
  await db.initDb({ url, ...crypto })
  return { url, dir }
}

export function dropTempDb() {
  db.closeDb()
  rmSync(dir, { recursive: true, force: true })
}

export async function setup(settings: Partial<Settings> = {}) {
  await tempDb()
  await db.updateSettings({ speed: 2, coachOn: false, autoNext: false, engine: 'llm', ...settings })
  vi.useFakeTimers()
}

export function teardown() {
  vi.useRealTimers()
  dropTempDb()
}

export async function harness(o: { agents?: Partial<AgentDeps>; limits?: Partial<Limits>; rng?: () => number; onEmit?: (h: Harness, event: keyof Events, payload: unknown) => void } = {}): Promise<Harness> {
  const h = { events: [], views: [], chat: [] } as unknown as Harness
  h.of = (event) => h.events.filter((e) => e.event === event).map((e) => e.payload) as never
  h.runner = new TableRunner({
    emit: (event, payload) => {
      h.events.push({ event, payload })
      if (event === 'table:view' && payload) h.views.push(payload as TableView)
      if (event === 'chat:append') h.chat.push(payload as ChatMessage)
      o.onEmit?.(h, event, payload)
    },
    agents: { ...defaultAgents(), ...o.agents },
    limits: o.limits,
    rng: o.rng ?? seeded(1)
  })
  await h.runner.init()
  return h
}

export const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

// 轮到玩家时按 pick 行动；直到 until 成立或超出步数
export async function drive(h: Harness, until: () => boolean, pick: (v: TableView) => 'fold' | 'call' | 'raise' | null = () => 'call', maxSteps = 5000) {
  for (let i = 0; i < maxSteps && !until(); i++) {
    const g = h.runner.game
    if (g && !g.done && !g.runout && g.toAct === 0 && !h.runner.paused) {
      const v = h.views.at(-1)!
      const a = pick(v)
      if (a) h.runner.heroAct({ type: a })
    }
    await tick(100)
  }
  if (!until()) throw new Error('drive: condition not reached')
}
