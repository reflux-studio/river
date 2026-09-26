// 汇率来自 fawazahmed0/exchange-api：每日更新，以美元为基准。主地址走 jsDelivr，失败时按项目文档换 Cloudflare 备用地址
import { CURRENCIES } from '../../shared/currency'
import type { FxRates } from '../../shared/types'
import { getFxCache, setFxCache } from '../db'

const URLS = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
  'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json'
]

let current: FxRates | null = null

export const fxRates = () => current

export async function loadFx() {
  current = await getFxCache()
}

// 启动后刷新一次；都失败时沿用缓存，返回 null
export async function refreshFx(fetchFn: typeof fetch = fetch): Promise<FxRates | null> {
  for (const url of URLS) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) continue
      const j = (await res.json()) as { date?: string; usd?: Record<string, unknown> }
      const rates: FxRates['rates'] = {}
      for (const { code } of CURRENCIES) {
        const r = j.usd?.[code]
        if (typeof r === 'number' && r > 0) rates[code] = r
      }
      if (!rates.cny) continue
      current = { date: String(j.date ?? ''), rates }
      await setFxCache(current)
      return current
    } catch {
      // 换下一个地址
    }
  }
  return null
}
