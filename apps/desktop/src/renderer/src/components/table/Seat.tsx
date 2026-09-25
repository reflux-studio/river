import { Avatar } from '@/components/Avatar'
import { CardBack, PlayingCard } from '@/components/PlayingCard'
import { chipBg, chipEdge, stacks } from '@/lib/felt'
import { fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SeatViewPublic } from '../../../../shared/types'

// 原型极坐标：第 0 位（玩家）在正下方，其余顺时针均分
export const angle = (i: number, n: number) => ((90 + (i * 360) / n) * Math.PI) / 180
export const polar = (i: number, n: number, rx: number, ry: number) => {
  const a = angle(i, n)
  return { left: `${50 + rx * Math.cos(a)}%`, top: `${50 + ry * Math.sin(a)}%` }
}

const BLUE = 'oklch(0.6 0.17 255)'
const GREEN = 'oklch(0.55 0.14 155)'
const RED = 'oklch(0.56 0.2 25)'
const TONE: Record<SeatViewPublic['statusTone'], { color: string; bg: string; dot: string; w: number }> = {
  muted: { color: '#55555a', bg: '#fff', dot: '#a1a1a6', w: 500 },
  blue: { color: BLUE, bg: '#fff', dot: BLUE, w: 500 },
  green: { color: '#fff', bg: GREEN, dot: '#fff', w: 600 },
  dark: { color: '#fff', bg: '#48484a', dot: '#8e8e93', w: 600 },
  red: { color: '#fff', bg: RED, dot: '#fff', w: 700 }
}

function Bubble({ text, up, seat }: { text: string; up: boolean; seat: number }) {
  return (
    <div className={cn('absolute left-1/2 z-[3] -translate-x-1/2', up ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+6px)]')}>
      <div
        data-bubble-in={seat}
        className="relative w-max max-w-[210px] rounded-[14px] bg-white px-[13px] py-2 text-left text-[13px] leading-[1.45] whitespace-normal text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.04)]"
        style={{ transformOrigin: up ? '50% 100%' : '50% 0%' }}
      >
        <div className={cn('absolute left-1/2 -ml-1.5 size-3 rotate-45 rounded-[2px] bg-white', up ? '-bottom-[5px]' : '-top-[5px]')} />
        <span className="relative">{text}</span>
      </div>
    </div>
  )
}

export function Seat({ seat: p, i, n, heroTurn }: { seat: SeatViewPublic; i: number; n: number; heroTurn: boolean }) {
  const isHero = i === 0
  const active = p.thinking || (isHero && heroTurn)
  const up = Math.sin(angle(i, n)) > -0.2
  const tone = TONE[p.statusTone]
  const dim = p.folded || p.out
  return (
    <div className="absolute flex -translate-1/2 flex-col items-center gap-1.5 whitespace-nowrap" style={{ ...polar(i, n, 40, 36), zIndex: p.bubble ? 6 : 2 }}>
      {p.bubble && up && <Bubble text={p.bubble} up seat={i} />}
      {p.cards ? (
        <div data-seat-cards={i} className={cn('-mb-3.5 flex', isHero ? 'gap-1' : 'gap-[3px]', (p.mucked || (isHero && p.folded)) && 'opacity-45 grayscale')}>
          {p.cards.map((c, k) =>
            isHero ? <PlayingCard key={c} card={c} w={60} h={84} rot={k ? 4 : -4} /> : <PlayingCard key={c} card={c} w={44} h={62} />
          )}
        </div>
      ) : (
        p.hasCards && (
          <div data-seat-cards={i} className="-mb-4 flex">
            <CardBack rot={-7} />
            <CardBack rot={7} className="-ml-2.5" />
          </div>
        )
      )}
      <div
        data-seat={i}
        className={cn('relative flex items-center gap-[9px] rounded-full bg-white py-1.5 pr-4 pl-1.5', dim && 'opacity-55 grayscale')}
        style={{
          border: active ? `2px solid ${BLUE}` : p.winner ? `2px solid ${GREEN}` : '1px solid #ebebe9',
          boxShadow: active
            ? '0 0 0 5px oklch(0.6 0.17 255 / 0.18), 0 4px 14px rgba(0,0,0,0.12)'
            : p.winner ? '0 0 0 6px oklch(0.55 0.14 155 / 0.22), 0 4px 14px rgba(0,0,0,0.12)' : '0 4px 14px rgba(0,0,0,0.1)'
        }}
      >
        <Avatar ini={p.ini} hue={isHero ? undefined : p.hue} size={36} />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{p.name}</span>
            {p.tag && <span className="rounded-[5px] bg-muted px-1.5 py-px text-[11px] text-subtle">{p.tag}</span>}
          </div>
          <span className="text-xs text-muted-foreground">{fmt(p.stack)}</span>
        </div>
        <div className="absolute -top-2.5 left-2.5 flex gap-1">
          {p.isSB && <span className="rounded-full bg-[oklch(0.58_0.15_250)] px-[7px] py-0.5 text-[11px] font-bold tracking-[0.02em] text-white shadow-[0_0_0_2px_#fff]">小盲</span>}
          {p.isBB && <span className="rounded-full bg-[oklch(0.8_0.15_80)] px-[7px] py-0.5 text-[11px] font-bold tracking-[0.02em] text-foreground shadow-[0_0_0_2px_#fff]">大盲</span>}
        </div>
        {p.isDealer && (
          <div className="absolute top-1/2 -right-[30px] flex size-[22px] -translate-y-1/2 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-foreground shadow-[inset_0_0_0_1.5px_#1d1d1f,0_2px_5px_rgba(0,0,0,0.3)]">
            D
          </div>
        )}
      </div>
      {p.status && (
        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
          style={{ background: tone.bg, color: tone.color, fontWeight: tone.w }}
        >
          <span className="size-1.5 rounded-full" style={{ background: tone.dot }} />
          {p.status}
        </div>
      )}
      {p.bubble && !up && <Bubble text={p.bubble} up={false} seat={i} />}
    </div>
  )
}

export function ChipStacks({ amount, w = 24 }: { amount: number; w?: number }) {
  const h = w * 0.54
  return (
    <div className="flex items-end gap-0.5 pb-[3px]">
      {stacks(amount).map((st, k) => (
        <div key={k} className="relative" style={{ width: w, height: h + (st.n - 1) * 3.5 }}>
          {Array.from({ length: st.n }, (_, j) => (
            <div
              key={j}
              className="absolute left-0 rounded-[50%]"
              style={{ bottom: j * 3.5, width: w, height: h, background: chipBg(st.c, st.s), boxShadow: `0 2.5px 0 ${chipEdge(st.c)},0 3px 4px rgba(0,0,0,0.3)` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function BetChip({ amount, i, n, dark }: { amount: number; i: number; n: number; dark: boolean }) {
  return (
    <div data-bet={i} className="absolute z-[1] flex -translate-1/2 items-center gap-1.5" style={polar(i, n, 25, 21)}>
      <ChipStacks amount={amount} />
      <span
        className="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
        style={{ background: dark ? 'rgba(0,0,0,0.45)' : '#fff', color: dark ? '#fff' : '#1d1d1f' }}
      >
        {fmt(amount)}
      </span>
    </div>
  )
}
