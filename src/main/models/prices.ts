// 价格来自 models.dev（美元 / 百万 token）：构建时打进应用的快照 + 运行时刷新的缓存（discussion §6）
import type { Cost, Purpose, UsageSummary } from '../../shared/types'
import { getPriceCache, getUsageSince, handKeys, listUsage, setPriceCache, type UsageRow } from '../db'
import snapshot from './prices.json'

type Table = Record<string, Record<string, number[]>>
interface Prices {
  at: number
  prices: Table
}

let current: Prices = snapshot as Prices

export async function loadPrices() {
  const cached = (await getPriceCache()) as Prices | null
  if (cached && cached.at > current.at) current = cached
}

const API = 'https://models.dev/api.json'

// 启动后后台刷新一次；失败静默，继续用快照或缓存
export async function refreshPrices(fetchFn: typeof fetch = fetch) {
  try {
    const res = await fetchFn(API, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return
    const api = (await res.json()) as Record<string, { models?: Record<string, { cost?: { input?: number; output?: number; cache_read?: number } }> }>
    const prices: Table = {}
    for (const [kind, p] of Object.entries(api)) {
      for (const [id, m] of Object.entries(p.models ?? {})) {
        const c = m.cost
        if (typeof c?.input !== 'number' || typeof c.output !== 'number') continue
        ;(prices[kind] ??= {})[id] = typeof c.cache_read === 'number' ? [c.input, c.output, c.cache_read] : [c.input, c.output]
      }
    }
    current = { at: Date.now(), prices }
    await setPriceCache(current)
  } catch {
    // 离线或被拦：沿用已有价格
  }
}

export function priceOf(kind: string | null, modelId: string | null): number[] | undefined {
  return kind && modelId ? current.prices[kind]?.[modelId] : undefined
}

// 一次调用的花费；无价格或无用量时为 null
export function costOf(u: Pick<UsageRow, 'providerKind' | 'modelId' | 'input' | 'output' | 'cached'>): number | null {
  const p = priceOf(u.providerKind, u.modelId)
  if (!p || u.input == null || u.output == null) return null
  const cached = Math.min(u.cached ?? 0, u.input)
  return ((u.input - cached) * p[0] + cached * (p[2] ?? p[0]) + u.output * p[1]) / 1e6
}

export function costTotal(rows: UsageRow[]): Cost {
  let usd = 0
  let tokens = 0
  let unpriced = 0
  for (const r of rows) {
    const t = (r.input ?? 0) + (r.output ?? 0)
    tokens += t
    const c = costOf(r)
    if (c == null) unpriced += t
    else usd += c
  }
  return { usd, tokens, unpriced }
}

const PURPOSES: Purpose[] = ['decide', 'speak', 'ask', 'recap']

// 每手柱状图只含已落库的手：作废的手（停下后离桌）计入总量但不单列
export async function usageSummary(): Promise<UsageSummary> {
  const rows = await listUsage()
  const recorded = await handKeys()
  const since = await getUsageSince()
  const unknown = (rs: UsageRow[]) => rs.filter((r) => r.input == null || r.output == null).length
  const purposes = PURPOSES.map((purpose) => {
    const rs = rows.filter((r) => r.purpose === purpose)
    const c = costTotal(rs)
    return { purpose, calls: rs.length, tokens: c.tokens, unknown: unknown(rs), usd: c.usd, unpriced: c.unpriced }
  })
  const byHand = new Map<string, { handNo: number; rows: UsageRow[] }>()
  for (const r of rows) {
    if (r.tableId == null || r.handNo == null) continue
    const k = `${r.tableId}:${r.handNo}`
    if (!recorded.has(k)) continue
    const h = byHand.get(k) ?? { handNo: r.handNo, rows: [] }
    h.rows.push(r)
    byHand.set(k, h)
  }
  const hands = [...byHand.values()].map((h) => ({ handNo: h.handNo, ...costTotal(h.rows) }))
  const total = costTotal(rows)
  return {
    since,
    purposes,
    hands: hands.slice(-40).map(({ handNo, usd, tokens }) => ({ handNo, usd, tokens })),
    total: {
      ...total,
      calls: rows.length,
      input: rows.reduce((a, r) => a + (r.input ?? 0), 0),
      output: rows.reduce((a, r) => a + (r.output ?? 0), 0),
      unknown: unknown(rows)
    },
    avgPerHand: hands.length ? hands.reduce((a, h) => a + h.usd, 0) / hands.length : null
  }
}
