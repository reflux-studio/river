import type { Card } from '../../../shared/types'

const SYM: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))
export const netColor = (n: number) => (n > 0 ? 'text-win' : n < 0 ? 'text-lose' : 'text-muted-foreground')

export const cardParts = (c: Card) => ({ r: c[0] === 'T' ? '10' : c[0], s: SYM[c[1]], red: c[1] === 'h' || c[1] === 'd' })
export const cardText = (cs: Card[]) => cs.map((c) => { const p = cardParts(c); return p.r + p.s }).join(' ')

export const avatarBg = (hue?: number) => (hue === undefined ? 'oklch(0.9 0.045 255)' : `oklch(0.91 0.045 ${hue})`)
