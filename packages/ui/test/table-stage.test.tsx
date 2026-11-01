// @vitest-environment happy-dom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feltOf, TableStage, type DealCard, type Fx, type SeatView } from '../src'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const seat = (o: Partial<SeatView> = {}): SeatView => ({
  name: 'P', tag: '', ini: 'P', hue: 25, stack: 1000, bet: 0, isDealer: false, isSB: false, isBB: false,
  folded: false, out: false, allin: false, status: '', statusTone: 'muted', thinking: false, winner: false, hasCards: true, ...o
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  // happy-dom 没有 Web Animations；特效节点在 onfinish 前留在特效层里，便于断言
  Element.prototype.animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

const render = (seats: SeatView[], o: { heroSeat?: number | null; handNo?: number; dealId?: string | null; dealOrder?: DealCard[]; onDealStart?: (count: number) => void; fx?: Fx } = {}) =>
  act(() =>
    root.render(
      <TableStage seats={seats} board={[]} pot={30} done={false} handNo={o.handNo ?? 1} heroSeat={o.heroSeat === undefined ? 0 : o.heroSeat} heroTurn={false}
        felt={feltOf({ felt: 'green', feltCustom: '#000000' })} back="red" fx={o.fx ?? 'full'} dealId={o.dealId} dealOrder={o.dealOrder} onDealStart={o.onDealStart} labels={{ pot: 'Pot', sb: 'SB', bb: 'BB' }} />
    )
  )
const layerText = () => host.querySelector('.z-\\[8\\]')!.textContent

describe('TableStage', () => {
  it('StrictMode模拟清理不取消首手发牌或重复启动声音，真实卸载仍清理', async () => {
    const start = vi.fn()
    await act(async () => root.render(
      <StrictMode>
        <TableStage seats={[seat(), seat()]} board={[]} pot={30} done={false} handNo={1} heroSeat={0} heroTurn={false}
          felt={feltOf({ felt: 'green', feltCustom: '#000000' })} back="red" fx="full" dealId="strict-deal" onDealStart={start} labels={{ pot: 'Pot', sb: 'SB', bb: 'BB' }} />
      </StrictMode>
    ))
    const animations = vi.mocked(Element.prototype.animate).mock.results.map((r) => r.value as Animation)
    expect(animations).toHaveLength(4)
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(4)
    expect(animations.every((a) => vi.mocked(a.cancel).mock.calls.length === 0)).toBe(true)
    await act(async () => root.unmount())
    expect(animations.every((a) => vi.mocked(a.cancel).mock.calls.length === 1)).toBe(true)
    root = createRoot(host)
  })

  it('首挂载收到显式发牌事件时按170ms逐圈发牌，500ms飞行，并在DOM就绪后通知一次', () => {
    const start = vi.fn(() => expect(host.querySelectorAll('[data-seat-cards]')).toHaveLength(2))
    render([seat(), seat()], { dealId: 'table-1:hand-1', onDealStart: start })
    const calls = vi.mocked(Element.prototype.animate).mock.calls
    expect(calls).toHaveLength(4)
    expect(calls.map((c) => (c[1] as KeyframeAnimationOptions).delay)).toEqual([0, 170, 340, 510])
    expect(calls.every((c) => (c[1] as KeyframeAnimationOptions).duration === 500)).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(4)
  })

  it('按引擎给的逐张顺序发牌，不看 DOM 座位顺序', () => {
    const start = vi.fn()
    const animate = vi.mocked(Element.prototype.animate)
    const seen: Element[] = []
    animate.mockImplementation(function (this: Element) {
      seen.push(this)
      return { cancel: vi.fn() } as unknown as Animation
    })
    const card = (s: number, r: number) => host.querySelector(`[data-seat-cards="${s}"]`)!.children[r]
    render([seat(), seat()], {
      dealId: 'deal-order',
      dealOrder: [{ seat: 1, round: 0 }, { seat: 0, round: 1 }, { seat: 0, round: 0 }],
      onDealStart: start
    })
    expect(seen).toEqual([card(1, 0), card(0, 1), card(0, 0)])
    expect(start).toHaveBeenCalledWith(3)
  })

  it('显式null恢复快照不自动发牌，随后换手仍不播', () => {
    const start = vi.fn()
    render([seat(), seat()], { dealId: null, handNo: 1, onDealStart: start })
    render([seat(), seat()], { dealId: null, handNo: 2, onDealStart: start })
    expect(Element.prototype.animate).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('同一deal重渲染、替换回调和消费为null均不重播或取消在途动画', () => {
    const start = vi.fn()
    render([seat(), seat()], { dealId: 'deal-a', onDealStart: start })
    const animations = vi.mocked(Element.prototype.animate).mock.results.map((r) => r.value as Animation)
    const replacement = vi.fn()
    render([seat(), seat()], { dealId: 'deal-a', onDealStart: replacement })
    render([seat(), seat()], { dealId: null, onDealStart: replacement })
    expect(Element.prototype.animate).toHaveBeenCalledTimes(4)
    expect(start).toHaveBeenCalledTimes(1)
    expect(replacement).not.toHaveBeenCalled()
    expect(animations.every((a) => vi.mocked(a.cancel).mock.calls.length === 0)).toBe(true)
  })

  it('关闭视觉效果仍消费显式deal并通知声音启动，不创建动画', () => {
    const start = vi.fn()
    render([seat(), seat()], { dealId: 'deal-a', fx: 'off', onDealStart: start })
    expect(Element.prototype.animate).not.toHaveBeenCalled()
    // 关闭特效时也从 DOM 数出实际牌数，声音仍有正确张数
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(4)
    render([seat(), seat()], { dealId: 'deal-a', fx: 'full', onDealStart: start })
    expect(Element.prototype.animate).not.toHaveBeenCalled()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('换手或新deal到来时取消旧发牌序列，卸载也清理动画', async () => {
    render([seat(), seat()], { dealId: 'deal-a' })
    const first = vi.mocked(Element.prototype.animate).mock.results.map((r) => r.value as Animation)
    expect(first).toHaveLength(4)
    render([seat(), seat()], { handNo: 2, dealId: 'deal-b' })
    expect(first.every((a) => vi.mocked(a.cancel).mock.calls.length === 1)).toBe(true)
    const second = vi.mocked(Element.prototype.animate).mock.results.slice(4).map((r) => r.value as Animation)
    expect(second).toHaveLength(4)
    await act(async () => root.unmount())
    expect(second.every((a) => vi.mocked(a.cancel).mock.calls.length === 1)).toBe(true)
    root = createRoot(host)
  })

  it('同手号换桌以新deal身份重新发牌，并取消旧桌序列', () => {
    render([seat(), seat()], { handNo: 1, dealId: 'table-a:1' })
    const first = vi.mocked(Element.prototype.animate).mock.results.map((r) => r.value as Animation)
    const start = vi.fn()
    render([seat(), seat()], { handNo: 1, dealId: 'table-b:1', onDealStart: start })
    expect(first).toHaveLength(4)
    expect(first.every((a) => vi.mocked(a.cancel).mock.calls.length === 1)).toBe(true)
    expect(Element.prototype.animate).toHaveBeenCalledTimes(8)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('已消费id再次出现不重播；关闭视觉效果会取消当前序列', () => {
    render([seat(), seat()], { dealId: 'deal-a' })
    const first = vi.mocked(Element.prototype.animate).mock.results.map((r) => r.value as Animation)
    render([seat(), seat()], { dealId: null, fx: 'off' })
    expect(first).toHaveLength(4)
    expect(first.every((a) => vi.mocked(a.cancel).mock.calls.length === 1)).toBe(true)
    render([seat(), seat()], { dealId: 'deal-a', fx: 'full' })
    expect(Element.prototype.animate).toHaveBeenCalledTimes(4)
  })

  it('未提供dealId时保留官网按hand变化的自动发牌', () => {
    render([seat(), seat()], { handNo: 1 })
    expect(Element.prototype.animate).not.toHaveBeenCalled()
    render([seat(), seat()], { handNo: 2 })
    expect(Element.prototype.animate).toHaveBeenCalledTimes(4)
  })

  it('文字全部来自 labels；heroSeat 为 null 时没有座位按玩家本人显示', () => {
    render([seat({ isSB: true, cards: ['As', 'Kd'] }), seat({ isBB: true, cards: ['2c', '3c'] })], { heroSeat: null })
    expect(host.textContent).toContain('Pot')
    expect(host.textContent).toContain('SB')
    expect(host.textContent).toContain('BB')
    // 玩家本人的牌是 60×84，对手是 44×62
    const widths = [...host.querySelectorAll<HTMLElement>('[data-seat-cards] > div')].map((d) => d.style.width)
    expect(widths).toEqual(['44px', '44px', '44px', '44px'])
    render([seat({ isSB: true, cards: ['As', 'Kd'] }), seat({ isBB: true, cards: ['2c', '3c'] })], { heroSeat: 0 })
    expect([...host.querySelectorAll<HTMLElement>('[data-seat-cards] > div')].map((d) => d.style.width)).toEqual(['60px', '60px', '44px', '44px'])
  })

  it('加注特效：下注增加、lastAct 为 bet/raise、状态变化三者同时满足才播', () => {
    render([seat(), seat({ bet: 10, status: 'Call 10', lastAct: 'call' })])
    render([seat(), seat({ bet: 40, status: 'Raise to 40', lastAct: 'raise' })])
    expect(layerText()).toContain('Raise to 40')
  })

  it('下注增加但 lastAct 不是 bet/raise，或状态没变，都不播加注特效', () => {
    render([seat(), seat({ bet: 10, status: '加注到 10', lastAct: 'call' })])
    render([seat(), seat({ bet: 20, status: '加注到 20', lastAct: 'call' })])
    expect(layerText()).not.toContain('加注到 20')
    render([seat(), seat({ bet: 30, status: '加注到 20', lastAct: 'raise' })])
    expect(layerText()).not.toContain('加注到 20')
  })

  it('下注额没增加时不播加注特效：加注者再次思考、加注后赢下', () => {
    render([seat(), seat({ bet: 40, status: 'Raise to 40', lastAct: 'raise' })])
    render([seat(), seat({ bet: 40, status: 'Thinking…', lastAct: 'raise' })])
    expect(layerText()).not.toContain('Thinking…')
    render([seat(), seat({ bet: 40, status: 'Won 80', lastAct: 'raise' })])
    expect(layerText()).not.toContain('Won 80')
  })

  it('全下与加注二选一：全下时只出 ALL IN 标签', () => {
    render([seat(), seat({ bet: 10, status: 'x' })])
    render([seat(), seat({ bet: 1000, allin: true, status: 'All in', lastAct: 'raise' })])
    expect(layerText()).toContain('ALL IN')
    expect(layerText()).not.toContain('All in')
  })
})
