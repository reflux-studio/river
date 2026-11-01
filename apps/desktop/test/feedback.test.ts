import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEAL_CARD_DURATION_MS, DEAL_CARD_INTERVAL_MS } from '@river/ui/deal-timing'
import * as db from '../src/main/db'
import { commandHandlers } from '../src/main/ipc'
import type { AgentDeps } from '../src/main/table/runner'
import type { ReadyDecision, TableStart } from '../src/shared/types'
import { delayed, drive, finishDeal, harness, okCall, seeded, setup, teardown, tick } from './table-helpers'

const free: TableStart = { size: 3, blinds: 1, picks: ['li', 'k'], mode: 'free', guided: false }
const coach = { ...free, mode: 'coach' as const }

afterEach(teardown)
beforeEach(() => setup())

describe('牌局语义反馈', () => {
  it('最快模式六人发完十二张前不启动AI或开放行动，到期才进入首个决策', async () => {
    const opponent = vi.fn(async () => okCall({ action: 'call' }))
    const h = await harness({ agents: { opponentAct: opponent } })
    await h.runner.start({ ...free, size: 6 })
    const deal = h.of('table:feedback').find((e) => e.kind === 'deal')!
    expect(deal.count).toBe(12)
    // 逐张顺序来自引擎：先每人第一张，再每人第二张
    expect(deal.cards!.map((c) => `${c.seat}:${c.round}`)).toEqual([
      '0:0', '1:0', '2:0', '3:0', '4:0', '5:0',
      '0:1', '1:1', '2:1', '3:1', '4:1', '5:1'
    ])
    expect(h.runner.table!.playerToAct()).not.toBe(0)
    const wait = (deal.count! - 1) * DEAL_CARD_INTERVAL_MS + DEAL_CARD_DURATION_MS
    expect(opponent).not.toHaveBeenCalled()
    expect(h.runner.view()!.hero.canAct).toBe(false)
    expect(h.of('table:feedback').some((e) => e.kind === 'turn')).toBe(false)
    await tick(wait - 1)
    expect(opponent).not.toHaveBeenCalled()
    h.runner.heroAct({ type: 'call' })
    h.runner.broadcast()
    expect(h.of('table:feedback').filter((e) => e.kind === 'call')).toHaveLength(0)
    await tick(1)
    expect(opponent).toHaveBeenCalledTimes(1)
  })

  it('发牌期间离桌或换桌取消旧截止计时，不触发旧桌AI', async () => {
    const opponent = vi.fn(async () => okCall({ action: 'call' }))
    const h = await harness({ agents: { opponentAct: opponent } })
    await h.runner.start({ ...free, size: 6 })
    const old = h.runner.tableId
    await tick(300)
    await h.runner.leave()
    await tick(5000)
    expect(opponent).not.toHaveBeenCalled()
    expect(h.runner.table).toBeNull()
    await h.runner.start({ ...free, size: 6 })
    await tick(300)
    await h.runner.start({ ...free, size: 6 })
    const current = h.runner.tableId
    expect(current).not.toBe(old)
    const count = h.of('table:feedback').filter((e) => e.tableId === current && e.kind === 'deal')[0].count!
    await tick((count - 1) * DEAL_CARD_INTERVAL_MS + DEAL_CARD_DURATION_MS - 1)
    expect(opponent).not.toHaveBeenCalled()
    await tick(1)
    expect(opponent).toHaveBeenCalledTimes(1)
  })

  it('发牌期间教练提问可以完成，但回答后的loop不能提前启动讲解或操作', async () => {
    const speak = vi.fn(async () => ({ ok: true, aborted: false, text: '' }))
    const h = await harness({ rng: seeded(17), agents: { coachSpeak: speak } })
    await h.runner.start(coach)
    expect(h.runner.table!.playerToAct()).toBe(0)
    h.runner.ask('解释一下')
    await tick(10)
    expect(h.runner.coachThread.some((e) => e.kind === 'answer' && e.status === 'done')).toBe(true)
    expect(speak).not.toHaveBeenCalled()
    expect(h.runner.view()!.hero.canAct).toBe(false)
    expect(h.of('table:feedback').some((e) => e.kind === 'turn')).toBe(false)
  })

  it('首手先推带桌身份的视图，再发底牌和盲注；重复广播不重放', async () => {
    const h = await harness()
    await h.runner.start(free)
    const sounds = h.events.filter((e) => e.event === 'table:feedback').map((e) => e.payload as { kind: string; seq: number; tableId: string })
    expect(sounds.filter((e) => e.kind === 'deal')).toHaveLength(1)
    expect(sounds.filter((e) => e.kind === 'blind')).toHaveLength(2)
    expect(h.runner.view()).toMatchObject({ tableId: h.runner.tableId })
    expect(typeof h.runner.view()!.hero.canAct).toBe('boolean')
    const firstSound = h.events.findIndex((e) => e.event === 'table:feedback')
    expect(h.events.slice(0, firstSound).some((e) => e.event === 'table:view')).toBe(true)
    h.runner.broadcast()
    h.runner.broadcast()
    expect(h.events.filter((e) => e.event === 'table:feedback')).toHaveLength(sounds.length)
    expect(sounds.map((e) => e.seq)).toEqual(sounds.map((_, i) => i + 1))
  })

  it('教练的首次过渡广播不会提前开放操作或发轮到你；完成与问答恢复只提醒一次', async () => {
    const h = await harness({ agents: {
      coachSpeak: async (_o, _delta, signal) => delayed<Awaited<ReturnType<AgentDeps['coachSpeak']>>>(1000, signal, () => ({ ok: true, aborted: false, text: '好' }), () => ({ ok: false, aborted: true, text: '' })),
      coachAsk: async (_o, _delta, signal) => delayed<Awaited<ReturnType<AgentDeps['coachAsk']>>>(300, signal, () => ({ ok: true, aborted: false, text: '答' }), () => ({ ok: false, aborted: true, text: '' }))
    } })
    await h.runner.start(coach)
    const turnCount = () => h.events.filter((e) => e.event === 'table:feedback' && (e.payload as { kind: string }).kind === 'turn').length
    expect(h.views.every((v) => !v.hero.canAct)).toBe(true)
    expect(turnCount()).toBe(0)
    await finishDeal(h)
    await tick(2100)
    expect(h.runner.view()!.hero.canAct).toBe(true)
    expect(turnCount()).toBe(1)
    h.runner.ask('为什么？')
    expect(h.runner.view()!.hero.canAct).toBe(false)
    await tick(400)
    expect(h.runner.view()!.hero.canAct).toBe(true)
    expect(turnCount()).toBe(1)
  })

  it('跟注打到摊牌：每次过牌可分别识别，公共牌/收注/派奖不重复', async () => {
    const h = await harness({ rng: seeded(1) })
    await h.runner.start(free)
    await drive(h, () => h.of('hands:changed').length === 1)
    const events = h.events.filter((e) => e.event === 'table:feedback').map((e) => e.payload as { kind: string; count?: number; seq: number })
    expect(events.filter((e) => e.kind === 'check').length).toBeGreaterThanOrEqual(6)
    expect(events.filter((e) => e.kind === 'board').map((e) => e.count)).toEqual([3, 1, 1])
    expect(events.filter((e) => e.kind === 'collect')).toHaveLength(1)
    expect(events.filter((e) => e.kind === 'showdown')).toHaveLength(1)
    expect(events.filter((e) => e.kind === 'payout')).toHaveLength(1)
    expect(new Set(events.map((e) => e.seq)).size).toBe(events.length)
  })

  it('全下动作替代普通行动，未跟注返还不伪造下注；每手只派奖一次', async () => {
    const h = await harness({ agents: { opponentAct: async () => okCall({ action: 'allin' }) } })
    await h.runner.start(free)
    await drive(h, () => h.of('hands:changed').length === 1, () => 'call')
    const sounds = h.events.filter((e) => e.event === 'table:feedback').map((e) => e.payload as { kind: string; seat?: number })
    const log = h.runner.table!.handLog().filter((e) => 'seat' in e)
    expect(sounds.filter((e) => e.kind === 'allin')).toHaveLength(log.filter((e) => 'allIn' in e && e.allIn).length)
    expect(sounds.filter((e) => e.kind === 'payout')).toHaveLength(1)
    expect(sounds.some((e) => e.kind === 'return')).toBe(false)
  })

  it('离桌有递增视图版本；bootstrap 水位不重新生成事件', async () => {
    const h = await harness()
    await h.runner.start(free)
    const first = await commandHandlers(h.runner)['app.bootstrap']()
    expect(first.feedback).toMatchObject({ tableId: h.runner.tableId })
    expect(first.feedback.seq).toBeGreaterThan(0)
    expect(first.viewRevision).toBeGreaterThan(0)
    const count = h.events.length
    await commandHandlers(h.runner)['app.bootstrap']()
    expect(h.events).toHaveLength(count)
    await h.runner.leave()
    const update = h.of('table:view').at(-1)!
    expect(update).toMatchObject({ view: null })
    expect(update.revision).toBeGreaterThan(first.viewRevision)
  })

  it('短码大盲使用全下反馈，跨手序号继续递增，换桌才重置', async () => {
    const h = await harness()
    await h.runner.start(free)
    await drive(h, () => h.of('hands:changed').length === 1)
    const before = h.runner.snapshot()
    h.runner.table!.setStack(1, 1)
    h.runner.nextHand()
    const hand2 = h.of('table:feedback').filter((e) => e.handNo === 2)
    expect(hand2[0].seq).toBeGreaterThan(before.feedback.seq)
    expect(hand2.some((e) => e.kind === 'allin' && e.seat === 1)).toBe(true)
    expect(hand2.some((e) => e.kind === 'blind' && e.seat === 1)).toBe(false)
    await h.runner.start(free)
    const current = h.runner.snapshot()
    expect(current.view!.tableId).not.toBe(before.view!.tableId)
    expect(current.viewRevision).toBeGreaterThan(before.viewRevision)
    expect(h.of('table:feedback').filter((e) => e.tableId === current.view!.tableId)[0].seq).toBe(1)
  })

  it('无人跟注直接结束不播放摊牌，通知回调同步关闭旧决策', async () => {
    const decisions: (ReadyDecision | null)[] = []
    const h = await harness({ agents: { opponentAct: async () => okCall({ action: 'fold' }) }, onDecision: (d) => decisions.push(d) })
    await h.runner.start(free)
    await drive(h, () => h.of('hands:changed').length === 1, () => 'fold')
    expect(h.of('table:feedback').filter((e) => e.kind === 'showdown')).toHaveLength(0)
    expect(h.of('table:feedback').filter((e) => e.kind === 'payout')).toHaveLength(1)
    expect(decisions.at(-1)).toBeNull()
    await h.runner.leave()
    expect(decisions.at(-1)).toBeNull()
  })

  it('对手调用失败、无效玩家操作不产生成功动作声，重试后的动作仅一次', async () => {
    let fail = true
    const h = await harness({ agents: { opponentAct: async () => fail ? { ok: false, aborted: false, text: '', error: 'offline' } : okCall({ action: 'call' }) } })
    await h.runner.start(free)
    await finishDeal(h)
    await tick(10)
    expect(h.runner.view()!.stalled).not.toBeNull()
    const count = h.of('table:feedback').length
    h.runner.heroAct({ type: 'call' })
    h.runner.broadcast()
    expect(h.of('table:feedback')).toHaveLength(count)
    fail = false
    h.runner.retry()
    await tick(450)
    expect(h.of('table:feedback').filter((e) => e.kind === 'call')).toHaveLength(1)
  })

  it('多边池结算只派奖一次，并携带玩家净收益', async () => {
    const h = await harness({ agents: { opponentAct: async () => okCall({ action: 'allin' }) } })
    await h.runner.start(free)
    await drive(h, () => h.of('hands:changed').length === 1)
    h.runner.table!.setStack(0, 1000)
    h.runner.table!.setStack(1, 300)
    h.runner.table!.setStack(2, 600)
    h.runner.nextHand()
    await drive(h, () => h.of('hands:changed').length === 2)
    expect(new Set(h.runner.table!.winners().map((w) => w.pot)).size).toBeGreaterThan(1)
    const payouts = h.of('table:feedback').filter((e) => e.kind === 'payout' && e.handNo === 2)
    expect(payouts).toHaveLength(1)
    expect(payouts[0].heroNet).toBe(h.runner.view()!.result!.net)
  })

  it('教练失败后解锁仍提醒一次，重试同决策不重复提醒', async () => {
    const h = await harness({ agents: { coachSpeak: async () => ({ ok: false, aborted: false, text: '', error: 'offline' }) } })
    await h.runner.start(coach)
    await finishDeal(h)
    await tick(1000)
    expect(h.runner.view()!.hero.canAct).toBe(true)
    expect(h.of('table:feedback').filter((e) => e.kind === 'turn')).toHaveLength(1)
    h.runner.retryCoach()
    await tick(1)
    expect(h.runner.view()!.hero.canAct).toBe(true)
    expect(h.of('table:feedback').filter((e) => e.kind === 'turn')).toHaveLength(1)
  })
})

describe('声音设置', () => {
  it('默认开启 50%，拒绝非法值且不污染当前设置', async () => {
    expect(db.getSettings()).toMatchObject({ soundEnabled: true, soundVolume: 50, notificationsEnabled: true })
    const handlers = commandHandlers((await harness()).runner)
    for (const patch of [{ soundEnabled: 'yes' }, { soundVolume: NaN }, { soundVolume: -1 }, { soundVolume: 101 }, { notificationsEnabled: 'yes' }]) {
      await expect(handlers['settings.update'](patch as never)).rejects.toThrow()
    }
    expect(db.getSettings()).toMatchObject({ soundEnabled: true, soundVolume: 50, notificationsEnabled: true })
    await handlers['settings.update']({ soundEnabled: false, soundVolume: 0, notificationsEnabled: false })
    expect(db.getSettings()).toMatchObject({ soundEnabled: false, soundVolume: 0, notificationsEnabled: false })
  })

  it('关闭后台提醒后通知开关交给主进程刷新', async () => {
    const changed = vi.fn()
    const handlers = commandHandlers((await harness()).runner, {
      version: () => '0.3.0', update: () => null, install: () => {}, check: async () => ({ state: 'latest' }),
      fx: () => null, packaged: false, notificationsChanged: changed
    })
    await handlers['settings.update']({ notificationsEnabled: false })
    expect(changed).toHaveBeenCalledTimes(1)
    await handlers['settings.update']({ soundVolume: 10 })
    expect(changed).toHaveBeenCalledTimes(1)
  })
})
