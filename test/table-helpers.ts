import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import * as db from '../src/main/db'
import { TableRunner, type AgentDeps } from '../src/main/table/runner'
import type { ChatMessage, CoachEntry, Events, Settings, TableView } from '../src/shared/types'

export function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
}

const okCall = <T>(args: T) => ({ ok: true, aborted: false, text: '', args })

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
  opponentAct: async () => okCall({ action: 'call' }),
  // 默认不发言，免得干扰其他用例对公屏的断言
  opponentTalk: async () => okCall({}),
  coachSpeak: async (_o, onDelta) => (onDelta('好'), { ok: true, aborted: false, text: '好' }),
  coachAsk: async (_o, onDelta) => (onDelta('答'), { ok: true, aborted: false, text: '答' }),
  coachRecap: async () => okCall({ headline: 'h', good: 'g', improve: 'i', tip: 't' })
})

export { okCall }

export interface Harness {
  runner: TableRunner
  events: { event: keyof Events; payload: unknown }[]
  views: TableView[]
  chat: ChatMessage[]
  coach: Map<string, CoachEntry>
  of<K extends keyof Events>(event: K): Events[K][]
  view(): TableView
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
  await db.updateSettings({ speed: 2, ...settings })
  vi.useFakeTimers()
}

export function teardown() {
  vi.useRealTimers()
  dropTempDb()
}

export async function harness(o: { agents?: Partial<AgentDeps>; rng?: () => number; onEmit?: (h: Harness, event: keyof Events, payload: unknown) => void } = {}): Promise<Harness> {
  const h = { events: [], views: [], chat: [], coach: new Map() } as unknown as Harness
  h.of = (event) => h.events.filter((e) => e.event === event).map((e) => e.payload) as never
  h.view = () => h.views.at(-1)!
  h.runner = new TableRunner({
    emit: (event, payload) => {
      h.events.push({ event, payload })
      if (event === 'table:view' && payload) h.views.push(payload as TableView)
      if (event === 'chat:append') h.chat.push(payload as ChatMessage)
      if (event === 'coach:upsert') h.coach.set((payload as CoachEntry).id, payload as CoachEntry)
      o.onEmit?.(h, event, payload)
    },
    agents: { ...defaultAgents(), ...o.agents },
    rng: o.rng ?? seeded(1)
  })
  await h.runner.init()
  return h
}

export const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

// 轮到玩家且未锁定时按 pick 行动；直到 until 成立或超出步数
export async function drive(h: Harness, until: () => boolean, pick: (v: TableView) => 'fold' | 'call' | 'raise' | null = () => 'call', maxSteps = 5000) {
  for (let i = 0; i < maxSteps && !until(); i++) {
    const v = h.runner.view()
    if (v && v.hero.isTurn && !v.coach?.locked) {
      const a = pick(v)
      if (a) h.runner.heroAct(a === 'raise' ? { type: a, to: v.hero.defaultRaiseTo } : { type: a })
    }
    if (v?.done && h.runner.canNext()) {
      if (v.heroBust) await h.runner.rebuy()
      else h.runner.nextHand()
    }
    await tick(100)
  }
  if (!until()) throw new Error('drive: condition not reached')
}
