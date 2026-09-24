import { useRiver } from '@/lib/river'
import { currencyOf, type Currency } from '../../../shared/currency'
import type { FxRates, Settings } from '../../../shared/types'

export { fmt, signed } from '../../../shared/format'

export const netColor = (n: number) => (n > 0 ? 'text-win' : n < 0 ? 'text-lose' : 'text-muted-foreground')
export const avatarBg = (hue?: number) => (hue === undefined ? 'oklch(0.9 0.045 255)' : `oklch(0.91 0.045 ${hue})`)

export interface Money {
  currency: Currency
  // 1 美元 = rate 当前货币
  rate: number
  // 汇率来源：手动、自动（数据日期）、兜底估值
  source: 'manual' | 'auto' | 'approx'
  date?: string
}

// 手动汇率优先，其次自动拉到的，都没有时用内置估值
export function resolveMoney(s: Pick<Settings, 'currency' | 'fxRate'>, fx: FxRates | null): Money {
  const c = currencyOf(s.currency)
  if (c.code === 'usd') return { currency: 'usd', rate: 1, source: 'auto' }
  if (s.fxRate) return { currency: c.code, rate: s.fxRate, source: 'manual' }
  const r = fx?.rates[c.code]
  return r ? { currency: c.code, rate: r, source: 'auto', date: fx!.date } : { currency: c.code, rate: c.approx, source: 'approx' }
}

export const rateText = (r: number) => String(Number(r.toFixed(4)))

// 价格源是美元，显示时换算成所选货币
export function money(usd: number, m: Money) {
  const v = usd * m.rate
  return currencyOf(m.currency).symbol + (v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4))
}

export const useMoney = (): Money => {
  const currency = useRiver((s) => s.settings.currency)
  const fxRate = useRiver((s) => s.settings.fxRate)
  const fx = useRiver((s) => s.fx)
  return resolveMoney({ currency, fxRate }, fx)
}

export const tokens = (x: number) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : String(Math.round(x)))

// 有价格的部分折算成花费；没有价格的 token 单独列出（discussion §6）
export function costText(c: { usd: number; tokens: number; unpriced: number }, m: Money) {
  const usd = (x: number) => money(x, m)
  if (c.tokens === 0) return usd(0)
  if (c.unpriced === c.tokens) return `${tokens(c.tokens)} token`
  return c.unpriced ? `${usd(c.usd)} + ${tokens(c.unpriced)} token 未计价` : usd(c.usd)
}
