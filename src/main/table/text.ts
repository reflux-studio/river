// agent 能看到的文字与落库的手牌记录都从这里生成：信息隔离在此处裁剪（对手只见公开信息，教练只见玩家视角）
import { cardsText as cards, fmt, signed } from '../../shared/format'
import { STREET } from '../../shared/personas'
import type { ChatMessage, HandLogEntry, HandRecord, Mode } from '../../shared/types'
import type { LogEntry, Table } from '../engine/table'

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

export function logLines(t: Table, seats: SeatInfo[], you?: number) {
  const log = t.handLog()
  const bl = blindsOf(log)
  return log.map((e) => ('board' in e ? `【${STREET[e.street]} ${cards(e.board)}】` : `${e.seat === you ? '你' : seats[e.seat].name} ${label(e, bl)}`))
}

// 某座位视角的局面（对手决策、教练讲解共用）；只含该座位自己的底牌
export function situation(
  t: Table,
  seats: SeatInfo[],
  seat: number,
  o: { chat?: ChatMessage[]; equity?: number; extra?: string; you?: boolean } = {}
) {
  // 给教练的是玩家视角：称玩家为“玩家”
  if (o.you === false) seats = seats.map((x, i) => (i === seat ? { ...x, name: '玩家' } : x))
  const me = t.seats()[seat]!
  const hole = t.holeCards()[seat] ?? []
  const L = t.isBettingRoundInProgress() && t.playerToAct() === seat ? t.legalActions() : null
  const who = (i: number) => (i === seat ? (o.you === false ? '玩家' : '你') : seats[i].name)
  const players = t
    .seats()
    .map((s, i) => {
      if (!s || s.out) return ''
      const tags = [s.folded && '已弃牌', s.allIn && '已全下', s.bet && `本轮已下 ${fmt(s.bet)}`].filter(Boolean).join('，')
      const tag = seats[i].tag ? `（${seats[i].tag}）` : ''
      return `- ${who(i)}${i === seat ? '' : tag}：筹码 ${fmt(s.stack)}${tags ? '，' + tags : ''}`
    })
    .filter(Boolean)
  const opts = L
    ? [
        L.toCall === 0 ? 'check（过牌）' : `fold（弃牌）/ call（跟注 ${fmt(L.toCall)}）`,
        ...(L.chipRange ? [`raise（${t.currentBet() === 0 ? '下注' : '加注'}到总额 ${fmt(L.chipRange.min)}~${fmt(L.chipRange.max)}）`] : [])
      ].join(' / ')
    : '现在不是你行动'
  const lines = [
    `第 ${t.handNumber()} 手，阶段：${STREET[t.roundOfBetting()]}`,
    `${o.you === false ? '玩家' : '你'}的底牌：${cards(hole)}`,
    `公共牌：${cards(t.communityCards()) || '无'}`,
    `底池：${fmt(t.totalPot())}；需跟注：${fmt(L?.toCall ?? Math.max(0, t.currentBet() - me.bet))}；筹码：${fmt(me.stack)}`,
    `可选行动：${opts}`,
    `座位：\n${players.join('\n')}`,
    `本手行动：${logLines(t, seats, o.you === false ? undefined : seat).join('，')}`
  ]
  if (o.equity !== undefined) lines.push(`参考：对在手对手随机手牌的胜率约 ${Math.round(o.equity * 100)}%`)
  if (o.chat?.length) lines.push(`最近公屏：\n${o.chat.map((m) => `${speaker(m, seats)}：${[m.act, m.text].filter(Boolean).join('，')}`).join('\n')}`)
  if (o.extra) lines.push(o.extra)
  return lines.join('\n')
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

// 教练复盘用：玩家底牌可见；教练局一手结束亮出的全部底牌此时玩家也看得到，一并给出
export function heroHandSummary(rec: HandRecord): string {
  const log = rec.log.map((x) => (x.board ? `【${STREET[x.street]} ${x.label}】` : `${x.name}${x.label}`)).join('，')
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
