export { cardsText, disp, fmt, signed } from '../../../shared/format'

export const netColor = (n: number) => (n > 0 ? 'text-win' : n < 0 ? 'text-lose' : 'text-muted-foreground')
export const avatarBg = (hue?: number) => (hue === undefined ? 'oklch(0.9 0.045 255)' : `oklch(0.91 0.045 ${hue})`)

export const usd = (c: number) => '$' + (c >= 1 ? c.toFixed(2) : c >= 0.01 ? c.toFixed(3) : c.toFixed(4))
export const tokens = (x: number) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : String(Math.round(x)))

// 有价格的部分算美元；没有价格的 token 单独列出（discussion §6）
export function costText(c: { usd: number; tokens: number; unpriced: number }) {
  if (c.unpriced === c.tokens) return `${tokens(c.tokens)} token`
  return c.unpriced ? `${usd(c.usd)} + ${tokens(c.unpriced)} token 未计价` : usd(c.usd)
}
