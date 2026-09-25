// agent 能看到的文字与落库的手牌记录都从这里生成：信息隔离在此处裁剪（对手只见公开信息，教练只见玩家视角）
import { cardsText as cards, fmt, signed } from '../../shared/format'
import { dict } from '@river/i18n'
import type { ChatMessage, HandLogEntry, HandRecord, Mode } from '../../shared/types'
import { handName, type LogEntry, type Table } from '@river/engine'

export interface SeatInfo {
  id: string
  personaId?: string
  name: string
  tag: string
}

// 一条行动的中文文案；blinds 用于区分大小盲
export function label(e: Extract<LogEntry, { seat: number }>, blinds: { sb: number; bb: number }): string {
  switch (e.type) {
    case 'blind':
      return (e.seat === blinds.sb && e.seat !== blinds.bb ? '小盲 ' : '大盲 ') + fmt(e.amount)
    case 'fold':
      return '弃牌'
    case 'check':
      return '过牌'
    case 'call':
      return e.allIn ? '全下 ' + fmt(e.to ?? e.amount) : '跟注 ' + fmt(e.amount)
    case 'bet':
      return e.allIn ? '全下 ' + fmt(e.to!) : '下注 ' + fmt(e.to!)
    case 'raise':
      return e.allIn ? '全下 ' + fmt(e.to!) : '加注至 ' + fmt(e.to!)
    case 'return':
      return '退回 ' + fmt(e.amount)
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
  const name = (i: number) =>
    i === btn ? (i === sb ? '按钮/小盲' : '按钮') : i === sb ? '小盲' : i === bb ? '大盲' : mid.indexOf(i) === 0 ? '枪口' : mid.indexOf(i) === mid.length - 1 ? '关煞' : '中位'
  return order.map((seat) => ({ seat, pos: name(seat) }))
}

export function logLines(t: Table, seats: SeatInfo[], you?: number) {
  const log = t.handLog()
  const bl = blindsOf(log)
  return log.map((e) => ('board' in e ? `【${dict('zh').poker.street[e.street]} ${cards(e.board)}】` : `${e.seat === you ? '你' : seats[e.seat].name} ${label(e, bl)}`))
}

// 某座位视角的局面（对手决策、教练讲解共用）；只含该座位自己的底牌
export function situation(
  t: Table,
  seats: SeatInfo[],
  seat: number,
  o: { chat?: ChatMessage[]; you?: boolean } = {}
) {
  // 座位 0 的显示名是「你」（玩家界面用）；写给模型时一律称「玩家」，「你」只留给观察者自己
  seats = seats.map((x, i) => (i === 0 ? { ...x, name: '玩家' } : x))
  const me = t.seats()[seat]!
  const hole = t.holeCards()[seat] ?? []
  const L = t.isBettingRoundInProgress() && t.playerToAct() === seat ? t.legalActions() : null
  const who = (i: number) => (i === seat ? (o.you === false ? '玩家' : '你') : seats[i].name)
  const st = t.seats()
  const pos = positions(t)
  const players = pos.map(({ seat: i, pos: p }) => {
    const s = st[i]!
    const tags = [s.folded && '已弃牌', s.allIn && '已全下', s.bet && `本轮已下 ${fmt(s.bet)}`, s.totalIn && `本手共投入 ${fmt(s.totalIn)}（含本轮）`]
      .filter(Boolean)
      .join('，')
    const tag = [p, i !== seat && seats[i].tag].filter(Boolean).join('，')
    return `- ${who(i)}（${tag}）：筹码 ${fmt(s.stack)}${tags ? '，' + tags : ''}`
  })
  const opts = L
    ? [
        L.toCall === 0 ? 'check（过牌）' : `fold（弃牌）/ call（跟注 ${fmt(L.toCall)}）`,
        ...(L.chipRange ? [`raise（${t.currentBet() === 0 ? '下注' : '加注'}到总额 ${fmt(L.chipRange.min)}~${fmt(L.chipRange.max)}）`] : [])
      ].join(' / ')
    : `现在不是${o.you === false ? '玩家' : '你'}行动`
  const { smallBlind, bigBlind } = t.stakes()
  const board = t.communityCards()
  const pot = t.totalPot()
  const toCall = L?.toCall ?? Math.max(0, t.currentBet() - me.bet)
  const lines = [
    `无限注 · 盲注 ${smallBlind}/${bigBlind} · ${seats.length} 人桌；第 ${t.handNumber()} 手，阶段：${dict('zh').poker.street[t.roundOfBetting()]}`,
    `${o.you === false ? '玩家' : '你'}的位置：${pos.find((x) => x.seat === seat)?.pos}；底牌：${cards(hole)}；当前牌型：${hole.length ? handName(hole.concat(board)) : '—'}`,
    `公共牌：${cards(board) || '无'}`,
    `底池：${fmt(pot)}；需跟注：${fmt(toCall)}${toCall > 0 && !me.folded && !me.allIn ? `；所需胜率（底池赔率）：${((toCall / (pot + toCall)) * 100).toFixed(1)}%` : ''}；筹码：${fmt(me.stack)}`,
    `可选行动：${opts}`,
    `座位（按行动顺序，小盲起、按钮收尾）：\n${players.join('\n')}`,
    `本手行动：${logLines(t, seats, o.you === false ? undefined : seat).join('，')}`
  ]
  if (o.chat?.length) lines.push(chatBlock(o.chat, seats))
  return lines.join('\n')
}

export function chatBlock(chat: ChatMessage[], seats: SeatInfo[]) {
  return `新发言：\n${chat.map((m) => `${speaker(m, seats)}：${[m.act, m.text].filter(Boolean).join('，')}`).join('\n')}`
}

function speaker(m: ChatMessage, seats: SeatInfo[]) {
  if (m.kind === 'sys') return '系统'
  return m.from === 'hero' ? '玩家' : (seats.find((s) => s.personaId === m.from)?.name ?? '？')
}

// 玩家（hero）的 hole 在记录里恒非空；是否亮过牌只能按“摊牌且未弃牌”判断
const shown = (rec: HandRecord, p: HandRecord['players'][number]) => rec.showdown && !p.folded && p.hole !== null

// 对手读到的上一手结果：只含公开信息（不读 holeAfter）
export function publicHandResult(rec: HandRecord, forPersonaId: string): string {
  const name = (p: HandRecord['players'][number]) => (p.personaId === forPersonaId ? '你' : p.personaId ? p.name : '玩家')
  const parts = [`第 ${rec.hand} 手：${rec.showdown ? '摊牌' : '未摊牌'}`]
  if (rec.board.length) parts.push(`公共牌 ${cards(rec.board)}`)
  for (const p of rec.players) if (shown(rec, p) && p.id !== 'hero') parts.push(`${name(p)}亮出 ${cards(p.hole!)}${p.handName ? `（${p.handName}）` : ''}`)
  const hero = rec.players.find((p) => p.id === 'hero')
  if (hero && shown(rec, hero)) parts.push(`玩家亮出 ${cards(hero.hole!)}`)
  for (const p of rec.players) if (p.won > 0) parts.push(`${name(p)}赢得 ${fmt(p.won)}`)
  const me = rec.players.find((p) => p.personaId === forPersonaId)
  return parts.join('，') + (me ? `；你本手 ${signed(me.net)}` : '')
}

// 对手的往手摘要：位置、公开行动线与公开结果；不读 holeAfter。「你」只指该对手，玩家称「玩家」
export function opponentSummary(rec: HandRecord, forPersonaId: string): string {
  const me = rec.players.find((p) => p.personaId === forPersonaId)
  const nameOf = (name: string, seat?: number) => (seat === 0 || name === '你' ? '玩家' : name === me?.name ? '你' : name)
  const pos = rec.players.filter((p) => p.pos).map((p) => `${p.personaId ? nameOf(p.name) : '玩家'}（${p.pos}）`).join('，')
  const log = rec.log.map((x) => (x.board ? `【${dict('zh').poker.street[x.street]} ${x.label}】` : `${nameOf(x.name, x.seat)}${x.label}`)).join('，')
  return [`盲注 ${rec.sb}/${rec.bb}`, ...(pos ? [`位置：${pos}`] : []), `行动：${log}`, publicHandResult(rec, forPersonaId)].join('\n')
}

// 教练复盘用：玩家底牌可见；教练局一手结束亮出的全部底牌此时玩家也看得到，一并给出
export function heroHandSummary(rec: HandRecord): string {
  const log = rec.log.map((x) => (x.board ? `【${dict('zh').poker.street[x.street]} ${x.label}】` : `${x.seat === 0 || x.name === '你' ? '玩家' : x.name}${x.label}`)).join('，')
  const seatsLine = rec.players.filter((p) => p.pos).map((p) => `${p.personaId ? p.name : '玩家'}（${p.pos}）`).join('，')
  const opp = rec.players
    .filter((p) => p.personaId)
    .map((p) => {
      const c = p.holeAfter ?? (shown(rec, p) ? p.hole : null)
      return c ? `${p.name} ${cards(c)}${p.folded ? '（已弃牌）' : ''}` : ''
    })
    .filter(Boolean)
    .join('；')
  return [
    `第 ${rec.hand} 手，盲注 ${rec.sb}/${rec.bb}`,
    ...(seatsLine ? [`位置：${seatsLine}`] : []),
    `玩家底牌：${cards(rec.hero)}`,
    `公共牌：${cards(rec.board) || '无'}`,
    `行动：${log}`,
    `结果：玩家${rec.net >= 0 ? '赢' : '输'} ${fmt(Math.abs(rec.net))}`,
    `${rec.mode === 'coach' ? '一手结束亮出的底牌' : '摊牌'}：${opp || '无'}`
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
