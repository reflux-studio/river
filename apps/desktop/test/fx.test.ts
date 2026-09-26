import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../src/main/db'
import { fxRates, loadFx, refreshFx } from '../src/main/models/fx'
import { dropTempDb, tempDb } from './table-helpers'

beforeEach(() => tempDb())
afterEach(dropTempDb)

const body = { date: '2026-09-24', usd: { cny: 7.18, eur: 0.91, jpy: 149.5, xyz: 3, krw: 'bad' } }
const ok = (b: unknown) => new Response(JSON.stringify(b))

describe('汇率', () => {
  it('主地址失败时换备用地址；只保留可选币种的有效汇率，并写入缓存', async () => {
    const urls: string[] = []
    const fetchFn = (async (url: string) => (urls.push(url), urls.length === 1 ? new Response('', { status: 503 }) : ok(body))) as unknown as typeof fetch
    const fx = await refreshFx(fetchFn)
    expect(urls[0]).toContain('cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd')
    expect(urls[1]).toContain('latest.currency-api.pages.dev/v1/currencies/usd')
    expect(fx).toEqual({ date: '2026-09-24', rates: { cny: 7.18, eur: 0.91, jpy: 149.5 } })
    expect(await db.getFxCache()).toEqual(fx)
  })

  it('都失败或数据不对时沿用缓存', async () => {
    await refreshFx((async () => ok(body)) as unknown as typeof fetch)
    const bad = (async () => ok({ date: 'x', usd: {} })) as unknown as typeof fetch
    expect(await refreshFx(bad)).toBeNull()
    expect(await refreshFx((async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
    await loadFx()
    expect(fxRates()?.rates.cny).toBe(7.18)
  })
})
