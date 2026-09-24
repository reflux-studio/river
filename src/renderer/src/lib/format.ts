import { useRiver } from '@/lib/river'
import type { Settings } from '../../../shared/types'

export { fmt, signed } from '../../../shared/format'

export const netColor = (n: number) => (n > 0 ? 'text-win' : n < 0 ? 'text-lose' : 'text-muted-foreground')
export const avatarBg = (hue?: number) => (hue === undefined ? 'oklch(0.9 0.045 255)' : `oklch(0.91 0.045 ${hue})`)

export type Money = Pick<Settings, 'currency' | 'usdCny'>

// 价格源是美元；显示时按设置换算成人民币或保持美元
export function money(usd: number, m: Money) {
  const v = m.currency === 'CNY' ? usd * m.usdCny : usd
  return (m.currency === 'CNY' ? '¥' : '$') + (v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4))
}

export const useMoney = (): Money => {
  const currency = useRiver((s) => s.settings.currency)
  const usdCny = useRiver((s) => s.settings.usdCny)
  return { currency, usdCny }
}

export const tokens = (x: number) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : String(Math.round(x)))

// 有价格的部分折算成花费；没有价格的 token 单独列出（discussion §6）
export function costText(c: { usd: number; tokens: number; unpriced: number }, m: Money) {
  const usd = (x: number) => money(x, m)
  if (c.tokens === 0) return usd(0)
  if (c.unpriced === c.tokens) return `${tokens(c.tokens)} token`
  return c.unpriced ? `${usd(c.usd)} + ${tokens(c.unpriced)} token 未计价` : usd(c.usd)
}
