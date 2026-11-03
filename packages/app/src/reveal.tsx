import { useState } from 'react'
import type { Card } from '@river/engine'
import { CardBack, PlayingCard, type Back } from '@river/ui'
import type { WebText } from './text'
import { cx } from './ui'

type Slot =
  | { visibility: 'hidden' }
  | { visibility: 'known'; card: Card; source: 'own' | 'public' | 'spectator' }

/** 亮牌用的小浮层；只占牌桌一角，不把操作区撑成抽屉。 */
export function RevealDock({
  hole,
  back,
  picked,
  revealed,
  sending,
  text,
  phone,
  onPick,
  onReveal,
  onDismiss
}: {
  hole: [Slot, Slot]
  back: Back
  picked: number[]
  revealed: number[]
  sending: boolean
  text: WebText
  phone: boolean
  onPick(index: number): void
  onReveal(): void
  onDismiss(): void
}) {
  const [open, setOpen] = useState(!phone)
  if (!open)
    return (
      <button
        type="button"
        className="pointer-events-auto absolute right-3 bottom-3 z-20 rounded-full border bg-white/95 px-3.5 py-2 text-[13px] font-medium shadow-[0_6px_18px_rgba(0,0,0,0.16)] backdrop-blur-sm"
        onClick={() => setOpen(true)}
      >
        {text.room.reveal.title}
      </button>
    )
  const cards = hole.map((slot, index) =>
    slot.visibility === 'known' ? (
      <button
        key={index}
        type="button"
        aria-pressed={picked.includes(index)}
        aria-label={text.room.reveal.slot(index + 1)}
        title={text.room.reveal.slot(index + 1)}
        onClick={() => onPick(index)}
        className={cx(
          'relative rounded-[9px] p-[2px] transition-shadow',
          picked.includes(index) ? 'ring-2 ring-foreground' : 'ring-1 ring-transparent hover:ring-black/15'
        )}
        style={{ perspective: 480 }}
      >
        <div className={cx(revealed.includes(index) && 'river-reveal-flip')}>
          <PlayingCard card={slot.card} w={40} h={56} />
        </div>
        {revealed.includes(index) && (
          <span
            className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-win text-[10px] font-bold text-white shadow-sm"
            aria-label={text.room.reveal.revealed}
          >
            ✓
          </span>
        )}
      </button>
    ) : (
      <CardBack key={index} back={back} />
    )
  )
  const reveal = (
    <button
      type="button"
      className={cx(
        'rounded-full bg-foreground px-3 py-[7px] text-[13px] font-medium whitespace-nowrap text-white hover:bg-foreground/85 disabled:opacity-40',
        phone && 'w-full justify-center'
      )}
      disabled={!picked.length || sending}
      onClick={onReveal}
    >
      {text.room.reveal.button}
    </button>
  )
  return (
    <div
      className={cx(
        'pointer-events-auto absolute right-3 bottom-3 z-20 flex flex-col gap-2 rounded-[14px] border bg-white/95 p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.16)] backdrop-blur-sm',
        phone ? 'w-[132px]' : 'w-[216px]'
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{text.room.reveal.title}</span>
        <div className="flex-1" />
        <button
          className="flex size-5 items-center justify-center rounded-full text-[15px] leading-none text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onDismiss}
          aria-label={text.room.reveal.skip}
          title={text.room.reveal.skip}
        >
          ×
        </button>
      </div>
      {phone ? (
        <>
          <div className="flex gap-1.5">{cards}</div>
          {reveal}
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          {cards}
          <div className="flex-1" />
          {reveal}
        </div>
      )}
    </div>
  )
}
