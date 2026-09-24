// 信息隔离的唯一出口：agent 能看到的牌局与手牌记录都经这里裁剪，T5 不另行拼装。
import { personaOf, STREET } from '../../shared/personas'
import type { Card, ChatMessage, HandPlayer, HandRecord, Street } from '../../shared/types'
import { cardsText as cards, fmt, signed } from '../../shared/format'
import { legal, pot, type Game } from '../engine/poker'

export interface SeatView {
  street: Street
  sb: number
  bb: number
  handNo: number
  myCards: Card[]
  board: Card[]
  pot: number
  toCall: number
  myStack: number
  options: string[]
  minTo: number
  maxTo: number
  canRaise: boolean
  players: { seat: number; name: string; tag: string; stack: number; bet: number; folded: boolean; allin: boolean; out: boolean; isYou: boolean }[]
  actions: string[]
}

export interface TableQuery {
  viewFor(seat: number): SeatView
  chat(limit: number): ChatMessage[]
  equityFor(seat: number, iters: number): { eq: number; need: number; outs: number | null; handName: string; sugg?: string }
}

export function buildSeatView(g: Game, seat: number): SeatView {
  const nameOf = (id?: string) => g.players.find((p) => p.id === id)?.name ?? ''
  const me = g.players[seat]
  const L = legal(g, seat)
  const options = L.toCall === 0 ? ['check'] : ['fold', `call ${L.toCall}`]
  if (L.canRaise) options.push(`raise ${L.minTo}~${L.maxTo}`)
  return {
    street: g.street as Street,
    sb: g.sb,
    bb: g.bb,
    handNo: g.hand,
    myCards: me.hole.slice(),
    board: g.board.slice(),
    pot: pot(g),
    toCall: L.toCall,
    myStack: me.stack,
    options,
    minTo: L.minTo,
    maxTo: L.maxTo,
    canRaise: L.canRaise,
    players: g.players.map((p, i) => ({
      seat: i, name: p.name, tag: personaOf(p.personaId)?.tag ?? '', stack: p.stack, bet: p.bet, folded: p.folded, allin: p.allin, out: p.out, isYou: i === seat
    })),
    actions: g.log.map((x) => (x.board ? `【${STREET[x.street]} ${x.label}】` : `${nameOf(x.id)} ${x.label}`))
  }
}

// 玩家（hero）的 hole 在记录里恒非空（供回放），是否亮过牌只能按“摊牌且未弃牌”判断
const shown = (rec: HandRecord, p: HandPlayer) => rec.showdown && !p.folded && p.hole !== null

export function publicHandResult(rec: HandRecord, forPersonaId: string): string {
  const name = (p: HandPlayer) => (p.personaId === forPersonaId ? '你' : p.personaId ? p.name : '玩家')
  const parts = [`第 ${rec.hand} 手结束：${rec.showdown ? '摊牌' : '未摊牌'}`]
  if (rec.board.length) parts.push(`公共牌 ${cards(rec.board)}`)
  for (const p of rec.players) if (shown(rec, p)) parts.push(`${name(p)}亮出 ${cards(p.hole!)}${p.handName ? `（${p.handName}）` : ''}`)
  for (const p of rec.players) if (p.won > 0) parts.push(`${name(p)}赢得 ${fmt(p.won)}`)
  const me = rec.players.find((p) => p.personaId === forPersonaId)
  return parts.join('，') + (me ? `；你本手 ${signed(me.net)}` : '')
}

// 教练视角：玩家自己的底牌可见，对手底牌仍只含摊牌亮出的
export function heroHandSummary(rec: HandRecord): string {
  const log = rec.log.map((x) => (x.board ? `【${STREET[x.street]} ${x.label}】` : `${x.name}${x.label}`)).join('，')
  const opp = rec.players.filter((p) => p.personaId && shown(rec, p)).map((p) => `${p.name} ${cards(p.hole!)}`).join('；')
  return `第 ${rec.hand} 手，盲注 ${rec.sb}/${rec.bb}\n玩家底牌：${cards(rec.hero)}\n公共牌：${cards(rec.board) || '无'}\n行动：${log}\n结果：玩家${rec.net >= 0 ? '赢' : '输'} ${fmt(Math.abs(rec.net))}\n摊牌：${opp || '无'}`
}
