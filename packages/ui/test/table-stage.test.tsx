// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feltOf, TableStage, type SeatView } from '../src'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const seat = (o: Partial<SeatView> = {}): SeatView => ({
  name: 'P', tag: '', ini: 'P', hue: 25, stack: 1000, bet: 0, isDealer: false, isSB: false, isBB: false,
  folded: false, out: false, allin: false, status: '', statusTone: 'muted', thinking: false, winner: false, hasCards: true, ...o
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  // happy-dom 没有 Web Animations；特效节点在 onfinish 前留在特效层里，便于断言
  Element.prototype.animate = vi.fn(() => ({}) as Animation)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => (act(() => root.unmount()), host.remove()))

const render = (seats: SeatView[], o: { heroSeat?: number | null; handNo?: number } = {}) =>
  act(() =>
    root.render(
      <TableStage seats={seats} board={[]} pot={30} done={false} handNo={o.handNo ?? 1} heroSeat={o.heroSeat === undefined ? 0 : o.heroSeat} heroTurn={false}
        felt={feltOf({ felt: 'green', feltCustom: '#000000' })} back="red" fx="full" labels={{ pot: 'Pot', sb: 'SB', bb: 'BB' }} />
    )
  )
const layerText = () => host.querySelector('.z-\\[8\\]')!.textContent

describe('TableStage', () => {
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
