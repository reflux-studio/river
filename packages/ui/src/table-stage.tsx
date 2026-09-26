import { fmt, type Card } from '@river/engine'
import { useRef, type ReactNode } from 'react'
import { EmptyCard, PlayingCard } from './cards'
import type { feltOf } from './felt'
import { useTableFx } from './fx'
import { BetChip, ChipStacks, Seat } from './seat'
import type { Back, Fx, SeatView } from './types'

// 桌面椭圆、底池、公共牌、下注筹码、座位与特效层。要缩放请包一层外部元素：全下震屏会改写本组件根节点的 transform
export function TableStage({ seats, board, pot, done, handNo, heroSeat, heroTurn, felt: F, back, fx, labels, children }: {
  seats: SeatView[]
  board: Card[]
  pot: number
  done: boolean
  handNo: number
  heroSeat: number | null
  heroTurn: boolean
  felt: ReturnType<typeof feltOf>
  back: Back
  fx: Fx
  labels: { pot: string; sb: string; bb: string }
  children?: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fxRef = useRef<HTMLDivElement>(null)
  useTableFx(rootRef, fxRef, { handNo, board, seats, done }, fx, back)
  const n = seats.length
  const potInk = F.dark ? '#fff' : '#1d1d1f'
  return (
    <div ref={rootRef} className="relative min-h-[560px] flex-1 overflow-hidden" style={{ background: F.dark ? '#f4f4f1' : '#fff' }}>
      {children}

      <div
        className="absolute inset-x-[13%] top-[15%] bottom-[16%] rounded-full"
        style={{
          background: `radial-gradient(ellipse 70% 65% at 50% 42%, color-mix(in oklch, ${F.felt}, white 14%) 0%, ${F.felt} 58%, color-mix(in oklch, ${F.felt}, black 28%) 100%)`,
          boxShadow: `0 0 0 12px ${F.rail}, 0 0 0 13px rgba(0,0,0,0.3), 0 22px 50px rgba(0,0,0,0.22), inset 0 0 50px rgba(0,0,0,${F.dark ? 0.35 : 0.08})`
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-[calc(13%+18px)] top-[calc(15%+18px)] bottom-[calc(16%+18px)] rounded-full border"
        style={{ borderColor: F.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)' }}
      />

      <div className="absolute top-[48%] left-1/2 z-[1] flex -translate-1/2 flex-col items-center gap-3">
        <div data-pot className="flex min-h-[30px] items-center gap-2">
          {pot > 0 && !done && <ChipStacks amount={pot} />}
          <div className="flex items-baseline gap-2 rounded-full px-3.5 py-[5px] text-sm whitespace-nowrap" style={{ background: F.dark ? 'rgba(0,0,0,0.38)' : '#fff', color: potInk }}>
            <span className="opacity-75">{labels.pot}</span>
            <span className="font-semibold">{fmt(pot)}</span>
          </div>
        </div>
        <div data-boardrow className="flex gap-[7px] [perspective:600px]">
          {[0, 1, 2, 3, 4].map((k) =>
            board[k] ? <div key={board[k]} data-board-card><PlayingCard card={board[k]} /></div> : <EmptyCard key={k} border={F.dark ? 'rgba(255,255,255,0.22)' : '#d6d6d2'} />
          )}
        </div>
      </div>

      {seats.map((s, i) => s.bet > 0 && <BetChip key={i} amount={s.bet} i={i} n={n} dark={F.dark} />)}
      {seats.map((s, i) => <Seat key={i} seat={s} i={i} n={n} isHero={i === heroSeat} heroTurn={heroTurn} back={back} labels={labels} />)}
      <div ref={fxRef} className="pointer-events-none absolute inset-0 z-[8]" />
    </div>
  )
}
