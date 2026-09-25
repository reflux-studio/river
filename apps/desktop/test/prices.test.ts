import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../src/main/db'
import { costOf, costTotal, loadPrices, priceOf, refreshPrices, usageSummary } from '../src/main/models/prices'
import { dropTempDb, tempDb } from './table-helpers'

beforeEach(() => tempDb())
afterEach(dropTempDb)

const api = { anthropic: { models: { 'claude-x': { cost: { input: 1, output: 5, cache_read: 0.1 } }, free: {} } } }
const fakeFetch = (async () => new Response(JSON.stringify(api))) as unknown as typeof fetch
const row = (o: Partial<db.UsageRow> = {}): db.UsageRow => ({
  at: 1, tableId: 't', handNo: 1, purpose: 'decide', providerKind: 'anthropic', modelId: 'claude-x', input: 1_000_000, output: 100_000, cached: null, ...o
})

describe('价格', () => {
  it('刷新后按提供方类型 + 模型查价，并写入缓存', async () => {
    await refreshPrices(fakeFetch)
    expect(priceOf('anthropic', 'claude-x')).toEqual([1, 5, 0.1])
    expect(priceOf('anthropic', 'free')).toBeUndefined()
    expect(await db.getPriceCache()).toMatchObject({ prices: { anthropic: { 'claude-x': [1, 5, 0.1] } } })
    await loadPrices()
  })

  it('刷新失败静默', async () => {
    await refreshPrices((async () => { throw new Error('offline') }) as unknown as typeof fetch)
  })

  it('花费：缓存读取按缓存价计；无价或无用量不计入 usd', async () => {
    await refreshPrices(fakeFetch)
    expect(costOf(row())).toBeCloseTo(1 + 0.5)
    expect(costOf(row({ cached: 500_000 }))).toBeCloseTo(0.5 + 0.05 + 0.5)
    expect(costOf(row({ modelId: 'unknown' }))).toBeNull()
    expect(costTotal([row(), row({ modelId: 'unknown', input: 10, output: 5 }), row({ input: null, output: null })])).toEqual({ usd: 1.5, tokens: 1_100_015, unpriced: 15 })
  })

  it('汇总：按用途、未知用量、每手只含已落库的手', async () => {
    await refreshPrices(fakeFetch)
    await db.insertUsage(row())
    await db.insertUsage(row({ purpose: 'recap', input: null, output: null }))
    await db.insertUsage(row({ handNo: 2 }))
    await db.insertHand('t', { hand: 1, sb: 1, bb: 2, net: 0, pot: 0, showdown: false, hero: [], board: [], players: [], log: [], vpip: false, pfr: false })
    const s = await usageSummary()
    expect(s.total).toMatchObject({ calls: 3, unknown: 1 })
    expect(s.purposes.find((p) => p.purpose === 'recap')).toMatchObject({ calls: 1, unknown: 1, tokens: 0 })
    expect(s.hands).toEqual([{ handNo: 1, usd: 1.5, tokens: 1_100_000 }])
    expect(s.avgPerHand).toBeCloseTo(1.5)
  })
})
