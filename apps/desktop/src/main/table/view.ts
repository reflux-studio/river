// Renderer 能看到的一切都经这里裁剪：未亮出的对手底牌不得离开主进程。
// 亮牌规则：摊牌时未弃牌者亮牌；教练局一手结束后所有人亮牌（弃牌者标 mucked）
import { fmt, signed } from '../../shared/format'
import type { CoachState, Cost, Legal, Mode, SeatViewPublic, TableView } from '../../shared/types'
import { lastActs, type HandCat, type Table } from '@river/engine'
import { dict } from '@river/i18n'
import { settingsCache } from '../db'
import { label, type SeatInfo } from './text'

export interface Nums {
  eq: number
  need: number
  outs: number | null
  handCat: HandCat
}

export type SeatDisplay = SeatInfo & { ini: string; hue: number }

export interface ViewState {
  table: Table
  seats: SeatDisplay[]
  mode: Mode
  guided: boolean
  // 已发过至少一手
  started: boolean
  thinking: number | null
  bubbles: Map<number, { text: string; until: number }>
  nums: Nums | null
  numsKey: string | null
  heroKey: string | null
  stalled: { seat: number; error: string; settings: boolean } | null
  coach: CoachState | null
  cost: Cost
  now: number
}

export function heroLegal(t: Table): Legal {
  const me = t.seats()[0]!
  if (t.isBettingRoundInProgress() && t.playerToAct() === 0) {
    const L = t.legalActions()
    return {
      toCall: L.toCall, canCheck: L.toCall === 0, minTo: L.chipRange?.min ?? 0, maxTo: L.chipRange?.max ?? 0,
      canRaise: !!L.chipRange, bet: me.bet, stack: me.stack
    }
  }
  const toCall = Math.min(Math.max(0, t.currentBet() - me.bet), me.stack)
  return { toCall, canCheck: toCall === 0, minTo: 0, maxTo: 0, canRaise: false, bet: me.bet, stack: me.stack }
}

export function buildTableView(s: ViewState): TableView {
  const d = dict(settingsCache.locale)
  const T = d.desktop.table
  const t = s.table
  const inHand = t.isHandInProgress()
  const done = s.started && !inHand
  const heroTurn = inHand && t.isBettingRoundInProgress() && t.playerToAct() === 0 && !s.stalled
  const st = t.seats()
  const holes = t.holeCards()
  const log = t.handLog()
  const blinds = t.blindSeats()
  const showdown = done && t.roundOfBetting() === 'showdown'
  const won = new Map<number, number>()
  if (done) for (const w of t.winners()) won.set(w.seat, (won.get(w.seat) ?? 0) + w.amount)
  const handNames = new Map<number, string>()
  if (done) for (const w of t.winners()) if (w.handCat) handNames.set(w.seat, d.poker.hand[w.handCat])
  // 当前街上各座位最近一次行动
  const lastBoard = log.map((e) => 'board' in e).lastIndexOf(true)
  const last = new Map<number, string>()
  log.forEach((e, k) => {
    if (k > lastBoard && 'seat' in e && e.type !== 'return') last.set(e.seat, label(e, blinds))
  })
  const acts = lastActs(log, t.roundOfBetting())
  const total = t.totalPot()
  const bets = st.reduce((a, x) => a + (x?.bet ?? 0), 0)

  const seats: SeatViewPublic[] = s.seats.map((info, i) => {
    const p = st[i]!
    const thinking = s.thinking === i
    const win = won.get(i)
    let status = ''
    let statusTone: SeatViewPublic['statusTone'] = 'muted'
    if (thinking) (status = T.thinking), (statusTone = 'blue')
    else if (win) (status = T.won(fmt(win), handNames.get(i) ?? '')), (statusTone = 'green')
    else if (p.out) status = T.out
    else if (p.folded) (status = T.folded), (statusTone = 'dark')
    else if (p.allIn) (status = T.allin), (statusTone = 'red')
    else if (i === 0 && heroTurn) (status = T.yourTurn), (statusTone = 'blue')
    else if (inHand) status = last.get(i) ?? ''
    const h = holes[i]
    const reveal = i === 0 || (showdown && !p.folded) || (done && s.mode === 'coach')
    const bubble = s.bubbles.get(i)
    const act = acts.get(i)
    return {
      name: info.name,
      ...(info.personaId && { personaId: info.personaId }),
      tag: info.tag,
      ini: info.ini,
      hue: info.hue,
      stack: p.stack,
      bet: p.bet,
      isDealer: s.started && i === t.button(),
      isSB: inHand && i === blinds.sb,
      isBB: inHand && i === blinds.bb,
      folded: p.folded,
      out: p.out,
      allin: p.allIn,
      status,
      statusTone,
      thinking,
      winner: !!win,
      ...(reveal && h && { cards: h, ...(p.folded && i !== 0 && { mucked: true }) }),
      hasCards: !p.folded && !p.out && !!h,
      ...(act && { lastAct: act }),
      ...(bubble && bubble.until > s.now && { bubble: bubble.text })
    }
  })

  const L = heroLegal(t)
  const { smallBlind, bigBlind: bb } = t.stakes()
  const r = (x: number) => Math.round(x / bb) * bb
  const clamp = (x: number) => Math.max(L.minTo, Math.min(L.maxTo, x))
  const cur = t.currentBet()
  const presets = (
    [[T.presets.third, 0.33], [T.presets.half, 0.5], [T.presets.threeQuarters, 0.75], [T.presets.pot, 1], [T.presets.allin, null]] as const
  ).map(([lab, f]) => ({ label: lab, to: f === null ? L.maxTo : clamp(cur + r((total + L.toCall) * f)) }))
  const defaultRaiseTo = L.canRaise ? clamp(cur === 0 ? r(total * 0.5) : r(cur * 2.5)) : 0

  const hero = st[0]!
  const net = hero.stack - hero.startStack
  let result: TableView['result'] = null
  if (done) {
    const hw = won.get(0)
    const names = [...won.keys()].map((i) => s.seats[i].name)
    result = {
      text: hw ? T.heroWon(fmt(hw), handNames.get(0) ?? '') : T.othersWon(names.join(T.nameSep)),
      sub: T.sub(signed(net), s.mode === 'coach'),
      heroWon: !!hw,
      net
    }
  }
  return {
    mode: s.mode,
    title: T.title(smallBlind, bb, s.seats.length),
    bb,
    handNo: t.handNumber(),
    street: s.started ? t.roundOfBetting() : 'idle',
    board: t.communityCards(),
    pot: total - bets,
    seats,
    hero: { legal: L, toCall: L.toCall, isTurn: heroTurn, defaultRaiseTo, presets },
    done,
    runout: inHand && !t.isBettingRoundInProgress() && !s.stalled,
    result,
    heroBust: done && hero.stack <= 0,
    // 不是当前决策点算出的数据标 stale（界面显示“数据来自你上一次决策”）
    nums: s.nums && { ...s.nums, stale: !(heroTurn && s.numsKey === s.heroKey) },
    stalled: s.stalled && { name: s.seats[s.stalled.seat].name, error: s.stalled.error, settings: s.stalled.settings },
    coach: s.coach,
    guided: s.guided,
    cost: s.cost
  }
}
