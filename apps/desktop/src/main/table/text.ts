// agent 能看到的文字与落库的手牌记录都从这里生成：信息隔离在此处裁剪（对手只见公开信息，教练只见玩家视角）
import { cardsText as cards, fmt, signed } from '../../shared/format'
import { dict } from '@river/i18n'
import { settingsCache } from '../db'
import type { ChatMessage, HandLogEntry, HandRecord, Mode } from '../../shared/types'
import { handCat, type LogEntry, type Table } from '@river/engine'

export interface SeatInfo {
  id: string
  personaId?: string
  name: string
  tag: string
}

const tr = () => dict(settingsCache.locale)

// 一条行动的文案；blinds 用于区分大小盲
export function label(e: Extract<LogEntry, { seat: number }>, blinds: { sb: number; bb: number }): string {
  const { act, pos } = tr().poker
  switch (e.type) {
    case 'blind':
      return (e.seat === blinds.sb && e.seat !== blinds.bb ? pos.sb : pos.bb) + ' ' + fmt(e.amount)
    case 'fold':
      return act.fold
    case 'check':
      return act.check
    case 'call':
      return e.allIn ? act.allin + ' ' + fmt(e.to ?? e.amount) : act.call + ' ' + fmt(e.amount)
    case 'bet':
      return (e.allIn ? act.allin : act.bet) + ' ' + fmt(e.to!)
    case 'raise':
      return (e.allIn ? act.allin : act.raiseTo) + ' ' + fmt(e.to!)
    case 'return':
      return tr().desktop.table.returned + ' ' + fmt(e.amount)
  }
}

// 同一手里大小盲按记录顺序区分：第一条盲注是小盲
function blindsOf(log: LogEntry[]) {
  const b = log.filter((e): e is Extract<LogEntry, { seat: number }> => 'seat' in e && e.type === 'blind')
  return { sb: b[0]?.seat ?? -1, bb: b[1]?.seat ?? -1 }
}

// 本手在座者按行动顺序（小盲起、按钮收尾）排列，并给出位置名；弃牌的人仍占位置
export function positions(t: Table): { seat: number; pos: string }[] {
  const st = t.seats()
  const btn = t.button()
  const { sb, bb } = t.blindSeats()
  const order = st.map((_, j) => (sb + j) % st.length).filter((i) => st[i] && !st[i]!.out)
  const mid = order.filter((i) => i !== sb && i !== bb && i !== btn)
  const P = tr().poker.pos
  const name = (i: number) =>
    i === btn ? (i === sb ? P.btnSb : P.btn) : i === sb ? P.sb : i === bb ? P.bb : mid.indexOf(i) === 0 ? P.utg : mid.indexOf(i) === mid.length - 1 ? P.co : P.mp
  return order.map((seat) => ({ seat, pos: name(seat) }))
}

export function logLines(t: Table, seats: SeatInfo[], you?: number) {
  const log = t.handLog()
  const bl = blindsOf(log)
  const d = tr()
  return log.map((e) => ('board' in e ? d.desktop.model.street(d.poker.street[e.street], cards(e.board)) : `${e.seat === you ? d.desktop.table.you : seats[e.seat].name} ${label(e, bl)}`))
}

// 某座位视角的局面（对手决策、教练讲解共用）；只含该座位自己的底牌
export function situation(
  t: Table,
  seats: SeatInfo[],
  seat: number,
  o: { chat?: ChatMessage[]; you?: boolean } = {}
) {
  const d = tr()
  const M = d.desktop.model
  // 座位 0 的显示名是「你」（玩家界面用）；写给模型时一律称「玩家」，「你」只留给观察者自己
  seats = seats.map((x, i) => (i === 0 ? { ...x, name: M.player } : x))
  const me = t.seats()[seat]!
  const hole = t.holeCards()[seat] ?? []
  const L = t.isBettingRoundInProgress() && t.playerToAct() === seat ? t.legalActions() : null
  const you = o.you !== false
  const who = (i: number) => (i === seat ? (you ? d.desktop.table.you : M.player) : seats[i].name)
  const st = t.seats()
  const pos = positions(t)
  const players = pos.map(({ seat: i, pos: p }) => {
    const s = st[i]!
    const tags = [s.folded && M.folded, s.allIn && M.allin, s.bet && M.betRound(fmt(s.bet)), s.totalIn && M.inHand(fmt(s.totalIn))]
      .filter(Boolean)
      .join(M.sep)
    const tag = [p, i !== seat && seats[i].tag].filter(Boolean).join(M.sep)
    return M.seat(who(i), tag, fmt(s.stack), tags)
  })
  const opts = L
    ? [
        L.toCall === 0 ? M.optCheck : M.optCall(fmt(L.toCall)),
        ...(L.chipRange ? [M.optRaise(t.currentBet() === 0, fmt(L.chipRange.min), fmt(L.chipRange.max))] : [])
      ].join(M.optSep)
    : M.notTurn(you)
  const { smallBlind, bigBlind } = t.stakes()
  const board = t.communityCards()
  const pot = t.totalPot()
  const toCall = L?.toCall ?? Math.max(0, t.currentBet() - me.bet)
  const lines = [
    M.head(smallBlind, bigBlind, seats.length, t.handNumber(), d.poker.street[t.roundOfBetting()]),
    M.me(you, String(pos.find((x) => x.seat === seat)?.pos), cards(hole), hole.length ? d.poker.hand[handCat(hole.concat(board))] : '—'),
    M.board(cards(board) || M.none),
    M.pot(fmt(pot), fmt(toCall), toCall > 0 && !me.folded && !me.allIn ? ((toCall / (pot + toCall)) * 100).toFixed(1) : '', fmt(me.stack)),
    M.opts(opts),
    M.seats(players.join('\n')),
    M.actions(logLines(t, seats, you ? seat : undefined).join(M.sep))
  ]
  if (o.chat?.length) lines.push(chatBlock(o.chat, seats))
  return lines.join('\n')
}

export function chatBlock(chat: ChatMessage[], seats: SeatInfo[]) {
  const M = tr().desktop.model
  return M.chat(chat.map((m) => M.chatLine(speaker(m, seats), [m.act, m.text].filter(Boolean).join(M.sep))).join('\n'))
}

function speaker(m: ChatMessage, seats: SeatInfo[]) {
  const M = tr().desktop.model
  if (m.kind === 'sys') return M.system
  return m.from === 'hero' ? M.player : (seats.find((s) => s.personaId === m.from)?.name ?? M.unknown)
}

// 玩家（hero）的 hole 在记录里恒非空；是否亮过牌只能按“摊牌且未弃牌”判断
const shown = (rec: HandRecord, p: HandRecord['players'][number]) => rec.showdown && !p.folded && p.hole !== null

// 对手读到的上一手结果：只含公开信息（不读 holeAfter）
export function publicHandResult(rec: HandRecord, forPersonaId: string): string {
  const d = tr()
  const M = d.desktop.model
  const name = (p: HandRecord['players'][number]) => (p.personaId === forPersonaId ? d.desktop.table.you : p.personaId ? p.name : M.player)
  const parts = [M.handHead(rec.hand, rec.showdown)]
  if (rec.board.length) parts.push(M.boardShort(cards(rec.board)))
  for (const p of rec.players) if (shown(rec, p) && p.id !== 'hero') parts.push(M.showed(name(p), cards(p.hole!), p.handName))
  const hero = rec.players.find((p) => p.id === 'hero')
  if (hero && shown(rec, hero)) parts.push(M.showed(M.player, cards(hero.hole!), ''))
  for (const p of rec.players) if (p.won > 0) parts.push(M.seatWon(name(p), fmt(p.won)))
  const me = rec.players.find((p) => p.personaId === forPersonaId)
  return parts.join(M.sep) + (me ? M.youNet(signed(me.net)) : '')
}

// 对手的往手摘要：位置、公开行动线与公开结果；不读 holeAfter。「你」只指该对手，玩家称「玩家」
export function opponentSummary(rec: HandRecord, forPersonaId: string): string {
  const d = tr()
  const M = d.desktop.model
  const you = d.desktop.table.you
  const me = rec.players.find((p) => p.personaId === forPersonaId)
  const nameOf = (name: string, seat?: number) => (seat === 0 || name === you ? M.player : name === me?.name ? you : name)
  const pos = rec.players.filter((p) => p.pos).map((p) => M.posOf(p.personaId ? nameOf(p.name) : M.player, p.pos!)).join(M.sep)
  const log = rec.log.map((x) => (x.board ? M.street(d.poker.street[x.street], x.label) : M.did(nameOf(x.name, x.seat), x.label))).join(M.sep)
  return [M.blinds(rec.sb, rec.bb), ...(pos ? [M.posList(pos)] : []), M.actionList(log), publicHandResult(rec, forPersonaId)].join('\n')
}

// 教练复盘用：玩家底牌可见；教练局一手结束亮出的全部底牌此时玩家也看得到，一并给出
export function heroHandSummary(rec: HandRecord): string {
  const d = tr()
  const M = d.desktop.model
  const log = rec.log.map((x) => (x.board ? M.street(d.poker.street[x.street], x.label) : M.did(x.seat === 0 || x.name === d.desktop.table.you ? M.player : x.name, x.label))).join(M.sep)
  const seatsLine = rec.players.filter((p) => p.pos).map((p) => M.posOf(p.personaId ? p.name : M.player, p.pos!)).join(M.sep)
  const opp = rec.players
    .filter((p) => p.personaId)
    .map((p) => {
      const c = p.holeAfter ?? (shown(rec, p) ? p.hole : null)
      return c ? `${p.name} ${cards(c)}${p.folded ? M.foldedMark : ''}` : ''
    })
    .filter(Boolean)
    .join(M.semi)
  return [
    M.heroHead(rec.hand, rec.sb, rec.bb),
    ...(seatsLine ? [M.posList(seatsLine)] : []),
    M.heroHole(cards(rec.hero)),
    M.board(cards(rec.board) || M.none),
    M.actionList(log),
    M.result(rec.net >= 0, fmt(Math.abs(rec.net))),
    M.revealed(rec.mode === 'coach', opp || M.none)
  ].join('\n')
}

// 一手结束后生成落库记录
export function handRecord(t: Table, seats: SeatInfo[], mode: Mode, stakes: { sb: number; bb: number }, handName: (seat: number) => string): HandRecord {
  const st = t.seats()
  const holes = t.holeCards()
  const log = t.handLog()
  const bl = blindsOf(log)
  const pos = new Map(positions(t).map((x) => [x.seat, x.pos]))
  const showdown = t.roundOfBetting() === 'showdown'
  const won = new Map<number, number>()
  for (const w of t.winners()) won.set(w.seat, (won.get(w.seat) ?? 0) + w.amount)
  const entries: HandLogEntry[] = log.map((e) =>
    'board' in e
      ? { street: e.street, board: true, name: '', label: cards(e.board), cards: e.board }
      : { street: e.street, board: false, name: seats[e.seat].name, label: label(e, bl), seat: e.seat, type: e.type, amount: e.amount, ...(e.to !== undefined && { to: e.to }), allIn: e.allIn }
  )
  const pre = log.filter((e): e is Extract<LogEntry, { seat: number }> => 'seat' in e && e.seat === 0 && e.street === 'preflop')
  const hero = st[0]!
  return {
    hand: t.handNumber(),
    sb: stakes.sb,
    bb: stakes.bb,
    mode,
    net: hero.stack - hero.startStack,
    pot: t.totalPot(),
    showdown,
    hero: holes[0] ?? [],
    board: t.communityCards(),
    players: st.flatMap((s, i) => {
      if (!s || s.out) return []
      const h = holes[i] ?? []
      return [{
        id: seats[i].id,
        ...(seats[i].personaId && { personaId: seats[i].personaId }),
        name: seats[i].name,
        pos: pos.get(i),
        hole: i === 0 || (showdown && !s.folded) ? h : null,
        ...(mode === 'coach' && { holeAfter: h }),
        folded: s.folded,
        handName: showdown && !s.folded ? handName(i) : '',
        won: won.get(i) ?? 0,
        net: s.stack - s.startStack
      }]
    }),
    log: entries,
    vpip: pre.some((e) => e.type === 'call' || e.type === 'bet' || e.type === 'raise'),
    pfr: pre.some((e) => e.type === 'raise' || e.type === 'bet')
  }
}
