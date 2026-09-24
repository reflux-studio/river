import { randomUUID } from 'node:crypto'
import { cardsText, fmt } from '../../shared/format'
import { BLINDS, PERSONAS, STREET } from '../../shared/personas'
import type { AgentCall, BreakerState, ChatMessage, CoachAlert, CoachEntry, Events, HandRecord, TableStart, TableView } from '../../shared/types'
import { coachAsk, coachProactive, coachReview } from '../agents/coach'
import { coachAlert } from '../agents/intents'
import { filterSay } from '../agents/leak'
import { appendThreadMessage, MODE_TIMEOUT_MS, rt, type Mode } from '../agents/mastra'
import { opponentChat, opponentDecide } from '../agents/opponent'
import { AgentQueue, Dropped } from '../agents/queue'
import { buildSeatView, publicHandResult, type TableQuery } from '../agents/views'
import { getBankroll, getHand, getSettings, insertHand, saveReview, setBankroll, updateSettings } from '../db'
import {
  apply, decide, equity, handName, inHand, legal, newGame, outs, pot, runoutStep, startHand,
  type Action, type Game, type Rng
} from '../engine/poker'
import { modelReady, type Role } from '../models/resolve'
import { canned, personaOf, pickResponders, type Say } from './chat'
import { buildTableView, type Nums } from './view'

export interface AgentDeps {
  modelReady: (role: Role) => boolean
  opponentDecide: typeof opponentDecide
  opponentChat: typeof opponentChat
  coachProactive: typeof coachProactive
  coachAsk: typeof coachAsk
  coachReview: typeof coachReview
  appendResult: (personaId: string, threadId: string, text: string) => Promise<void>
}

const realAgents: AgentDeps = {
  modelReady,
  opponentDecide,
  opponentChat,
  coachProactive,
  coachAsk,
  coachReview,
  appendResult: (pid, threadId, text) => appendThreadMessage(rt().opponentMemory, threadId, `opponent:${pid}`, text)
}

export type Limits = Record<Mode, number>
export type Emit = <K extends keyof Events>(event: K, payload: Events[K]) => void

const THINK_MS = [1500, 900, 400]
const AUTO_NEXT_MS = 4500
const BUBBLE_MS = 5000
const MAX_CHAT = 300
const GUIDED_ALERT: CoachAlert = { level: 'hint', message: '这是一手教学牌局。每次轮到你，我都会先说说局面；有任何不懂的，直接在下面问我。' }

type Outcome<T> = { kind: 'done'; value: T } | { kind: 'timeout' } | { kind: 'dropped' } | { kind: 'error'; error: string }

interface PendingAI {
  seat: number
  hand: number
  logLen: number
  action: Action
  say: Say | null
  autopilot: boolean
}

export class TableRunner {
  tableId = ''
  game: Game | null = null
  runId = 0
  paused = false
  pendingAI: PendingAI | null = null
  heroKey: string | null = null
  thinking: string | null = null
  autopilotCount = 0
  breaker = { opponent: 0, coach: 0, trippedOpponent: false, trippedCoach: false }
  guided = false
  chat: ChatMessage[] = []
  bubbles = new Map<string, { text: string; until: number }>()
  askInFlight = false
  winSpeechInFlight: number | null = null
  askId: string | null = null
  coachThread: CoachEntry[] = []
  leaveController = new AbortController()
  limits: Limits
  lastCall: AgentCall | null = null
  nums: Nums | null = null
  bankroll = 0

  readonly emit: Emit
  private agents: AgentDeps
  private rng: Rng
  private alert: CoachAlert | null = null
  private numsKey: string | null = null
  private defaultRaiseTo = 0
  private autopilotIds = new Set<string>()
  private lastStreet = ''
  private endKey: number | null = null
  // 同一决策点只允许一次对手决策在途：resume 等再次进入 loop 时若重复发起，新调用会抢占旧调用，旧调用被当作失败托管
  private deciding: string | null = null
  private proactiveKey: string | null = null
  private autoHand: number | null = null
  private autoDue = false
  private stepTimer?: ReturnType<typeof setTimeout>
  private autoTimer?: ReturnType<typeof setTimeout>
  private lastTriggered = new Map<string, number>()
  private queues = new Map<string, AgentQueue>()
  private coachQueue = new AgentQueue()
  private reviewQueue = new AgentQueue()
  private reviewing = new Set<number>()

  constructor(o: { emit: Emit; agents?: Partial<AgentDeps>; limits?: Partial<Limits>; rng?: Rng }) {
    this.emit = o.emit
    this.agents = { ...realAgents, ...o.agents }
    this.limits = { ...MODE_TIMEOUT_MS, ...o.limits }
    this.rng = o.rng ?? Math.random
  }

  async init() {
    this.bankroll = await getBankroll()
  }

  get leaveSignal() {
    return this.leaveController.signal
  }

  queue(pid: string) {
    let q = this.queues.get(pid)
    if (!q) this.queues.set(pid, (q = new AgentQueue()))
    return q
  }

  async idleAll() {
    await Promise.all([...PERSONAS.map((p) => this.queue(p.id)), this.coachQueue, this.reviewQueue].map((q) => q.idle()))
  }

  onCall(e: AgentCall) {
    this.lastCall = e
    this.emit('agent:last', e)
  }


  async start(o: TableStart) {
    if (this.game) await this.leave()
    const guided = o.guided
    if (guided) await updateSettings({ coachOn: true, level: 'novice' })
    const size = guided ? 3 : o.size
    const [sb, bb] = BLINDS[guided ? 0 : o.blinds]
    const buy = bb * 100
    const picks = [...new Set(guided ? ['bai', 'zen'] : o.picks)].filter((id) => PERSONAS.some((p) => p.id === id)).slice(0, size - 1)
    for (const p of PERSONAS) if (picks.length < size - 1 && !picks.includes(p.id)) picks.push(p.id)
    const players = [
      { id: 'hero', name: '你', isHero: true, stack: buy },
      ...picks.map((id) => ({ id, personaId: id, name: personaOf(id).name, isHero: false, stack: buy }))
    ]
    this.game = newGame({ sb, bb, players }, this.rng)
    this.tableId = randomUUID()
    this.runId++
    this.leaveController = new AbortController()
    this.resetTableState()
    this.guided = guided
    this.breaker = { opponent: 0, coach: 0, trippedOpponent: false, trippedCoach: false }
    this.autopilotCount = 0
    this.lastTriggered.clear()
    this.sys(`入座 · ${sb}/${bb} · ${players.length} 人桌`)
    this.alert = guided ? GUIDED_ALERT : null
    this.bankroll -= buy
    this.emit('bankroll', this.bankroll)
    await setBankroll(this.bankroll)
    this.nextHand()
  }

  async leave() {
    const g = this.game
    if (!g) return
    this.runId++
    this.leaveController.abort()
    this.game = null
    this.resetTableState()
    this.bankroll += g.players[0].stack
    this.emit('bankroll', this.bankroll)
    this.emit('table:view', null)
    await setBankroll(this.bankroll)
  }

  private resetTableState() {
    clearTimeout(this.stepTimer)
    clearTimeout(this.autoTimer)
    this.paused = false
    this.pendingAI = null
    this.heroKey = null
    this.thinking = null
    this.chat = []
    this.bubbles.clear()
    this.askInFlight = false
    this.askId = null
    this.winSpeechInFlight = null
    this.coachThread = []
    this.nums = null
    this.numsKey = null
    this.autopilotIds.clear()
    this.endKey = null
    this.deciding = null
    this.proactiveKey = null
    this.autoHand = null
    this.alert = null
  }

  async rebuy() {
    const g = this.game
    if (!g || !g.done || g.players[0].stack > 0) return
    g.players[0].stack = g.bb * 100
    this.bankroll -= g.bb * 100
    this.emit('bankroll', this.bankroll)
    await setBankroll(this.bankroll)
    this.nextHand()
  }

  retryModels() {
    this.breaker = { opponent: 0, coach: 0, trippedOpponent: false, trippedCoach: false }
    this.broadcast()
  }


  nextHand() {
    const g = this.game
    if (!g || !g.done) return
    clearTimeout(this.autoTimer)
    this.autoHand = null
    for (const p of g.players) {
      if (!p.isHero && p.stack <= 0) {
        p.stack = g.bb * 100
        this.sys(`${p.name} 重新买入 ${fmt(p.stack)}`)
      }
    }
    if (g.players[0].stack <= 0) return this.broadcast()
    startHand(g)
    this.lastStreet = 'preflop'
    this.heroKey = null
    this.endKey = null
    this.winSpeechInFlight = null
    this.pendingAI = null
    this.autopilotIds.clear()
    this.nums = null
    this.numsKey = null
    this.paused = false
    this.sys(`第 ${g.hand} 手 · 翻牌前`)
    if (!(this.guided && g.hand === 1)) this.alert = null
    void this.loop()
  }

  private async loop() {
    const g = this.game
    if (!g) return
    const rid = this.runId
    this.broadcast()
    if (g.done) return void this.onHandEnd()
    if (g.runout) {
      clearTimeout(this.stepTimer)
      this.stepTimer = setTimeout(() => {
        if (rid !== this.runId) return
        runoutStep(g)
        this.afterAction()
      }, 900)
      return
    }
    const seat = g.toAct
    if (g.players[seat].isHero) return this.onHeroTurn()
    if (this.paused) return
    const key = `${rid}-${g.hand}-${g.log.length}`
    if (this.deciding === key) return
    this.deciding = key
    try {
      await this.opponentTurn(g, seat, rid)
    } finally {
      if (this.deciding === key) this.deciding = null
    }
  }

  private async opponentTurn(g: Game, seat: number, rid: number) {
    const p = g.players[seat]
    const persona = personaOf(p.personaId!)
    const leave = this.leaveSignal
    this.thinking = persona.id
    this.broadcast()
    await sleep(THINK_MS[getSettings().speed])
    if (rid !== this.runId) return
    const hand = g.hand
    const logLen = g.log.length
    const useLLM = this.useLLMForOpponents()
    let action: Action | undefined
    let say: Say | null = null
    // 熔断后本桌剩余时间都算托管（plan“超时、托管与熔断”）；用户选本地引擎或未配置模型则不算
    let autopilot = !useLLM && this.breaker.trippedOpponent && getSettings().engine === 'llm' && this.agents.modelReady('opponent')
    if (useLLM) {
      const r = await this.guarded(this.queue(persona.id), this.limits.decide, (s) => this.agents.opponentDecide(this.opponentCtx(g, seat), s), { preempt: true })
      if (rid !== this.runId || g.hand !== hand || g.log.length !== logLen) return
      const act = r.kind === 'done' && r.value.ok ? r.value.intents.act : undefined
      if (act && r.kind === 'done') {
        this.breaker.opponent = 0
        action = normalizeAct(act, g, seat)
        const s = r.value.intents.say
        say = s ? { ...s, source: 'llm' } : null
      } else {
        autopilot = true
        if (!leave.aborted) this.countFailure('opponent')
      }
    }
    if (!action) {
      action = decide(g, seat, persona.profile)
      say = canned(persona, action.type, this.rng)
    }
    if (this.paused) {
      this.pendingAI = { seat, hand, logLen, action, say, autopilot }
      return
    }
    this.commitOpponent(seat, action, say, autopilot)
  }

  private commitOpponent(seat: number, action: Action, say: Say | null, autopilot: boolean) {
    const g = this.game!
    const p = g.players[seat]
    const at = g.log.length
    const label = apply(g, seat, action)
    if (autopilot) {
      g.log[at].autopilot = true
      this.autopilotCount++
      this.autopilotIds.add(p.id)
    } else this.autopilotIds.delete(p.id)
    this.thinking = null
    const text = say && filterSay(say.text, p.hole)
    const msg = this.push({
      kind: text ? 'msg' : 'act',
      from: p.personaId,
      ...(text && { text }),
      act: label,
      ...(autopilot && { autopilot: true }),
      ...(text && say.replyTo && this.chat.some((m) => m.id === say.replyTo) && { replyTo: say.replyTo }),
      triggers: !!text && say.source === 'llm' && say.kind === 'free'
    })
    if (text) this.bubble(p.personaId!, text)
    if (msg.triggers) this.triggerReplies(msg)
    this.afterAction()
  }

  private afterAction() {
    const g = this.game!
    if (g.street !== this.lastStreet) {
      if (g.street !== 'showdown' && g.street !== 'idle') this.sys(`${STREET[g.street]} ${cardsText(g.board)}`)
      this.lastStreet = g.street
    }
    void this.loop()
  }

  resume() {
    const g = this.game
    if (!g) return
    this.paused = false
    const pa = this.pendingAI
    this.pendingAI = null
    if (pa && g.hand === pa.hand && g.log.length === pa.logLen && g.toAct === pa.seat && !g.done) this.commitOpponent(pa.seat, pa.action, pa.say, pa.autopilot)
    else void this.loop()
    this.maybeAutoNext()
  }

  heroAct(a: { type: 'fold' | 'call' | 'raise'; to?: number }) {
    const g = this.game
    if (!g || g.done || g.runout || g.toAct !== 0 || this.paused) return
    const L = legal(g, 0)
    const act: Action = { type: a.type }
    if (a.type !== 'raise' && L.toCall === 0) act.type = 'check'
    if (a.type === 'raise') {
      if (!L.canRaise) return
      act.to = Math.max(L.minTo, Math.min(L.maxTo, a.to ?? this.defaultRaiseTo))
    }
    const label = apply(g, 0, act)
    this.push({ kind: 'act', from: 'hero', act: label, triggers: false })
    this.afterAction()
  }


  private heroPoint() {
    const g = this.game
    return g && !g.done && !g.runout && g.toAct === 0 ? `${g.hand}-${g.log.length}` : null
  }

  private onHeroTurn() {
    const g = this.game!
    const key = `${g.hand}-${g.log.length}`
    // resume 后回到同一决策点：不重复计算，也不再触发教练（原型第 508–510 行）
    if (key === this.heroKey) return
    this.heroKey = key
    this.thinking = null
    const L = legal(g, 0)
    const total = pot(g)
    const r = (x: number) => Math.round(x / g.bb) * g.bb
    this.defaultRaiseTo = L.canRaise ? Math.max(L.minTo, Math.min(L.maxTo, g.currentBet === 0 ? r(total * 0.5) : r(g.currentBet * 2.5))) : 0
    this.nums = this.numsFor(g, 0, 400)
    this.numsKey = key
    this.broadcast()
    const st = getSettings()
    if (st.coachOn && this.agents.modelReady('coach') && !this.breaker.trippedCoach && !this.askInFlight) void this.proactive(key)
  }

  private async proactive(key: string) {
    const rid = this.runId
    this.proactiveKey = key
    this.broadcast()
    const r = await this.guarded(this.coachQueue, this.limits.proactive, (s) => this.agents.coachProactive(this.coachCtx(), s), { preempt: true })
    if (this.proactiveKey === key) this.proactiveKey = null
    if (rid !== this.runId) return
    if (r.kind === 'done' && r.value.ok) {
      this.breaker.coach = 0
      const alert = coachAlert(r.value.intents)
      // 教练晚到：玩家已行动或局面已变，提醒作废
      if (alert && this.heroKey === key && this.heroPoint() === key) {
        if (alert.level === 'pause') this.paused = true
        this.alert = alert
      }
    } else if (isFailure(r)) this.countFailure('coach')
    this.broadcast()
  }

  ask(requestId: string, text: string) {
    const g = this.game
    const reject = (error: 'not_configured' | 'breaker' | 'failed') => this.emit('coach:done', { requestId, ok: false, error })
    if (!g) return reject('failed')
    if (!this.agents.modelReady('coach')) return reject('not_configured')
    if (this.breaker.trippedCoach) return reject('breaker')
    void this.runAsk(g, requestId, text)
  }

  private async runAsk(g: Game, requestId: string, text: string) {
    const rid = this.runId
    this.askId = requestId
    if (!g.done) this.paused = true
    this.askInFlight = true
    const answer: CoachEntry = { role: 'assistant', text: '', requestId }
    this.coachThread.push({ role: 'user', text, requestId }, answer)
    this.broadcast()
    let open = true
    const onDelta = (d: string) => {
      if (!open) return
      answer.text += d
      this.emit('coach:delta', { requestId, text: d })
    }
    const r = await this.guarded(this.coachQueue, this.limits.ask, (s) => this.agents.coachAsk(this.coachCtx(), text, onDelta, s), { preempt: true })
    open = false
    let error: 'interrupted' | 'failed' | undefined
    if (r.kind === 'done' && r.value.ok) {
      if (rid === this.runId) this.breaker.coach = 0
    } else if (isFailure(r)) {
      error = 'failed'
      if (rid === this.runId) this.countFailure('coach')
    } else {
      error = 'interrupted'
      answer.interrupted = true
    }
    this.emit('coach:done', { requestId, ok: !error, ...(error && { error }) })
    if (this.askId === requestId) {
      this.askInFlight = false
      this.maybeAutoNext()
    }
    this.broadcast()
  }

  async review(handId: number) {
    if (this.reviewing.has(handId)) return
    const done = (x: { text?: string; error?: string }) => this.emit('review:done', { handId, ...x })
    if (!this.agents.modelReady('coach')) return done({ error: 'not_configured' })
    this.reviewing.add(handId)
    try {
      const rec = await getHand(handId)
      if (!rec) return done({ error: 'not_found' })
      // 复盘与牌桌无关，离桌不中止
      const r = await this.guarded(this.reviewQueue, this.limits.review, (s) => this.agents.coachReview(handId, rec, s), { preempt: false, leave: false })
      if (r.kind === 'done' && r.value.ok && r.value.text) {
        await saveReview(handId, r.value.text)
        done({ text: r.value.text })
      } else done({ error: r.kind === 'done' ? (r.value.error ?? 'failed') : r.kind === 'error' ? r.error : r.kind })
    } catch (e) {
      done({ error: String(e) })
    } finally {
      this.reviewing.delete(handId)
    }
  }


  private async onHandEnd() {
    const g = this.game!
    if (this.endKey === g.hand) return
    this.endKey = g.hand
    const rid = this.runId
    this.thinking = null
    this.paused = false
    for (const w of g.winners ?? []) this.sys(`${g.players.find((p) => p.id === w.id)!.name} 赢得 ${fmt(w.amount)}${w.handName ? ' · ' + w.handName : ''}`)
    const rec = this.record(g)
    const tableId = this.tableId
    insertHand(tableId, rec).then(
      () => this.emit('hands:changed', undefined),
      (e) => console.error('insertHand failed', e)
    )
    for (const p of rec.players) {
      const pid = p.personaId
      if (!pid) continue
      // durable：下一手决策抢占时也保留，且先于决策执行，保证对手看到本手结果
      this.queue(pid)
        .run({ durable: true, fn: () => this.agents.appendResult(pid, `table:${tableId}:${pid}`, publicHandResult(rec, pid)) })
        .catch((e) => console.error('appendResult failed', e))
    }
    if (getSettings().autoNext && g.players[0].stack > 0) {
      this.autoHand = g.hand
      this.autoDue = false
      this.autoTimer = setTimeout(() => {
        this.autoDue = true
        this.maybeAutoNext()
      }, AUTO_NEXT_MS)
    }
    this.broadcast()
    await this.winnerSpeech(g, rid)
  }

  private async winnerSpeech(g: Game, rid: number) {
    const w = (g.winners ?? []).filter((x) => x.id !== g.players[0].id).sort((a, b) => b.amount - a.amount)[0]
    if (!w) return
    const seat = g.players.findIndex((p) => p.id === w.id)
    const persona = personaOf(g.players[seat].personaId!)
    if (!this.useLLMForOpponents()) return this.postSay(seat, canned(persona, 'win', this.rng), false)
    const hand = g.hand
    this.winSpeechInFlight = hand
    try {
      const r = await this.guarded(this.queue(persona.id), this.limits.win, (s) => this.agents.opponentChat(this.opponentCtx(g, seat), 'win', '你赢了这一手', s))
      // 下一手已开始（手动发牌或离桌）：整体丢弃，不补台词
      if (rid !== this.runId || g.hand !== hand) return
      if (r.kind === 'done' && r.value.ok) {
        const say = r.value.intents.say
        if (say) this.postSay(seat, { ...say, source: 'llm' }, true)
      } else this.postSay(seat, canned(persona, 'win', this.rng), false)
    } finally {
      if (this.winSpeechInFlight === hand) {
        this.winSpeechInFlight = null
        this.maybeAutoNext()
      }
    }
  }

  private maybeAutoNext() {
    const g = this.game
    if (!g || !g.done || !this.autoDue || this.autoHand !== g.hand) return
    if (this.paused || this.askInFlight || this.winSpeechInFlight !== null) return
    this.nextHand()
  }

  private record(g: Game): HandRecord {
    const h = g.players[0]
    const nameOf = (id?: string) => g.players.find((p) => p.id === id)?.name ?? ''
    const pre = g.log.filter((x) => x.street === 'preflop' && x.id === h.id && !/盲/.test(x.label))
    return {
      hand: g.hand,
      sb: g.sb,
      bb: g.bb,
      net: h.stack - h.startStack,
      pot: pot(g),
      showdown: g.showdown,
      hero: h.hole.slice(),
      board: g.board.slice(),
      players: g.players
        .filter((p) => !p.out)
        .map((p) => ({
          id: p.id,
          ...(p.personaId && { personaId: p.personaId }),
          name: p.name,
          hole: p.isHero || (g.showdown && !p.folded) ? p.hole.slice() : null,
          folded: p.folded,
          handName: p.handName || '',
          won: g.winners?.find((w) => w.id === p.id)?.amount ?? 0,
          net: p.stack - p.startStack
        })),
      log: g.log.map((x) => ({ street: x.street, board: !!x.board, name: x.board ? '' : nameOf(x.id), label: x.label, ...(x.autopilot && { autopilot: true }) })),
      vpip: pre.some((x) => /跟注|加注|全下|下注/.test(x.label)),
      pfr: pre.some((x) => /加注|全下/.test(x.label))
    }
  }


  sendChat(text: string) {
    const t = text.trim()
    if (!t || !this.game) return
    const msg = this.push({ kind: 'msg', from: 'hero', text: t, triggers: true })
    this.triggerReplies(msg)
  }

  private triggerReplies(msg: ChatMessage) {
    const g = this.game
    if (!g || !this.useLLMForOpponents()) return
    const now = Date.now()
    for (const p of pickResponders(g.players, { from: msg.from, thinking: this.thinking, lastTriggered: this.lastTriggered, now, rng: this.rng })) {
      this.lastTriggered.set(p.personaId!, now)
      void this.chatReply(g, g.players.indexOf(p), msg)
    }
  }

  private async chatReply(g: Game, seat: number, msg: ChatMessage) {
    const rid = this.runId
    const who = msg.from === 'hero' ? '玩家「你」' : personaOf(msg.from!).name
    const input = `公屏上${who}${msg.act ? `（${msg.act}）` : ''}说：「${msg.text}」（消息 id：${msg.id}）`
    const r = await this.guarded(this.queue(g.players[seat].personaId!), this.limits.chat, (s) => this.agents.opponentChat(this.opponentCtx(g, seat), 'chat', input, s))
    if (rid !== this.runId || r.kind !== 'done' || !r.value.ok || !r.value.intents.say) return
    const say = r.value.intents.say
    this.postSay(seat, { ...say, replyTo: say.replyTo ?? msg.id, source: 'llm' }, false)
  }

  // 所有对手发言（decide 之外的 chat、win、预设）都从这里进公屏，统一经泄牌过滤
  private postSay(seat: number, say: Say | null, triggers: boolean) {
    const p = this.game!.players[seat]
    const text = say && filterSay(say.text, p.hole)
    if (!text) return
    const replyTo = say.replyTo && this.chat.some((m) => m.id === say.replyTo) ? say.replyTo : undefined
    const msg = this.push({ kind: 'msg', from: p.personaId, text, ...(replyTo && { replyTo }), triggers })
    this.bubble(p.personaId!, text)
    if (triggers) this.triggerReplies(msg)
    this.broadcast()
  }

  private push(m: Omit<ChatMessage, 'id' | 'at'>): ChatMessage {
    const msg = { id: randomUUID(), at: Date.now(), ...m } as ChatMessage
    this.chat.push(msg)
    if (this.chat.length > MAX_CHAT) this.chat.splice(0, this.chat.length - MAX_CHAT)
    this.emit('chat:append', msg)
    return msg
  }

  private sys(text: string) {
    this.push({ kind: 'sys', text, triggers: false })
  }

  private bubble(pid: string, text: string) {
    this.bubbles.set(pid, { text, until: Date.now() + BUBBLE_MS })
    const rid = this.runId
    setTimeout(() => rid === this.runId && this.broadcast(), BUBBLE_MS)
  }


  private useLLMForOpponents() {
    return getSettings().engine === 'llm' && this.agents.modelReady('opponent') && !this.breaker.trippedOpponent
  }

  private countFailure(role: Role) {
    const b = this.breaker
    b[role]++
    const key = role === 'opponent' ? 'trippedOpponent' : 'trippedCoach'
    if (b[role] >= 3 && !b[key]) {
      b[key] = true
      this.broadcast()
    }
  }

  private breakerState(): BreakerState {
    return { opponent: this.breaker.trippedOpponent, coach: this.breaker.trippedCoach }
  }

  // 计时器在 queue.run 之前启动（抢占等待计入时限），并与 run 的结果赛跑：
  // 排队中的 durable 任务若挂起，fn 永不开始、看不到 abort，只能靠赛跑脱身（T4 结果）
  private async guarded<T>(q: AgentQueue, ms: number, fn: (s: AbortSignal) => Promise<T>, o: { preempt?: boolean; leave?: boolean } = {}): Promise<Outcome<T>> {
    const ctrl = new AbortController()
    let fire!: () => void
    const expired = new Promise<Outcome<T>>((r) => (fire = () => r({ kind: 'timeout' })))
    const timer = setTimeout(() => (ctrl.abort(), fire()), ms)
    const signals = o.leave === false ? [ctrl.signal] : [ctrl.signal, this.leaveSignal]
    const run = q.run({ preempt: o.preempt, fn: (s) => fn(AbortSignal.any([s, ...signals])) }).then(
      (v): Outcome<T> => (v === Dropped ? { kind: 'dropped' } : { kind: 'done', value: v as T }),
      (e): Outcome<T> => ({ kind: 'error', error: String(e) })
    )
    try {
      return await Promise.race([run, expired])
    } finally {
      clearTimeout(timer)
    }
  }

  private opponentCtx(g: Game, seat: number) {
    return { tableId: this.tableId, seat, personaId: g.players[seat].personaId!, table: this.queryFor(g) }
  }

  private coachCtx() {
    return { tableId: this.tableId, table: this.queryFor(this.game!), guided: this.guided }
  }

  // 按牌桌固定：离桌或换桌后，旧调用的工具不会读到新桌
  private queryFor(g: Game): TableQuery {
    const check = () => {
      if (this.game !== g) throw new Error('table closed')
    }
    return {
      viewFor: (seat) => {
        check()
        return buildSeatView(g, seat, (id) => g.players.find((p) => p.id === id)?.name ?? '', (pid) => (pid ? personaOf(pid).tag : ''))
      },
      chat: (limit) => (check(), this.chat.slice(-limit)),
      equityFor: (seat, iters) => {
        check()
        const n = this.numsFor(g, seat, iters) ?? { eq: 0, need: 0, outs: null, handName: '', sugg: '已弃牌' }
        if (seat === 0) return n
        const { sugg: _, ...rest } = n
        return rest
      }
    }
  }

  // 原型 computeNums（第 494–505 行）
  private numsFor(g: Game, seat: number, iters: number): Nums | null {
    const p = g.players[seat]
    if (p.folded || !p.hole.length) return null
    const opp = g.players.filter((q, j) => j !== seat && inHand(q)).length
    const eq = equity(p.hole, g.board, opp, iters)
    const L = legal(g, seat)
    const total = pot(g)
    const need = L.toCall > 0 ? L.toCall / (total + L.toCall) : 0
    const fair = 1 / (opp + 1)
    const sugg = L.toCall === 0 ? (eq > fair * 1.6 ? '下注' : '过牌') : eq >= need ? (eq > fair * 2.2 && L.canRaise ? '加注' : '跟注') : '弃牌'
    return { eq, need, outs: outs(p.hole, g.board), handName: handName(p.hole.concat(g.board)), sugg }
  }

  broadcast() {
    const v = this.view()
    if (v) this.emit('table:view', v)
  }

  view(): TableView | null {
    const g = this.game
    if (!g) return null
    return buildTableView({
      game: g,
      thinking: this.thinking,
      paused: this.paused,
      bubbles: this.bubbles,
      autopilotIds: this.autopilotIds,
      defaultRaiseTo: this.defaultRaiseTo,
      nums: this.nums,
      numsKey: this.numsKey,
      coachLoading: this.proactiveKey !== null || this.askInFlight,
      autopilotCount: this.autopilotCount,
      breaker: this.breakerState(),
      alert: this.alert,
      guided: this.guided,
      autoNext: getSettings().autoNext,
      now: Date.now()
    })
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 超时、抛错、模型报错算失败；被抢占、被丢弃、被离桌中止不算
function isFailure<T extends { ok: boolean; aborted: boolean }>(r: Outcome<T>) {
  return r.kind === 'timeout' || r.kind === 'error' || (r.kind === 'done' && !r.value.ok && !r.value.aborted)
}

// 原型 llmDecide 的纠正：无需跟注时 fold/call 视为 check；其余非法动作由 apply 纠正
function normalizeAct(a: Action, g: Game, seat: number): Action {
  return (a.type === 'fold' || a.type === 'call') && legal(g, seat).toCall === 0 ? { type: 'check' } : a
}
