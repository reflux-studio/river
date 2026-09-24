// 逐函数移植自 design-source/poker.js；算法、常量、文案须与原型保持一致（test/engine.test.ts 对照验证）。

import type { Card, Street } from '../../shared/types'

export type Rng = () => number

export interface Player {
  id: string
  personaId?: string
  name: string
  isHero: boolean
  stack: number
  hole: Card[]
  bet: number
  contrib: number
  folded: boolean
  allin: boolean
  acted: boolean
  last: string
  out: boolean
  startStack: number
  handName?: string
  score?: number
}

export interface LogEntry {
  street: Street
  id?: string
  board?: boolean
  label: string
  autopilot?: boolean
}

export interface Winner { id: string; amount: number; handName: string }

export interface Game {
  hand: number
  sb: number
  bb: number
  dealer: number
  sbI: number
  bbI: number
  board: Card[]
  deck: Card[]
  log: LogEntry[]
  done: boolean
  street: Street | 'idle'
  toAct: number
  currentBet: number
  minRaise: number
  winners: Winner[] | null
  showdown: boolean
  runout: boolean
  players: Player[]
  rng: Rng
}

export interface Legal { toCall: number; canCheck: boolean; minTo: number; maxTo: number; canRaise: boolean; bet: number; stack: number }
export interface Action { type: 'fold' | 'check' | 'call' | 'raise'; to?: number }
export interface Profile { tight: number; aggr: number; bluff: number; call: number }
export interface SeatConfig { id: string; personaId?: string; name: string; isHero: boolean; stack: number }
export interface GameConfig { sb: number; bb: number; players: SeatConfig[] }

const R = '23456789TJQKA'
const FULL: Card[] = []
for (const r of R) for (const s of 'shdc') FULL.push(r + s)
const SYM: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const CAT = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺']
const shuffle = <T>(a: T[], rng: Rng): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = rng() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]] } return a }
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
export function outs(hole: Card[], board: Card[]): number | null {
  if (board.length < 3 || board.length >= 5) return null
  const known = new Set(hole.concat(board))
  const cur = looseCat(hole.concat(board))
  let n = 0
  for (const c of FULL) {
    if (known.has(c)) continue
    const nb = board.concat([c])
    const nc = looseCat(hole.concat(nb))
    if (nc > cur && nc > looseCat(nb)) n++
  }
  return n
}
export const disp = (c: Card) => ({ r: c[0] === 'T' ? '10' : c[0], s: SYM[c[1]], red: c[1] === 'h' || c[1] === 'd' })
export const txt = (c: Card) => (c[0] === 'T' ? '10' : c[0]) + SYM[c[1]]

export const canAct = (p: Player) => !p.out && !p.folded && !p.allin
export const inHand = (p: Player) => !p.out && !p.folded
function nextIdx(g: Game, i: number, pred: (p: Player) => boolean): number { const n = g.players.length; for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (pred(g.players[j])) return j } return -1 }
export const pot = (g: Game) => g.players.reduce((a, p) => a + p.contrib, 0)

// 原型在 startHand 前不设置 deck/toAct 等字段；这里给出初值只为满足类型，startHand 会全部覆盖。
export function newGame(cfg: GameConfig, rng: Rng = Math.random): Game {
  return { hand: 0, sb: cfg.sb, bb: cfg.bb, dealer: rng() * cfg.players.length | 0, sbI: -1, bbI: -1, board: [], deck: [], log: [], done: true, street: 'idle',
    toAct: -1, currentBet: 0, minRaise: cfg.bb, winners: null, showdown: false, runout: false, rng,
    players: cfg.players.map(p => Object.assign({ hole: [], bet: 0, contrib: 0, folded: false, allin: false, acted: false, last: '', out: false, startStack: p.stack }, p)) }
}
function put(p: Player, amt: number): number { amt = Math.min(amt, p.stack); p.stack -= amt; p.bet += amt; p.contrib += amt; if (p.stack === 0) p.allin = true; return amt }
export function startHand(g: Game): void {
  g.hand++; g.deck = shuffle(FULL.slice(), g.rng); g.board = []; g.log = []; g.done = false; g.winners = null; g.showdown = false; g.runout = false
  g.players.forEach(p => { Object.assign(p, { hole: [], bet: 0, contrib: 0, folded: false, allin: false, acted: false, last: '', handName: '', out: p.stack <= 0, startStack: p.stack }) })
  const live = g.players.filter(p => !p.out).length
  g.dealer = nextIdx(g, g.dealer, p => !p.out)
  let sbI: number, bbI: number
  if (live === 2) { sbI = g.dealer; bbI = nextIdx(g, sbI, p => !p.out) }
  else { sbI = nextIdx(g, g.dealer, p => !p.out); bbI = nextIdx(g, sbI, p => !p.out) }
  g.sbI = sbI; g.bbI = bbI
  put(g.players[sbI], g.sb); g.players[sbI].last = '小盲 ' + g.players[sbI].bet
  put(g.players[bbI], g.bb); g.players[bbI].last = '大盲 ' + g.players[bbI].bet
  g.log.push({ street: 'preflop', id: g.players[sbI].id, label: '小盲 ' + g.sb }, { street: 'preflop', id: g.players[bbI].id, label: '大盲 ' + g.bb })
  for (let r = 0; r < 2; r++) g.players.forEach(p => { if (!p.out) p.hole.push(g.deck.pop()!) })
  g.street = 'preflop'; g.currentBet = g.bb; g.minRaise = g.bb
  g.toAct = nextIdx(g, bbI, canAct)
  if (g.toAct === -1 || g.players.filter(canAct).length === 0) { g.toAct = -1; g.runout = true }
}
export function legal(g: Game, i: number): Legal {
  const p = g.players[i]
  const toCall = Math.min(Math.max(0, g.currentBet - p.bet), p.stack)
  const maxTo = p.bet + p.stack
  const others = g.players.some((q, j) => j !== i && canAct(q))
  const canRaise = p.stack > toCall && others
  const minTo = Math.min(g.currentBet + g.minRaise, maxTo)
  return { toCall, canCheck: toCall === 0, minTo, maxTo, canRaise, bet: p.bet, stack: p.stack }
}
export function apply(g: Game, i: number, a: Action): string {
  const p = g.players[i]
  const L = legal(g, i)
  let type = a.type, label: string
  if (type === 'check' && L.toCall > 0) type = 'call'
  if (type === 'raise' && !L.canRaise) type = L.toCall > 0 ? 'call' : 'check'
  if (type === 'fold') { p.folded = true; label = '弃牌' }
  else if (type === 'check') { label = '过牌' }
  else if (type === 'call') { const amt = put(p, L.toCall); label = p.allin ? '全下 ' + fmt(p.bet) : '跟注 ' + fmt(amt) }
  else {
    const to = Math.round(Math.max(L.minTo, Math.min(L.maxTo, a.to || L.minTo)))
    if (to <= g.currentBet) { const amt = put(p, L.toCall); label = p.allin ? '全下 ' + fmt(p.bet) : '跟注 ' + fmt(amt) }
    else {
      const wasBet = g.currentBet === 0
      const inc = to - g.currentBet
      if (inc >= g.minRaise) g.minRaise = inc
      g.currentBet = to
      put(p, to - p.bet)
      g.players.forEach((q, j) => { if (j !== i) q.acted = false })
      label = p.allin ? '全下 ' + fmt(p.bet) : (wasBet ? '下注 ' : '加注至 ') + fmt(to)
    }
  }
  p.acted = true; p.last = label
  g.log.push({ street: g.street as Street, id: p.id, label })
  progress(g)
  return label
}
export function dealStreet(g: Game): void {
  g.deck.pop()
  if (g.board.length === 0) { g.board.push(g.deck.pop()!, g.deck.pop()!, g.deck.pop()!); g.street = 'flop' }
  else { g.board.push(g.deck.pop()!); g.street = g.board.length === 4 ? 'turn' : 'river' }
  g.log.push({ street: g.street, board: true, label: g.board.map(txt).join(' ') })
}
export function progress(g: Game): void {
  const live = g.players.filter(inHand)
  if (live.length === 1) { const w = live[0]; const amt = pot(g); w.stack += amt; g.winners = [{ id: w.id, amount: amt, handName: '' }]; g.done = true; g.toAct = -1; g.players.forEach(p => (p.bet = 0)); return }
  const actors = g.players.filter(canAct)
  const done = actors.every(p => p.acted && p.bet === g.currentBet)
  if (!done) { g.toAct = nextIdx(g, g.toAct, p => canAct(p) && (!p.acted || p.bet < g.currentBet)); return }
  g.players.forEach(p => { p.bet = 0; p.acted = false; if (!p.folded && !p.allin) p.last = '' })
  g.currentBet = 0; g.minRaise = g.bb
  if (g.street === 'river') return showdown(g)
  if (actors.length <= 1) { g.runout = true; g.toAct = -1; return }
  dealStreet(g)
  g.toAct = nextIdx(g, g.dealer, canAct)
}
export function runoutStep(g: Game): void { if (g.board.length < 5) dealStreet(g); else showdown(g) }
export function showdown(g: Game): void {
  g.street = 'showdown'; g.runout = false; g.toAct = -1
  const live = g.players.filter(inHand)
  live.forEach(p => { p.score = best(p.hole.concat(g.board)); p.handName = handName(p.hole.concat(g.board)) })
  const levels = [...new Set(g.players.map(p => p.contrib).filter(x => x > 0))].sort((a, b) => a - b)
  const won: Record<string, number> = {}
  let prev = 0
  for (const lvl of levels) {
    const amount = g.players.reduce((a, p) => a + Math.max(0, Math.min(p.contrib, lvl) - prev), 0)
    let elig = live.filter(p => p.contrib >= lvl)
    if (!elig.length) elig = live
    const top = Math.max(...elig.map(p => p.score!))
    const ws = elig.filter(p => p.score === top)
    const share = Math.floor(amount / ws.length)
    ws.forEach((p, k) => (won[p.id] = (won[p.id] || 0) + share + (k === 0 ? amount - share * ws.length : 0)))
    prev = lvl
  }
  g.winners = Object.keys(won).map(id => { const p = g.players.find(x => x.id === id)!; p.stack += won[id]; return { id, amount: won[id], handName: p.handName! } })
  g.showdown = live.length > 1; g.done = true
}
export function decide(g: Game, i: number, pp: Profile, rng: Rng = g.rng): Action {
  const p = g.players[i]
  const L = legal(g, i)
  const opp = g.players.filter((q, j) => j !== i && inHand(q)).length
  const eq = equity(p.hole, g.board, opp, 160, rng)
  const rel = eq * (opp + 1)
  const total = pot(g)
  const r = rng()
  const sizeTo = (f: number) => { const to = g.currentBet + Math.round(((total + L.toCall) * f) / g.bb) * g.bb; return Math.max(L.minTo, Math.min(L.maxTo, to)) }
  if (L.toCall === 0) {
    if (L.canRaise && ((rel > 1.5 - pp.aggr * 0.4 && r < 0.55 + pp.aggr * 0.4) || r < pp.bluff * 0.22)) return { type: 'raise', to: sizeTo(0.5 + pp.aggr * 0.3) }
    return { type: 'check' }
  }
  const odds = L.toCall / (total + L.toCall)
  if (L.canRaise && rel > 2 - pp.aggr * 0.5 && r < 0.3 + pp.aggr * 0.5) return { type: 'raise', to: sizeTo(0.7 + pp.aggr * 0.3) }
  if (rel > 1.6) return { type: 'call' }
  let ok: boolean
  if (g.street === 'preflop') { const cheap = L.toCall <= g.bb; ok = rel >= (cheap ? 0.85 : 1.05) + pp.tight * 0.55 - pp.call * 0.45 }
  else ok = eq >= odds * (1 + pp.tight * 0.5) - pp.call * 0.1
  if (ok) return { type: 'call' }
  if (L.canRaise && r < pp.bluff * 0.07) return { type: 'raise', to: sizeTo(0.8) }
  return { type: 'fold' }
}
export function fmt(n: number): string { return Math.round(n).toLocaleString('en-US') }
