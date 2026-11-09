// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { feltOf, TableStage, type SeatView } from '../src'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it.each([7, 8, 9, 10])('%i人竖屏座位保留底部本人位置，座位块在390×650舞台内互不重叠', async (count) => {
  const host = document.createElement('div')
  const root = createRoot(host)
  const seats: SeatView[] = Array.from({ length: count }, (_, i) => ({
    name: `玩家${i}`, ini: '玩', hue: 25, tag: '', stack: 2000, bet: 0,
    isDealer: false, isSB: false, isBB: false, folded: false, out: false,
    allin: false, status: '', statusTone: 'muted', thinking: false,
    winner: false, hasCards: true
  }))
  try {
    await act(async () => root.render(
      <TableStage seats={seats} board={[]} pot={0} done={false} handNo={1}
        heroSeat={0} heroTurn={false} felt={feltOf({ felt: 'green', feltCustom: '#000000' })}
        back="red" fx="off" compact labels={{ pot: '底池', sb: '小盲', bb: '大盲' }} />
    ))
    const points = [...host.querySelectorAll<HTMLElement>('[data-table-seat]')].map(el => ({
      x: parseFloat(el.style.left) * 390 / 100,
      y: parseFloat(el.style.top) * 650 / 100
    }))
    expect(points).toHaveLength(count)
    expect(points[0].x).toBeCloseTo(195)
    expect(points[0].y).toBeGreaterThan(550)
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(56)
      expect(point.x).toBeLessThanOrEqual(334)
      expect(point.y).toBeGreaterThanOrEqual(45)
      expect(point.y).toBeLessThanOrEqual(605)
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(Math.abs(points[i].x - points[j].x) >= 112 || Math.abs(points[i].y - points[j].y) >= 90).toBe(true)
      }
    }
  } finally {
    await act(async () => root.unmount())
  }
})
