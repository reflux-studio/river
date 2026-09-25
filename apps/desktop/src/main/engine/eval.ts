// 牌型评估与概率：逐函数移植自原型 design-source/poker.js（与原型对照测试见 test/engine.test.ts）

import type { Card } from '../../shared/types'

export type Rng = () => number

const R = '23456789TJQKA'
export const FULL: Card[] = []
for (const r of R) for (const s of 'shdc') FULL.push(r + s)
const CAT = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺']
export const shuffle = <T>(a: T[], rng: Rng): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = rng() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]] } return a }
const rv = (c: Card) => R.indexOf(c[0]) + 2
const combCache: Record<number, number[][]> = {}
function combos(n: number): number[][] {
  if (combCache[n]) return combCache[n]
  const out: number[][] = []
  const rec = (start: number, cur: number[]) => { if (cur.length === 5) { out.push(cur.slice()); return } for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop() } }
  rec(0, [])
  return (combCache[n] = out)
}
function eval5(cs: Card[]): number {
  const v = cs.map(rv).sort((a, b) => b - a)
  const flush = cs.every(c => c[1] === cs[0][1])
  let sh = 0
  if (new Set(v).size === 5) { if (v[0] - v[4] === 4) sh = v[0]; else if (v[0] === 14 && v[1] === 5) sh = 5 }
  const cnt: Record<number, number> = {}
  v.forEach(x => (cnt[x] = (cnt[x] || 0) + 1))
  const g = Object.keys(cnt).map(k => [cnt[+k], +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1])
  let cat: number, rk: number[]
  if (sh && flush) { cat = 8; rk = [sh] }
  else if (g[0][0] === 4) { cat = 7; rk = [g[0][1], g[1][1]] }
  else if (g[0][0] === 3 && g[1][0] === 2) { cat = 6; rk = [g[0][1], g[1][1]] }
  else if (flush) { cat = 5; rk = v }
  else if (sh) { cat = 4; rk = [sh] }
  else if (g[0][0] === 3) { cat = 3; rk = g.map(x => x[1]) }
  else if (g[0][0] === 2 && g[1][0] === 2) { cat = 2; rk = g.map(x => x[1]) }
  else if (g[0][0] === 2) { cat = 1; rk = g.map(x => x[1]) }
  else { cat = 0; rk = v }
  let s = cat
  for (let i = 0; i < 5; i++) s = s * 15 + (rk[i] || 0)
  return s
}
export function best(cs: Card[]): number {
  if (cs.length < 5) return -1
  let b = -1
  for (const ix of combos(cs.length)) { const s = eval5(ix.map(i => cs[i])); if (s > b) b = s }
  return b
}
const catOf = (s: number) => Math.floor(s / 759375)
export function handName(cs: Card[]): string {
  if (cs.length < 5) return cs[0][0] === cs[1][0] ? '口袋对子' : (cs[0][1] === cs[1][1] ? '同花底牌' : '高牌')
  const s = best(cs), c = catOf(s)
  if (c === 8 && Math.floor(s / 50625) % 15 === 14) return '皇家同花顺'
  return CAT[c]
}
function looseCat(cards: Card[]): number {
  if (cards.length >= 5) return catOf(best(cards))
  const cnt: Record<string, number> = {}
  cards.forEach(c => (cnt[c[0]] = (cnt[c[0]] || 0) + 1))
  const v = Object.values(cnt).sort((a, b) => b - a)
  if (v[0] === 4) return 7; if (v[0] === 3) return 3; if (v[0] === 2 && v[1] === 2) return 2; if (v[0] === 2) return 1; return 0
}
export function equity(hole: Card[], board: Card[], nOpp: number, iters?: number, rng: Rng = Math.random): number {
  if (nOpp <= 0) return 1
  iters = iters || 300
  const known = new Set(hole.concat(board))
  const rest = FULL.filter(c => !known.has(c))
  const need = 2 * nOpp + (5 - board.length)
  let win = 0
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < need; i++) { const j = i + (rng() * (rest.length - i) | 0); const t = rest[i]; rest[i] = rest[j]; rest[j] = t }
    const b = board.concat(rest.slice(2 * nOpp, need))
    const my = best(hole.concat(b))
    let lose = false, ties = 0
    for (let o = 0; o < nOpp; o++) { const s = best([rest[2 * o], rest[2 * o + 1]].concat(b)); if (s > my) { lose = true; break } if (s === my) ties++ }
    if (!lose) win += 1 / (1 + ties)
  }
  return win / iters
}
// 改进牌：下一张能让「我的牌型大类」领先「公共牌自身牌型大类」更多的牌；只让公共牌和我一起变强的牌不算
export function outs(hole: Card[], board: Card[]): number | null {
  if (board.length < 3 || board.length >= 5) return null
  const known = new Set(hole.concat(board))
  const rel = (b: Card[]) => looseCat(hole.concat(b)) - looseCat(b)
  const cur = rel(board)
  let n = 0
  for (const c of FULL) if (!known.has(c) && rel(board.concat([c])) > cur) n++
  return n
}
