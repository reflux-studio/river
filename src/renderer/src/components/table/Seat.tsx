import { Avatar } from '@/components/Avatar'
import { CardBack, PlayingCard } from '@/components/PlayingCard'
import { fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SeatViewPublic } from '../../../../shared/types'

// 原型极坐标：第 0 位（玩家）在正下方，其余顺时针均分
export const polar = (i: number, n: number, rx: number, ry: number) => {
  const a = ((90 + (i * 360) / n) * Math.PI) / 180
  return { left: `${50 + rx * Math.cos(a)}%`, top: `${50 + ry * Math.sin(a)}%` }
}

const TONE = { muted: 'text-muted-foreground', blue: 'text-blue', green: 'text-win' }

export function Seat({ seat: p, i, n, heroTurn }: { seat: SeatViewPublic; i: number; n: number; heroTurn: boolean }) {
  const isHero = !p.personaId
  const active = p.thinking || (isHero && heroTurn)
  return (
    <div
      className="absolute flex -translate-1/2 flex-col items-center gap-1.5 whitespace-nowrap"
      style={{ ...polar(i, n, 40, 37), zIndex: p.bubble ? 5 : 2 }}
    >
      {p.cards ? (
        <div className="-mb-4 flex gap-1">
          {p.cards.map((c, k) =>
            isHero ? <PlayingCard key={k} card={c} w={52} h={72} rot={k ? 4 : -4} className="shadow-[0_2px_6px_rgba(0,0,0,0.05)]" />
              : <PlayingCard key={k} card={c} w={44} h={62} className="shadow-[0_2px_6px_rgba(0,0,0,0.05)]" />
          )}
        </div>
      ) : (
        p.hasCards && (
          <div className="-mb-[18px] flex">
            <CardBack rot={-6} />
            <CardBack rot={6} className="-ml-2" />
          </div>
        )
      )}
      <div
        className={cn(
          'relative flex items-center gap-[9px] rounded-full bg-white py-1.5 pr-4 pl-1.5',
          active ? 'border-2 border-blue shadow-[0_0_0_5px_oklch(0.6_0.17_255/0.12)]'
            : p.winner ? 'border-2 border-win shadow-[0_0_0_5px_oklch(0.55_0.14_155/0.12)]' : 'border',
          (p.folded || p.out) && 'opacity-45'
        )}
      >
        <Avatar ini={p.ini} hue={isHero ? undefined : p.hue} size={36} />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{p.name}</span>
            {p.tag && <span className="rounded-[5px] bg-muted px-1.5 py-px text-[11px] text-subtle">{p.tag}</span>}
          </div>
          <span className="text-xs text-muted-foreground">{fmt(p.stack)}</span>
        </div>
        {p.isDealer && (
          <div className="absolute top-1/2 -right-7 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-white">
            D
          </div>
        )}
      </div>
      {p.bubble && !isHero && (
        <div className="max-w-[200px] rounded-xl bg-foreground px-3 py-[7px] text-center text-[13px] leading-[1.4] whitespace-normal text-white">
          {p.bubble}
        </div>
      )}
      {p.status && (
        <div className={cn('flex items-center gap-1.5 rounded-full border bg-white px-[9px] py-0.5 text-xs', TONE[p.statusTone])}>
          <span className="size-1.5 rounded-full bg-current" />
          {p.status}
        </div>
      )}
    </div>
  )
}

export function BetChip({ amount, i, n }: { amount: number; i: number; n: number }) {
  return (
    <div
      className="absolute flex -translate-1/2 items-center gap-1.5 rounded-full border bg-white py-[3px] pr-[11px] pl-[5px] text-[13px] font-semibold whitespace-nowrap"
      style={polar(i, n, 24, 21)}
    >
      <span className="box-border size-3.5 rounded-full border-2 border-white bg-foreground shadow-[0_0_0_1px_#1d1d1f]" />
      {fmt(amount)}
    </div>
  )
}
