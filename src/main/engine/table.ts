// 德州扑克桌面状态机，API 仿 poker-ts 的 Table：由调用方逐步推进下注轮、翻牌与摊牌。
// 相对原型 poker.js 的规则修正（river-v2 discussion §4.2）：
// 1. 不完整加注不重开已行动者的加注权；多次不完整全下累计达到一个完整加注额时重开
// 2. 平分底池的余数从按钮左侧起逐枚分配
// 3. 无人跟注的下注在本轮结束时退回，不计入赢得

import type { Card, Street } from '../../shared/types'
import { best, FULL, handName, shuffle, type Rng } from './eval'

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise'

export interface SeatState {
  stack: number
  bet: number
  startStack: number
  totalIn: number
  folded: boolean
  allIn: boolean
  // 本手开始时没有筹码，不参与
  out: boolean
}

export type LogEntry =
  | { street: Street; seat: number; type: 'blind' | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'return'; amount: number; to?: number; allIn: boolean }
  | { street: Street; board: Card[] }

export interface PotWin {
  pot: number
  seat: number
  amount: number
  // 只有一人争夺的底池没有比牌，为 null
  handName: string | null
}

export interface Legal {
  actions: ActionType[]
  // bet/raise 到的总额；全下金额不足最小加注时 min === max
  chipRange?: { min: number; max: number }
  toCall: number
}

interface Seat extends SeatState {
  hole: Card[]
  acted: boolean
  // 该座位上次行动后面对的下注额：之后下注额涨满一个最小加注才重开它的加注权
  facedAt: number
}

type Phase = 'idle' | 'betting' | 'done'

export class Table {
  private seatsArr: (Seat | null)[]
  private btn: number
  private sbSeat = -1
  private bbSeat = -1
  private deck: Card[] = []
  private board: Card[] = []
  private street: Street = 'preflop'
  private phase: Phase = 'idle'
  private completed = false
  private toAct = -1
  private curBet = 0
  private minRaise = 0
  private log: LogEntry[] = []
  private wins: PotWin[] = []
  private hand = 0

  constructor(private blinds: { smallBlind: number; bigBlind: number }, numSeats: number, private rng: Rng = Math.random) {
    this.seatsArr = Array.from({ length: numSeats }, () => null)
    this.btn = (rng() * numSeats) | 0
  }

  // ---- 座位（只能在两手之间） ----

  sitDown(seat: number, chips: number) {
    this.between()
    this.seatsArr[seat] = { stack: chips, bet: 0, startStack: chips, totalIn: 0, folded: false, allIn: false, out: false, hole: [], acted: false, facedAt: 0 }
  }

  standUp(seat: number) {
    this.between()
    this.seatsArr[seat] = null
  }

  setStack(seat: number, chips: number) {
    this.between()
    this.seat(seat).stack = chips
  }

  // ---- 一手的推进 ----

  startHand() {
    this.between()
    const live = this.seatsArr.filter((s) => s && s.stack > 0).length
    if (live < 2) throw new Error('need at least 2 players with chips')
    this.hand++
    this.deck = shuffle(FULL.slice(), this.rng)
    this.board = []
    this.log = []
    this.wins = []
    this.street = 'preflop'
    this.completed = false
    for (const s of this.seatsArr) {
      if (!s) continue
      Object.assign(s, { bet: 0, startStack: s.stack, totalIn: 0, folded: false, allIn: false, out: s.stack <= 0, hole: [], acted: false, facedAt: 0 })
    }
    const inHand = (s: Seat) => !s.out
    this.btn = this.next(this.btn, inHand)
    if (live === 2) {
      this.sbSeat = this.btn
      this.bbSeat = this.next(this.btn, inHand)
    } else {
      this.sbSeat = this.next(this.btn, inHand)
      this.bbSeat = this.next(this.sbSeat, inHand)
    }
    this.post(this.sbSeat, this.blinds.smallBlind)
    this.post(this.bbSeat, this.blinds.bigBlind)
    for (let r = 0; r < 2; r++) for (const s of this.seatsArr) if (s && !s.out) s.hole.push(this.deck.pop()!)
    this.curBet = this.blinds.bigBlind
    this.minRaise = this.blinds.bigBlind
    this.phase = 'betting'
    this.toAct = this.firstNeeding(this.bbSeat)
  }

  isHandInProgress() {
    return this.phase === 'betting'
  }

  isBettingRoundInProgress() {
    return this.phase === 'betting' && !this.completed && this.toAct !== -1
  }

  areBettingRoundsCompleted() {
    return this.phase === 'betting' && this.completed
  }

  playerToAct() {
    if (!this.isBettingRoundInProgress()) throw new Error('no betting round in progress')
    return this.toAct
  }

  legalActions(): Legal {
    const s = this.seat(this.playerToAct())
    const toCall = Math.min(this.curBet - s.bet, s.stack)
    const actions: ActionType[] = toCall === 0 ? ['check'] : ['fold', 'call']
    if (!this.canRaise(this.toAct)) return { actions, toCall }
    const max = s.bet + s.stack
    const min = Math.min(this.curBet + this.minRaise, max)
    actions.push(this.curBet === 0 ? 'bet' : 'raise')
    return { actions, chipRange: { min, max }, toCall }
  }

  // betSize：bet/raise 到的总额。非法动作抛错，由调用方先规范化
  actionTaken(action: ActionType, betSize?: number) {
    const seat = this.playerToAct()
    const L = this.legalActions()
    if (!L.actions.includes(action)) throw new Error(`illegal action ${action}`)
    const s = this.seat(seat)
    if (action === 'fold') {
      s.folded = true
      this.push({ street: this.street, seat, type: 'fold', amount: 0, allIn: false })
    } else if (action === 'check') {
      this.push({ street: this.street, seat, type: 'check', amount: 0, allIn: false })
    } else if (action === 'call') {
      const amount = this.put(s, L.toCall)
      this.push({ street: this.street, seat, type: 'call', amount, to: s.bet, allIn: s.allIn })
    } else {
      const to = betSize ?? NaN
      const { min, max } = L.chipRange!
      if (!Number.isInteger(to) || to < min || to > max) throw new Error(`bet size ${betSize} out of range ${min}~${max}`)
      const inc = to - this.curBet
      // 不足最小加注的只可能是全下（to === max）：不更新最小加注额
      if (inc >= this.minRaise) this.minRaise = inc
      this.curBet = to
      const amount = this.put(s, to - s.bet)
      this.push({ street: this.street, seat, type: action, amount, to, allIn: s.allIn })
    }
    s.acted = true
    s.facedAt = this.curBet
    const live = this.seatsArr.filter((x) => x && !x.out && !x.folded)
    if (live.length <= 1) {
      this.toAct = -1
      return
    }
    this.toAct = this.firstNeeding(seat)
  }

  // 本轮下注结束：退回无人跟注的部分，发下一街或标记下注轮全部完成
  endBettingRound() {
    if (this.phase !== 'betting' || this.completed || this.isBettingRoundInProgress()) throw new Error('betting round not finished')
    this.returnUncalled()
    for (const s of this.seatsArr) if (s) (s.bet = 0), (s.acted = false), (s.facedAt = 0)
    this.curBet = 0
    this.minRaise = this.blinds.bigBlind
    const live = this.seatsArr.filter((s) => s && !s.out && !s.folded).length
    if (live <= 1 || this.street === 'river') {
      this.completed = true
      this.toAct = -1
      return
    }
    this.deck.pop()
    if (this.street === 'preflop') {
      this.board.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!)
      this.street = 'flop'
    } else {
      this.board.push(this.deck.pop()!)
      this.street = this.street === 'flop' ? 'turn' : 'river'
    }
    this.log.push({ street: this.street, board: this.board.slice() })
    this.toAct = this.firstNeeding(this.btn)
  }

  showdown() {
    if (!this.areBettingRoundsCompleted()) throw new Error('betting rounds not completed')
    const live = this.idx().filter((i) => !this.seat(i).folded)
    const score = new Map(live.map((i) => [i, live.length > 1 ? best(this.seat(i).hole.concat(this.board)) : 0]))
    const levels = [...new Set(this.idx().map((i) => this.seat(i).totalIn).filter((x) => x > 0))].sort((a, b) => a - b)
    const order = this.fromButton()
    // 按投入额分层；争夺者相同的相邻层合成一个底池（弃牌者的投入只是让层数变多）
    const layers: { amount: number; elig: number[] }[] = []
    let prev = 0
    for (const lvl of levels) {
      const amount = this.idx().reduce((a, i) => a + Math.max(0, Math.min(this.seat(i).totalIn, lvl) - prev), 0)
      prev = lvl
      let elig = live.filter((i) => this.seat(i).totalIn >= lvl)
      // 超出所有未弃牌者投入的部分（来自已弃牌者）归未弃牌者争夺，与原型一致
      if (!elig.length) elig = live
      const last = layers.at(-1)
      if (last && last.elig.join() === elig.join()) last.amount += amount
      else layers.push({ amount, elig })
    }
    layers.forEach(({ amount, elig }, pot) => {
      const top = Math.max(...elig.map((i) => score.get(i)!))
      const ws = order.filter((i) => elig.includes(i) && score.get(i) === top)
      const share = Math.floor(amount / ws.length)
      ws.forEach((i, k) => {
        const won = share + (k < amount - share * ws.length ? 1 : 0)
        this.seat(i).stack += won
        this.wins.push({ pot, seat: i, amount: won, handName: elig.length > 1 ? handName(this.seat(i).hole.concat(this.board)) : null })
      })
    })
    if (live.length > 1) this.street = 'showdown'
    this.phase = 'done'
  }

  // 本手作废：筹码恢复到本手开始时，不产生赢家
  abortHand() {
    if (this.phase !== 'betting') return
    for (const s of this.seatsArr) if (s) Object.assign(s, { stack: s.startStack, bet: 0, totalIn: 0, allIn: false })
    this.wins = []
    this.toAct = -1
    this.phase = 'done'
  }

  // ---- 读状态 ----

  winners(): PotWin[] {
    return this.wins.slice()
  }

  button() {
    return this.btn
  }

  blindSeats() {
    return { sb: this.sbSeat, bb: this.bbSeat }
  }

  seats(): (SeatState | null)[] {
    return this.seatsArr.map((s) => s && { stack: s.stack, bet: s.bet, startStack: s.startStack, totalIn: s.totalIn, folded: s.folded, allIn: s.allIn, out: s.out })
  }

  // 全部底牌；按视角裁剪由调用方负责
  holeCards(): (Card[] | null)[] {
    return this.seatsArr.map((s) => (s && s.hole.length ? s.hole.slice() : null))
  }

  communityCards() {
    return this.board.slice()
  }

  roundOfBetting(): Street {
    return this.street
  }

  // 已收进的底池（不含本轮未收的下注）
  pots(): { size: number; eligible: number[] }[] {
    const collected = this.idx().map((i) => ({ i, amt: this.seat(i).totalIn - this.seat(i).bet }))
    const levels = [...new Set(collected.map((x) => x.amt).filter((x) => x > 0))].sort((a, b) => a - b)
    const out: { size: number; eligible: number[] }[] = []
    let prev = 0
    for (const lvl of levels) {
      const size = collected.reduce((a, x) => a + Math.max(0, Math.min(x.amt, lvl) - prev), 0)
      const eligible = collected.filter((x) => x.amt >= lvl && !this.seat(x.i).folded).map((x) => x.i)
      prev = lvl
      if (!eligible.length && out.length) out[out.length - 1].size += size
      else out.push({ size, eligible })
    }
    return out
  }

  // 含本轮未收的下注
  totalPot() {
    return this.idx().reduce((a, i) => a + this.seat(i).totalIn, 0)
  }

  currentBet() {
    return this.curBet
  }

  handLog(): LogEntry[] {
    return this.log.map((e) => ({ ...e }))
  }

  handNumber() {
    return this.hand
  }

  stakes() {
    return { ...this.blinds }
  }

  numSeats() {
    return this.seatsArr.length
  }

  // ---- 内部 ----

  private between() {
    if (this.phase === 'betting') throw new Error('hand in progress')
  }

  private seat(i: number): Seat {
    const s = this.seatsArr[i]
    if (!s) throw new Error(`seat ${i} is empty`)
    return s
  }

  private idx() {
    return this.seatsArr.flatMap((s, i) => (s && !s.out ? [i] : []))
  }

  // 按钮左侧起的座位顺序
  private fromButton() {
    const n = this.seatsArr.length
    return Array.from({ length: n }, (_, k) => (this.btn + 1 + k) % n).filter((i) => this.seatsArr[i] && !this.seatsArr[i]!.out)
  }

  private next(from: number, pred: (s: Seat) => boolean) {
    const n = this.seatsArr.length
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n
      const s = this.seatsArr[j]
      if (s && pred(s)) return j
    }
    return -1
  }

  private canAct = (s: Seat) => !s.out && !s.folded && !s.allIn

  private needsAction(i: number) {
    const s = this.seat(i)
    if (!this.canAct(s)) return false
    if (s.bet < this.curBet) return true
    // 其他人都已全下或弃牌时，无需跟注的人不必行动
    const others = this.idx().filter((j) => j !== i && this.canAct(this.seat(j))).length
    return !s.acted && others > 0
  }

  private firstNeeding(from: number) {
    const n = this.seatsArr.length
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n
      if (this.seatsArr[j] && this.needsAction(j)) return j
    }
    return -1
  }

  private canRaise(i: number) {
    const s = this.seat(i)
    const toCall = Math.min(this.curBet - s.bet, s.stack)
    if (s.stack <= toCall) return false
    if (!this.idx().some((j) => j !== i && this.canAct(this.seat(j)))) return false
    return !s.acted || this.curBet - s.facedAt >= this.minRaise
  }

  private put(s: Seat, amt: number) {
    const a = Math.min(amt, s.stack)
    s.stack -= a
    s.bet += a
    s.totalIn += a
    if (s.stack === 0) s.allIn = true
    return a
  }

  private post(i: number, amt: number) {
    const s = this.seat(i)
    const amount = this.put(s, amt)
    this.push({ street: 'preflop', seat: i, type: 'blind', amount, allIn: s.allIn })
  }

  private push(e: LogEntry) {
    this.log.push(e)
  }

  // 本轮下注最高者超出第二高者的部分无人跟注，退回
  private returnUncalled() {
    const bets = this.idx().map((i) => ({ i, bet: this.seat(i).bet })).sort((a, b) => b.bet - a.bet)
    if (bets.length < 2 || bets[0].bet <= bets[1].bet) return
    const extra = bets[0].bet - bets[1].bet
    const s = this.seat(bets[0].i)
    s.stack += extra
    s.bet -= extra
    s.totalIn -= extra
    if (s.stack > 0) s.allIn = false
    this.push({ street: this.street, seat: bets[0].i, type: 'return', amount: extra, allIn: false })
  }
}
