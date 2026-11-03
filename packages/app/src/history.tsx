import { useEffect, useState } from 'react'
import { MiniCard } from '@river/ui'
import type { KeyValueStore } from '@river/client'
import type { PersonalHandRecord, PersonalRoomSummary } from '@river/protocol'
import type { Locale, WebText } from './text'
import { actionWords, streets } from './text'
import { netColor, number, signed } from './format'
import { EmptyState, Kpi, Panel, cx } from './ui'

const netOf = (room: PersonalRoomSummary) => room.actualNet ?? room.settledNet
const date = (at: number, locale: Locale) =>
  new Date(at).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

function Trend({
  rooms,
  locale,
  text
}: {
  rooms: PersonalRoomSummary[]
  locale: Locale
  text: WebText
}) {
  if (!rooms.length) return null
  let total = 0
  const points = [0, ...rooms.map((room) => (total += netOf(room)))]
  const min = Math.min(0, ...points)
  const max = Math.max(0, ...points)
  const span = max - min || 1
  const width = 600
  const height = 150
  const pad = 10
  const x = (index: number) => (points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2))
  const y = (value: number) => pad + (1 - (value - min) / span) * (height - pad * 2)
  const zero = y(0)
  return (
    <Panel className="gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold">{text.history.trend}</span>
        <span className="text-xs text-muted-foreground">{text.history.trendHint}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[150px] w-full" role="img" aria-label={text.history.trend}>
        <line x1={pad} y1={zero} x2={width - pad} y2={zero} stroke="var(--border)" strokeDasharray="4 4" />
        <polyline
          points={points.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="3.5" fill="var(--foreground)" />
        <text x={width - pad} y={y(points[points.length - 1]) - 8} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
          {signed(points[points.length - 1], locale)}
        </text>
        <text x={pad} y={zero - 6} fontSize="11" fill="var(--muted-foreground)">
          0
        </text>
      </svg>
    </Panel>
  )
}

function HandRow({ hand, locale, text }: { hand: PersonalHandRecord; locale: Locale; text: WebText }) {
  return (
    <details className="border-t border-divider py-2 first:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px]">
        <span className="w-16 shrink-0 text-muted-foreground">{text.history.hand(hand.handNumber)}</span>
        <span className="flex flex-1 items-center gap-1">
          {hand.board.map((card) => (
            <MiniCard key={card} card={card} />
          ))}
          {!hand.board.length && <span className="text-xs text-muted-foreground">—</span>}
        </span>
        <span className={cx('font-semibold', netColor(hand.ownNet ?? 0))}>{signed(hand.ownNet ?? 0, locale)}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2 pl-[72px]">
        {hand.players.map((player) => (
          <div key={player.participantId} className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="min-w-0 flex-1 truncate">
              {player.name}
              {player.folded && <span className="text-muted-foreground"> · {text.room.turn.folded}</span>}
            </span>
            {player.hole.map((slot, index) =>
              slot.visibility === 'known' ? (
                <MiniCard key={index} card={slot.card} />
              ) : (
                <span key={index} className="text-[#cfcfcb]">
                  ▩
                </span>
              )
            )}
            <span className={cx('w-14 text-right font-medium', netColor(player.net ?? 0))}>
              {player.net === null ? '—' : signed(player.net, locale)}
            </span>
          </div>
        ))}
        {hand.publicActions.length > 0 && (
          <div className="flex max-h-40 flex-col gap-1 overflow-auto text-[12px] text-muted-foreground">
            {hand.publicActions.map((action) => (
              <div key={action.id} className="flex gap-2">
                <span className="w-14 shrink-0">{streets[locale][action.street]}</span>
                <span className="w-8 shrink-0">#{action.seatId + 1}</span>
                <span className="flex-1">
                  {actionWords[locale][action.action as keyof (typeof actionWords)['zh']] ?? action.action}
                  {action.paidDelta ? ` ${number(action.paidDelta, locale)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

export function History({
  store,
  locale,
  text,
  onBack
}: {
  store: KeyValueStore
  locale: Locale
  text: WebText
  onBack(): void
}) {
  const [rooms, setRooms] = useState<PersonalRoomSummary[] | null>(null)
  const [hands, setHands] = useState<PersonalHandRecord[]>([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    void Promise.all([store.entries<PersonalRoomSummary>('summary:'), store.entries<PersonalHandRecord>('hand:')])
      .then(
        ([summaries, records]) => {
          if (!current) return
          setRooms(summaries)
          setHands(records)
        },
        () => current && setFailed(true)
      )
    return () => {
      current = false
    }
  }, [store])

  const ordered = (rooms ?? []).slice().sort((a, b) => a.startedAt - b.startedAt)
  const net = ordered.reduce((sum, room) => sum + netOf(room), 0)
  const buyIn = ordered.reduce((sum, room) => sum + room.buyInTotal, 0)
  const won = ordered.reduce((sum, room) => sum + room.handsWon, 0)
  const lost = ordered.reduce((sum, room) => sum + room.handsLost, 0)
  const tied = ordered.reduce((sum, room) => sum + room.handsTied, 0)

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-4 pt-6 pb-16 md:px-8 md:pt-10">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="text-[28px] font-semibold tracking-[-0.01em]">{text.history.title}</h1>
            <p className="text-[15px] text-subtle">
              {rooms === null
                ? text.common.loading
                : rooms.length
                  ? `${text.history.desc} ${text.history.sessions}: ${rooms.length}`
                  : text.history.empty}
            </p>
          </div>
          <button className="rounded-full border border-input bg-white px-3.5 py-[7px] text-[13px] hover:bg-accent" onClick={onBack}>
            {text.common.back}
          </button>
        </div>

        {failed && (
          <EmptyState>{text.history.loadFailed}</EmptyState>
        )}

        {ordered.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi title={text.history.sessions} value={ordered.length} />
              <Kpi title={text.history.buyInTotal} value={number(buyIn, locale)} />
              <Kpi
                title={text.history.settledNet}
                value={signed(net, locale)}
                tone={net > 0 ? 'win' : net < 0 ? 'lose' : undefined}
              />
              <Kpi title={text.history.wlt} value={`${won} / ${lost} / ${tied}`} />
            </div>
            <Trend rooms={ordered} locale={locale} text={text} />
            <div className="flex flex-col">
              {ordered
                .slice()
                .reverse()
                .map((room) => {
                  const records = hands.filter(
                    (hand) =>
                      hand.roomId === room.roomId && hand.viewerParticipantId === room.participantId
                  )
                  return (
                    <details key={`${room.roomId}:${room.participantId}`} className="group border-b border-divider py-3">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                        <span className="text-muted-foreground">{date(room.startedAt, locale)}</span>
                        <span className="font-semibold">
                          {text.history.room} {room.roomId.slice(0, 8)}
                        </span>
                        <span className="text-muted-foreground">
                          {text.history.buyIn} {number(room.buyInTotal, locale)}
                        </span>
                        <span className={cx('text-[15px] font-semibold', netColor(netOf(room)))}>
                          {signed(netOf(room), locale)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {text.history.wltShort(room.handsWon, room.handsLost, room.handsTied)}
                        </span>
                        <span className="flex-1" />
                        {room.abandonedContribution > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {text.room.closed.terminated}
                          </span>
                        )}
                        <span className="text-base leading-none text-muted-foreground transition-transform group-open:rotate-90">
                          ›
                        </span>
                      </summary>
                      <div className="mt-2">
                        {records.length ? (
                          records
                            .slice()
                            .reverse()
                            .map((hand) => (
                              <HandRow key={hand.handId} hand={hand} locale={locale} text={text} />
                            ))
                        ) : (
                          <span className="text-xs text-muted-foreground">{text.history.noActions}</span>
                        )}
                      </div>
                    </details>
                  )
                })}
            </div>
          </>
        )}

        {rooms !== null && !rooms.length && !failed && <EmptyState>{text.history.empty}</EmptyState>}
      </div>
    </main>
  )
}
