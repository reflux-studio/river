// 演示桌的启发式出牌，移植自 river-desktop/design-source/poker.js 的 decide，改用 engine 的 legalActions 与 equity
import { equity, type ActionType, type Rng, type Table } from '@river/engine'

export interface Persona {
  tight: number
  aggr: number
  bluff: number
  call: number
}

// 取自设计稿 river-site.js 的 PERSONAS[].p，按预设 id 对应
export const PERSONA: Record<string, Persona> = {
  li: { tight: 0.2, aggr: 0.9, bluff: 0.7, call: 0.3 },
  k: { tight: 0.8, aggr: 0.7, bluff: 0.15, call: 0.1 },
  bai: { tight: 0.1, aggr: 0.2, bluff: 0.1, call: 0.9 },
  prof: { tight: 0.55, aggr: 0.55, bluff: 0.35, call: 0.3 },
  rock: { tight: 0.95, aggr: 0.4, bluff: 0.02, call: 0.1 },
  may: { tight: 0.4, aggr: 0.6, bluff: 0.4, call: 0.5 },
  cow: { tight: 0.3, aggr: 0.8, bluff: 0.5, call: 0.6 },
  zen: { tight: 0.6, aggr: 0.35, bluff: 0.2, call: 0.5 }
}

export function decide(t: Table, pp: Persona, rng: Rng = Math.random): { type: ActionType; to?: number } {
  const i = t.playerToAct()
  const L = t.legalActions()
  const seats = t.seats()
  const opp = seats.filter((s, j) => j !== i && s && !s.out && !s.folded).length
  const eq = equity(t.holeCards()[i]!, t.communityCards(), opp, 160, rng)
  const rel = eq * (opp + 1)
  const total = t.totalPot()
  const bb = t.stakes().bigBlind
  const r = rng()
  const range = L.chipRange
  const raiseType: ActionType = L.actions.includes('bet') ? 'bet' : 'raise'
  const raise = (f: number) => ({
    type: raiseType,
    to: Math.max(range!.min, Math.min(range!.max, t.currentBet() + Math.round(((total + L.toCall) * f) / bb) * bb))
  })
  if (L.toCall === 0) {
    if (range && ((rel > 1.5 - pp.aggr * 0.4 && r < 0.55 + pp.aggr * 0.4) || r < pp.bluff * 0.22)) return raise(0.5 + pp.aggr * 0.3)
    return { type: 'check' }
  }
  const odds = L.toCall / (total + L.toCall)
  if (range && rel > 2 - pp.aggr * 0.5 && r < 0.3 + pp.aggr * 0.5) return raise(0.7 + pp.aggr * 0.3)
  if (rel > 1.6) return { type: 'call' }
  const ok = t.roundOfBetting() === 'preflop'
    ? rel >= (L.toCall <= bb ? 0.85 : 1.05) + pp.tight * 0.55 - pp.call * 0.45
    : eq >= odds * (1 + pp.tight * 0.5) - pp.call * 0.1
  if (ok) return { type: 'call' }
  if (range && r < pp.bluff * 0.07) return raise(0.8)
  return { type: 'fold' }
}
