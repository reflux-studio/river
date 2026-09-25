import type { Card } from './types'

export { fmt, signed } from '@river/engine'

const SYM: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

export const disp = (c: Card) => ({ r: c[0] === 'T' ? '10' : c[0], s: SYM[c[1]], red: c[1] === 'h' || c[1] === 'd' })
export const txt = (c: Card) => (c[0] === 'T' ? '10' : c[0]) + SYM[c[1]]
export const cardsText = (cs: Card[]) => cs.map(txt).join(' ')
