// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ActionControls, Seat, type SeatView } from '../src'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('单张亮牌保留第二个槽位和卡背，不把已亮牌移到第一张', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  const seat: SeatView = {
    name: '玩家',
    ini: '玩',
    tag: '',
    hue: 0,
    stack: 100,
    bet: 0,
    isDealer: false,
    isSB: false,
    isBB: false,
    folded: false,
    out: false,
    allin: false,
    status: '',
    statusTone: 'muted',
    thinking: false,
    winner: false,
    hasCards: true,
    cards: [null, 'Ah']
  }
  await act(() =>
    root.render(
      <Seat seat={seat} i={0} n={10} isHero={false} heroTurn={false} back="red" labels={{ sb: '小盲', bb: '大盲' }} />
    )
  )
  const cards = host.querySelector('[data-seat-cards]')!
  expect(cards.children).toHaveLength(2)
  expect(cards.children[0].textContent).not.toContain('A')
  expect(cards.children[1].textContent).toContain('A')
  await act(() => root.unmount())
})

it('共用操作栏只发送所点击的动作，暂停时键盘也不能提交', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  const fold = vi.fn(),
    call = vi.fn(),
    raise = vi.fn()
  const props = {
    canAct: true,
    canRaise: true,
    draft: '100',
    isAllIn: false,
    foldLabel: '弃牌',
    callLabel: '跟注 10',
    raiseLabel: '加注到',
    onFold: fold,
    onCall: call,
    onRaise: raise,
    onStep: vi.fn(),
    onDraft: vi.fn(),
    onCommit: vi.fn()
  }
  await act(() => root.render(<ActionControls {...props} />))
  await act(() => (host.querySelectorAll('button')[1] as HTMLButtonElement).click())
  expect(call).toHaveBeenCalledTimes(1)
  expect(fold).not.toHaveBeenCalled()
  expect(raise).not.toHaveBeenCalled()
  await act(() => root.render(<ActionControls {...props} canAct={false} canRaise={false} />))
  expect(Array.from(host.querySelectorAll('button')).every((button) => button.disabled)).toBe(true)
  await act(() => (host.querySelectorAll('button')[1] as HTMLButtonElement).click())
  expect(call).toHaveBeenCalledTimes(1)
  await act(() => root.unmount())
})
