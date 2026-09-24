import { randomUUID } from 'node:crypto'
import { cardsText, fmt } from '../../shared/format'
import { BLINDS, STREET } from '../../shared/personas'
import type { ChatMessage, CoachEntry, CoachState, Events, HandRecord, HeroAction, Mode, Persona, Recap, TableStart, TableView } from '../../shared/types'
import { coachAsk, coachRecap, coachSpeak } from '../agents/coach'
import { setUsageListener, type Msg, type Usage, type UsageTag } from '../agents/llm'
import { opponentAct, type RawAct } from '../agents/opponent'
import {
  addMemory, getBankroll, getHand, handKeyOf, insertHand, insertUsage, memoryOf, personasCache, personaOf, saveReview, setBankroll, settingsCache, type UsageRow
} from '../db'
import { equity, handName, outs } from '../engine/eval'
import { Table, type ActionType } from '../engine/table'
import { costTotal } from '../models/prices'
import { modelReady } from '../models/resolve'
import { handRecord, heroHandSummary, label, logLines, publicHandResult, situation } from './text'
import { buildTableView, heroLegal, type Nums, type SeatDisplay } from './view'

export interface AgentDeps {
  modelReady: typeof modelReady
  opponentAct: typeof opponentAct
  coachSpeak: typeof coachSpeak
  coachAsk: typeof coachAsk
  coachRecap: typeof coachRecap
}

const realAgents: AgentDeps = { modelReady, opponentAct, coachSpeak, coachAsk, coachRecap }

export type Emit = <K extends keyof Events>(event: K, payload: Events[K]) => void

// 思考速度：调用返回太快时补足到这个最短时长再落子
const MIN_SHOW_MS = [1500, 900, 400]
const STREET_MS = 900
const BUBBLE_MS = 5000
const MAX_CHAT = 300
const ASK_ROUNDS = 6
const GUIDED_PICKS = ['bai', 'zen']

type Rng = () => number

// 模型未配置、鉴权失败、模型不存在：重试无用，横幅给出“去设置”
const needsSettings = (e: string) => /not configured|API key|401|403|404|unauthori[sz]ed|forbidden|not found|invalid.*key|解密/i.test(e)

export class TableRunner {
  tableId = ''
  table: Table | null = null
  seats: SeatDisplay[] = []
  mode: Mode = 'free'
  guided = false
  runId = 0
  chat: ChatMessage[] = []
  coachThread: CoachEntry[] = []
  bankroll = 0

  readonly emit: Emit
  private agents: AgentDeps
  private rng: Rng
  private started = false
  private leaveCtrl = new AbortController()
  private thinking: number | null = null
  private deciding: string | null = null
  private stalled: { seat: number; error: string; settings: boolean } | null = null
  private bubbles = new Map<number, { text: string; until: number }>()
  private nums: Nums | null = null
  private numsKey: string | null = null
  private heroKey: string | null = null
  // 教练已就这个决策点说完（成功、失败或跳过）
  private spokenKey: string | null = null
  private coachBusy: CoachState['busy'] = null
  private coachCtrl: AbortController | null = null
  private recap: 'none' | 'pending' | 'running' | 'done' | 'failed' | 'skipped' = 'none'
  private recapEntry: CoachEntry | null = null
  private lastRecord: { id: number | null; rec: HandRecord } | null = null
  private askHistory: Msg[] = []
  private notes = new Map<string, string>()
  private results: HandRecord[] = []
  private endKey: number | null = null
  private stepTimer?: ReturnType<typeof setTimeout>
  private usage: UsageRow[] = []
  // 入座时的角色快照：牌局中途删除自建角色也能继续
  private snapshots = new Map<string, Persona>()

  constructor(o: { emit: Emit; agents?: Partial<AgentDeps>; rng?: Rng }) {
    this.emit = o.emit
    this.agents = { ...realAgents, ...o.agents }
    this.rng = o.rng ?? Math.random
    setUsageListener((u) => this.recordUsage(u))
  }

  async init() {
    this.bankroll = await getBankroll()
  }

  // ---- 入座与离桌 ----

  async start(o: TableStart) {
    if (this.table) await this.leave()
    const mode: Mode = o.guided ? 'coach' : o.mode
    if (!this.agents.modelReady('opponent')) throw new Error('先在设置里配置对手模型')
    if (mode === 'coach' && !this.agents.modelReady('coach')) throw new Error('教练局需要先在设置里配置教练模型')
    const avail = personasCache.filter((p) => !p.deleted)
    if (!avail.length) throw new Error('没有可用的对手')
    const want = o.guided ? 3 : o.size
    const size = Math.min(want, avail.length + 1)
    const [sb, bb] = BLINDS[o.guided ? 0 : o.blinds]
    const buy = bb * 100
    const ids = [...new Set(o.guided ? GUIDED_PICKS : o.picks)].filter((id) => avail.some((p) => p.id === id)).slice(0, size - 1)
    for (const p of avail) if (ids.length < size - 1 && !ids.includes(p.id)) ids.push(p.id)
    const snap = ids.map((id) => avail.find((p) => p.id === id)!)
    this.seats = [
      { id: 'hero', name: '你', tag: '', ini: '你', hue: 255 },
      ...snap.map((p) => ({ id: p.id, personaId: p.id, name: p.name, tag: p.tag, ini: p.ini, hue: p.hue }))
    ]
    this.snapshots = new Map(snap.map((p) => [p.id, p]))
    this.table = new Table({ smallBlind: sb, bigBlind: bb }, this.seats.length, this.rng)
    this.seats.forEach((_, i) => this.table!.sitDown(i, buy))
    this.tableId = randomUUID()
    this.mode = mode
    this.guided = o.guided
    this.runId++
    this.leaveCtrl = new AbortController()
    this.resetTable()
    this.sys(`入座 · ${sb}/${bb} · ${this.seats.length} 人桌 · ${mode === 'coach' ? '教练局' : '自由局'}`)
    this.bankroll -= buy
    this.emit('bankroll', this.bankroll)
    await setBankroll(this.bankroll)
    this.nextHand()
  }

  async leave() {
    const t = this.table
    if (!t) return
    // 模型故障停下时离桌：本手作废，筹码回到本手开始时（discussion §2，Q3）
    if (this.stalled && t.isHandInProgress()) t.abortHand()
    this.runId++
    this.leaveCtrl.abort()
    this.coachCtrl?.abort()
    const back = t.seats()[0]!.stack
    this.table = null
    this.resetTable()
    this.bankroll += back
    this.emit('bankroll', this.bankroll)
    this.emit('table:view', null)
    await setBankroll(this.bankroll)
  }

  private resetHand() {
    clearTimeout(this.stepTimer)
    this.thinking = null
    this.deciding = null
    this.stalled = null
    this.nums = null
    this.numsKey = null
    this.heroKey = null
    this.spokenKey = null
    this.recap = 'none'
    this.recapEntry = null
    this.endKey = null
    this.notes.clear()
  }

  private resetTable() {
    this.resetHand()
    this.started = false
    this.chat = []
    this.coachThread = []
    this.askHistory = []
    this.bubbles.clear()
    this.coachBusy = null
    this.coachCtrl = null
    this.results = []
    this.usage = []
    this.lastRecord = null
  }

  // ---- 一手 ----

  canNext() {
    const t = this.table
    if (!t || !this.started || t.isHandInProgress() || this.coachBusy !== null) return false
    // 教练局：复盘结束、失败或跳过后才可下一手
    return this.mode !== 'coach' || this.recap === 'done' || this.recap === 'failed' || this.recap === 'skipped'
  }

  nextHand() {
    const t = this.table
    if (!t || (this.started && !this.canNext())) return
    const buy = t.stakes().bigBlind * 100
    t.seats().forEach((s, i) => {
      if (i > 0 && s && s.stack <= 0) {
        t.setStack(i, buy)
        this.sys(`${this.seats[i].name} 重新买入 ${fmt(buy)}`)
      }
    })
    if (t.seats()[0]!.stack <= 0) return this.broadcast()
    this.resetHand()
    t.startHand()
    this.started = true
    this.sys(`第 ${t.handNumber()} 手 · 翻牌前`)
    void this.loop()
  }

  async rebuy() {
    const t = this.table
    if (!t || !this.canNext() || t.seats()[0]!.stack > 0) return
    const buy = t.stakes().bigBlind * 100
    t.setStack(0, buy)
    this.bankroll -= buy
    this.emit('bankroll', this.bankroll)
    await setBankroll(this.bankroll)
    this.nextHand()
  }

  private loop() {
    const t = this.table
    if (!t) return
    const rid = this.runId
    this.broadcast()
    // 提问期间牌局暂停：在途的对手调用落子后不再推进（discussion §14 F2）
    if (this.stalled || this.coachBusy === 'ask') return
    if (!t.isHandInProgress()) return void this.onHandEnd()
    if (!t.isBettingRoundInProgress()) {
      clearTimeout(this.stepTimer)
      this.stepTimer = setTimeout(() => {
        if (rid !== this.runId || this.table !== t || this.coachBusy === 'ask') return
        this.endRound(t)
      }, STREET_MS)
      return
    }
    const seat = t.playerToAct()
    if (seat === 0) return this.onHeroTurn()
    void this.opponentTurn(t, seat, rid)
  }

  private endRound(t: Table) {
    if (!t.isHandInProgress() || t.isBettingRoundInProgress()) return
    const before = t.communityCards().length
    t.endBettingRound()
    const board = t.communityCards()
    if (board.length > before) this.sys(STREET[t.roundOfBetting()], board)
    if (t.areBettingRoundsCompleted()) t.showdown()
    this.loop()
  }

  private async opponentTurn(t: Table, seat: number, rid: number) {
    const hand = t.handNumber()
    const at = t.handLog().length
    const key = `${rid}-${hand}-${at}`
    if (this.deciding === key) return
    this.deciding = key
    this.thinking = seat
    this.broadcast()
    const started = Date.now()
    const pid = this.seats[seat].personaId!
    const persona = personaOf(pid) ?? this.snapshots.get(pid)!
    let r: Awaited<ReturnType<AgentDeps['opponentAct']>>
    if (!this.agents.modelReady('opponent')) r = { ok: false, aborted: false, text: '', error: 'model not configured' }
    else {
      const eq = this.equityFor(t, seat, 150)
      const recent = this.results.slice(-3).map((rec) => publicHandResult(rec, pid))
      r = await this.agents.opponentAct(
        {
          name: persona.name,
          prompt: persona.prompt,
          memory: await memoryOf(pid),
          tag: this.tag(t),
          situation: situation(t, this.seats, seat, {
            chat: this.chat.filter((m) => m.kind !== 'sys').slice(-8),
            equity: eq,
            extra: recent.length ? `本桌最近几手：\n${recent.join('\n')}` : undefined
          })
        },
        this.leaveCtrl.signal
      )
    }
    if (rid !== this.runId || this.table !== t || t.handNumber() !== hand || t.handLog().length !== at) return
    if (!r.ok || !r.args) {
      this.deciding = null
      this.thinking = null
      const error = r.error ?? '模型没有调用 act'
      this.stalled = { seat, error: error === 'model not configured' ? '还没有配置对手模型，或 API key 无法使用' : error, settings: needsSettings(error) }
      return this.broadcast()
    }
    const wait = MIN_SHOW_MS[settingsCache.speed] - (Date.now() - started)
    if (wait > 0) await sleep(wait)
    if (rid !== this.runId || this.table !== t || t.handLog().length !== at) return
    const [type, to] = normalize(t, r.args)
    t.actionTaken(type, to)
    const e = t.handLog().at(-1)!
    const act = 'seat' in e ? label(e, t.blindSeats()) : ''
    const say = r.args.say?.trim().slice(0, 40)
    const note = r.args.note?.trim().slice(0, 30)
    if (note) this.notes.set(pid, note)
    this.push({ kind: say ? 'msg' : 'act', from: pid, act, ...(say && { text: say }) })
    if (say) this.bubble(seat, say)
    this.thinking = null
    this.deciding = null
    this.loop()
  }

  retry() {
    if (!this.stalled) return
    this.stalled = null
    this.loop()
  }

  heroAct(a: HeroAction) {
    const t = this.table
    if (!t || !this.heroCanAct()) return
    const L = t.legalActions()
    let type: ActionType
    let to: number | undefined
    if (a.type === 'raise') {
      if (!L.chipRange) return
      type = L.actions.includes('bet') ? 'bet' : 'raise'
      to = Math.max(L.chipRange.min, Math.min(L.chipRange.max, Math.round(a.to)))
    } else type = L.toCall === 0 ? 'check' : a.type
    t.actionTaken(type, to)
    const e = t.handLog().at(-1)!
    if ('seat' in e) this.push({ kind: 'act', from: 'hero', act: label(e, t.blindSeats()) })
    this.loop()
  }

  private heroCanAct() {
    const t = this.table
    return !!t && !this.stalled && t.isHandInProgress() && t.isBettingRoundInProgress() && t.playerToAct() === 0 && !this.locked()
  }

  // 教练局：教练对当前决策点说完之前、以及提问回答期间，操作锁定
  private locked() {
    if (this.mode !== 'coach') return false
    return this.coachBusy === 'ask' || (this.heroKey !== null && this.spokenKey !== this.heroKey && this.isHeroPoint())
  }

  private isHeroPoint() {
    const t = this.table
    return !!t && t.isHandInProgress() && t.isBettingRoundInProgress() && t.playerToAct() === 0 && `${t.handNumber()}-${t.handLog().length}` === this.heroKey
  }

  private onHeroTurn() {
    const t = this.table!
    const key = `${t.handNumber()}-${t.handLog().length}`
    if (key !== this.heroKey) {
      this.heroKey = key
      this.thinking = null
      this.nums = this.numsFor(t, 0, 400)
      this.numsKey = key
    }
    if (this.mode === 'coach' && this.spokenKey !== key && this.coachBusy === null) void this.speak(t, key)
    this.broadcast()
  }

  // ---- 教练 ----

  private async speak(t: Table, key: string) {
    const rid = this.runId
    const entry = this.addCoach({ kind: 'speak', text: '', status: 'pending' })
    this.coachBusy = 'speak'
    const ctrl = (this.coachCtrl = new AbortController())
    this.broadcast()
    const r = this.agents.modelReady('coach')
      ? await this.agents.coachSpeak(
          { memory: await memoryOf('hero'), tag: this.tag(t), guided: this.guided, situation: this.heroSituation(t) },
          (d) => rid === this.runId && this.patchCoach(entry, { text: entry.text + d }),
          AbortSignal.any([ctrl.signal, this.leaveCtrl.signal])
        )
      : { ok: false, aborted: false, text: '', error: '教练模型未配置' }
    if (rid !== this.runId) return
    this.patchCoach(entry, r.ok ? { status: 'done' } : ctrl.signal.aborted ? { status: 'skipped' } : { status: 'failed', error: r.error })
    this.coachBusy = null
    this.coachCtrl = null
    this.spokenKey = key
    this.broadcast()
  }

  ask(text: string) {
    const t = this.table
    const q = text.trim()
    if (!t || this.mode !== 'coach' || this.coachBusy !== null || !q) return
    void this.runAsk(t, q)
  }

  private async runAsk(t: Table, q: string) {
    const rid = this.runId
    this.addCoach({ kind: 'user', text: q, status: 'done' })
    const entry = this.addCoach({ kind: 'answer', text: '', status: 'pending' })
    this.coachBusy = 'ask'
    const ctrl = (this.coachCtrl = new AbortController())
    clearTimeout(this.stepTimer)
    this.broadcast()
    const r = this.agents.modelReady('coach')
      ? await this.agents.coachAsk(
          { memory: await memoryOf('hero'), tag: this.tag(t), situation: this.heroSituation(t), history: this.askHistory.slice(-ASK_ROUNDS * 2), question: q },
          (d) => rid === this.runId && this.patchCoach(entry, { text: entry.text + d }),
          AbortSignal.any([ctrl.signal, this.leaveCtrl.signal])
        )
      : { ok: false, aborted: false, text: '', error: '教练模型未配置' }
    if (rid !== this.runId) return
    this.patchCoach(entry, r.ok ? { status: 'done' } : { status: 'failed', error: r.error ?? '教练暂时没连上' })
    if (r.ok) this.askHistory.push({ role: 'user', content: q }, { role: 'assistant', content: entry.text })
    this.coachBusy = null
    this.coachCtrl = null
    // 回答期间积压的事：轮到玩家时的讲解、一手结束的复盘，然后继续推进牌局
    if (this.recap === 'pending') void this.runRecap()
    this.loop()
  }

  // 「不等了」「跳过」：中止当前讲解或复盘；提问不可跳过
  skip() {
    if (this.coachBusy === 'speak' || this.coachBusy === 'recap') this.coachCtrl?.abort()
  }

  retryRecap() {
    if (this.recap === 'failed' && this.coachBusy === null && this.lastRecord) void this.runRecap()
  }

  private async runRecap() {
    const last = this.lastRecord
    if (!last) return
    const rid = this.runId
    this.recap = 'running'
    const entry = this.recapEntry ?? this.addCoach({ kind: 'recap', text: '', status: 'pending', hand: { net: last.rec.net, hero: last.rec.hero, board: last.rec.board } })
    this.recapEntry = entry
    this.patchCoach(entry, { status: 'pending', error: undefined })
    this.coachBusy = 'recap'
    const ctrl = (this.coachCtrl = new AbortController())
    this.broadcast()
    const r = await this.agents.coachRecap({ memory: await memoryOf('hero'), tag: { tableId: this.tableId, handNo: last.rec.hand }, summary: heroHandSummary(last.rec) }, AbortSignal.any([ctrl.signal, this.leaveCtrl.signal]))
    if (rid !== this.runId) return
    if (r.ok && r.args) {
      const { note, ...recap } = r.args
      this.patchCoach(entry, { status: 'done', recap: pickRecap(recap) })
      this.recap = 'done'
      if (note?.trim()) await addMemory('hero', note.trim().slice(0, 30))
      // 提问恰在落库前发生时，开始复盘那一刻还没有 id：以结束时的为准
      const id = this.lastRecord?.rec === last.rec ? this.lastRecord.id : last.id
      if (id !== null) {
        await saveReview(id, JSON.stringify(pickRecap(recap)))
        this.emit('review:done', { handId: id, review: pickRecap(recap) })
      }
    } else if (ctrl.signal.aborted) {
      this.patchCoach(entry, { status: 'skipped' })
      this.recap = 'skipped'
    } else {
      this.patchCoach(entry, { status: 'failed', error: r.error ?? '复盘失败' })
      this.recap = 'failed'
    }
    this.coachBusy = null
    this.coachCtrl = null
    this.broadcast()
  }

  // 回放页“让教练复盘这一手”：不依赖牌桌
  async review(handId: number) {
    const done = (x: { review?: Recap; error?: string }) => this.emit('review:done', { handId, ...x })
    if (!this.agents.modelReady('coach')) return done({ error: 'not_configured' })
    const rec = await getHand(handId)
    if (!rec) return done({ error: 'not_found' })
    const r = await this.agents.coachRecap({ memory: await memoryOf('hero'), tag: await handKeyOf(handId), summary: heroHandSummary(rec) }, new AbortController().signal)
    if (!r.ok || !r.args) return done({ error: r.error ?? 'failed' })
    const recap = pickRecap(r.args)
    await saveReview(handId, JSON.stringify(recap))
    done({ review: recap })
  }

  private addCoach(e: Omit<CoachEntry, 'id' | 'handNo'>): CoachEntry {
    const entry: CoachEntry = { id: randomUUID(), handNo: this.table?.handNumber() ?? 0, ...e }
    this.coachThread.push(entry)
    this.emit('coach:upsert', { ...entry })
    return entry
  }

  private patchCoach(entry: CoachEntry, patch: Partial<CoachEntry>) {
    Object.assign(entry, patch)
    if (patch.error === undefined && 'error' in patch) delete entry.error
    this.emit('coach:upsert', { ...entry })
  }

  private heroSituation(t: Table) {
    const n = this.nums
    const extra = n
      ? `本地计算：胜率约 ${Math.round(n.eq * 100)}%（对在手对手的随机手牌），所需胜率 ${(n.need * 100).toFixed(1)}%，出路 ${n.outs ?? '—'}，当前牌型 ${n.handName}，简单规则建议 ${n.sugg}`
      : undefined
    return situation(t, this.seats, 0, { you: false, extra })
  }

  // ---- 一手结束 ----

  private async onHandEnd() {
    const t = this.table!
    if (this.endKey === t.handNumber()) return
    this.endKey = t.handNumber()
    this.thinking = null
    const won = new Map<number, { amount: number; name: string | null }>()
    for (const w of t.winners()) won.set(w.seat, { amount: (won.get(w.seat)?.amount ?? 0) + w.amount, name: w.handName ?? won.get(w.seat)?.name ?? null })
    for (const [seat, w] of won) this.sys(`${this.seats[seat].name} 赢得 ${fmt(w.amount)}${w.name ? ' · ' + w.name : ''}`)
    const { smallBlind: sb, bigBlind: bb } = t.stakes()
    const board = t.communityCards()
    const holes = t.holeCards()
    const rec = handRecord(t, this.seats, this.mode, { sb, bb }, (i) => handName(holes[i]!.concat(board)))
    this.results.push(rec)
    if (this.results.length > 3) this.results.shift()
    const tableId = this.tableId
    const rid = this.runId
    for (const [pid, note] of this.notes) void addMemory(pid, note).catch((e) => console.error('addMemory failed', e))
    this.notes.clear()
    if (this.mode === 'coach') this.recap = 'pending'
    this.lastRecord = { id: null, rec }
    this.broadcast()
    let id: number | null = null
    try {
      id = await insertHand(tableId, rec)
      this.emit('hands:changed', undefined)
    } catch (e) {
      console.error('insertHand failed', e)
    }
    if (rid !== this.runId) return
    this.lastRecord = { id, rec }
    if (this.mode === 'coach' && this.recap === 'pending' && this.coachBusy === null) void this.runRecap()
  }

  // ---- 公屏与视图 ----

  private push(m: Omit<ChatMessage, 'id' | 'at'>): ChatMessage {
    const msg = { id: randomUUID(), at: Date.now(), ...m } as ChatMessage
    this.chat.push(msg)
    if (this.chat.length > MAX_CHAT) this.chat.splice(0, this.chat.length - MAX_CHAT)
    this.emit('chat:append', msg)
    return msg
  }

  private sys(text: string, cards?: string[]) {
    this.push({ kind: 'sys', text, ...(cards && { cards }) })
  }

  private bubble(seat: number, text: string) {
    this.bubbles.set(seat, { text, until: Date.now() + BUBBLE_MS })
    const rid = this.runId
    setTimeout(() => rid === this.runId && this.broadcast(), BUBBLE_MS)
  }

  private equityFor(t: Table, seat: number, iters: number) {
    const h = t.holeCards()[seat]
    if (!h) return 0
    const opp = t.seats().filter((s, j) => j !== seat && s && !s.out && !s.folded).length
    return equity(h, t.communityCards(), opp, iters, this.rng)
  }

  // 原型 computeNums
  private numsFor(t: Table, seat: number, iters: number): Nums | null {
    const s = t.seats()[seat]!
    const h = t.holeCards()[seat]
    if (s.folded || !h) return null
    const opp = t.seats().filter((q, j) => j !== seat && q && !q.out && !q.folded).length
    const eq = this.equityFor(t, seat, iters)
    const L = heroLegal(t)
    const need = L.toCall > 0 ? L.toCall / (t.totalPot() + L.toCall) : 0
    const fair = 1 / (opp + 1)
    const sugg = L.toCall === 0 ? (eq > fair * 1.6 ? '下注' : '过牌') : eq >= need ? (eq > fair * 2.2 && L.canRaise ? '加注' : '跟注') : '弃牌'
    return { eq, need, outs: outs(h, t.communityCards()), handName: handName(h.concat(t.communityCards())), sugg }
  }

  private recordUsage(u: Usage) {
    const row: UsageRow = { at: Date.now(), ...u }
    if (this.table && u.tableId === this.tableId) this.usage.push(row)
    insertUsage(row).then(
      () => this.emit('usage:changed', undefined),
      (e) => console.error('insertUsage failed', e)
    )
  }

  broadcast() {
    const v = this.view()
    if (v) this.emit('table:view', v)
  }

  view(): TableView | null {
    const t = this.table
    if (!t) return null
    const coach: CoachState | null =
      this.mode === 'coach' ? { busy: this.coachBusy, locked: this.locked(), canNext: this.canNext() } : null
    return buildTableView({
      table: t,
      seats: this.seats,
      mode: this.mode,
      guided: this.guided,
      started: this.started,
      thinking: this.thinking,
      bubbles: this.bubbles,
      nums: this.nums,
      numsKey: this.numsKey,
      heroKey: this.heroKey,
      stalled: this.stalled,
      coach,
      cost: costTotal(this.usage),
      now: Date.now()
    })
  }

  private tag(t: Table): UsageTag {
    return { tableId: this.tableId, handNo: t.handNumber() }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const pickRecap = (r: Recap): Recap => ({ headline: String(r.headline), good: String(r.good), improve: String(r.improve), tip: String(r.tip) })

// 模型给出的动作规范化为引擎一定接受的动作（discussion §2、§14 F3）
export function normalize(t: Table, a: RawAct): [ActionType, number?] {
  const L = t.legalActions()
  const action = String(a.action ?? '').trim().toLowerCase()
  const passive: [ActionType] = [L.toCall === 0 ? 'check' : 'call']
  const aggressive = ['bet', 'raise', 'allin', 'all-in', 'all_in', 'all in', 'shove']
  if (aggressive.includes(action)) {
    const r = L.chipRange
    if (!r) return passive
    const type: ActionType = L.actions.includes('bet') ? 'bet' : 'raise'
    const n = Number(a.to)
    const to = action.startsWith('all') || action === 'shove' ? r.max : Number.isFinite(n) ? Math.round(n) : r.min
    return [type, Math.max(r.min, Math.min(r.max, to))]
  }
  if (action === 'fold') return L.toCall === 0 ? passive : ['fold']
  return passive
}
