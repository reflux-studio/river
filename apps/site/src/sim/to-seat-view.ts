// 演示桌的视图映射，对应设计稿 river-site.js 的 viewReal；状态文字按语言生成，交给 TableStage（heroSeat 为 null）
import { fmt, lastActs, type Card, type LogEntry } from '@river/engine'
import { dict, presets, type Locale } from '@river/i18n'
import type { SeatView } from '@river/ui/types'
import { site } from '../i18n/site'
import type { Sim } from './sim'

export interface DemoView {
  seats: SeatView[]
  board: Card[]
  pot: number
  done: boolean
  handNo: number
  // 当前该行动的对手名；发牌或一手结束时为空
  actor: string
}

type SeatEntry = Extract<LogEntry, { seat: number }>

function label(e: SeatEntry, sb: number, lang: Locale) {
  const { act, pos } = dict(lang).poker
  switch (e.type) {
    case 'blind':
      return (e.seat === sb ? pos.sb : pos.bb) + ' ' + fmt(e.amount)
    case 'fold':
      return act.fold
    case 'check':
      return act.check
    case 'call':
      return act.call + ' ' + fmt(e.amount)
    case 'bet':
      return act.bet + ' ' + fmt(e.to!)
    default:
      return act.raiseTo + ' ' + fmt(e.to!)
  }
}

export function toSeatView(sim: Sim, lang: Locale): DemoView {
  const t = sim.table
  const S = site[lang].demo.seat
  const hand = dict(lang).poker.hand
  const people = presets[lang]
  const inHand = t.isHandInProgress()
  const done = !inHand
  const toAct = inHand && t.isBettingRoundInProgress() ? t.playerToAct() : -1
  const st = t.seats()
  const holes = t.holeCards()
  const log = t.handLog()
  const blinds = t.blindSeats()
  const showdown = done && t.roundOfBetting() === 'showdown'
  const won = new Map<number, { amount: number; cat: string }>()
  if (done)
    for (const w of t.winners()) {
      const prev = won.get(w.seat)
      won.set(w.seat, { amount: (prev?.amount ?? 0) + w.amount, cat: prev?.cat || (w.handCat ? hand[w.handCat] : '') })
    }
  const lastBoard = log.map((e) => 'board' in e).lastIndexOf(true)
  const last = new Map<number, SeatEntry>()
  log.forEach((e, k) => k > lastBoard && 'seat' in e && e.type !== 'return' && last.set(e.seat, e))
  const acts = lastActs(log, t.roundOfBetting())

  const seats = sim.ids.map((id, i): SeatView => {
    const p = st[i]!
    const per = people.find((x) => x.id === id)!
    const w = won.get(i)
    const e = last.get(i)
    let status = inHand && e ? label(e, blinds.sb, lang) : ''
    let statusTone: SeatView['statusTone'] = 'muted'
    if (p.folded) (status = S.folded), (statusTone = 'dark')
    else if (p.allIn) (status = S.allin(fmt(p.totalIn))), (statusTone = 'red')
    if (toAct === i) (status = S.thinking), (statusTone = 'blue')
    if (w) (status = S.won(fmt(w.amount), w.cat)), (statusTone = 'green')
    const h = holes[i]
    const bubble = sim.bubbles.get(i)
    const act = acts.get(i)
    return {
      name: per.name,
      personaId: id,
      tag: per.tag,
      ini: per.ini,
      hue: per.hue,
      stack: p.stack,
      bet: p.bet,
      isDealer: i === t.button(),
      isSB: inHand && i === blinds.sb,
      isBB: inHand && i === blinds.bb,
      folded: p.folded,
      out: p.out,
      allin: p.allIn,
      status,
      statusTone,
      thinking: toAct === i,
      winner: !!w,
      ...(showdown && !p.folded && h && { cards: h }),
      hasCards: !p.folded && !p.out && !!h,
      ...(act && { lastAct: act }),
      ...(bubble && { bubble: bubble.lines[lang][bubble.i] })
    }
  })
  const bets = st.reduce((a, x) => a + (x?.bet ?? 0), 0)
  return {
    seats,
    board: t.communityCards(),
    pot: t.totalPot() - bets,
    done,
    handNo: t.handNumber(),
    actor: toAct >= 0 ? seats[toAct].name : ''
  }
}
