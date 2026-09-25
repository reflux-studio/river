import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { MiniCards, PlayingCard } from '@/components/PlayingCard'
import { RecapRows } from '@/components/table/CoachPanel'
import { costText, fmt, netColor, signed, useMoney } from '@/lib/format'
import { configured, go, invoke, toastError, useEvent, useRiver } from '@/lib/river'
import { cn } from '@/lib/utils'
import { STREET } from '../../../shared/personas'
import type { Card, Cost, HandRecord, HandSummary, Recap } from '../../../shared/types'

type Detail = { id: number; record: HandRecord; review?: Recap | string; cost?: Cost }

const card = 'rounded-[14px] border bg-white'

function streetsOf(log: HandRecord['log']) {
  const out: { name: string; board: string; cards?: Card[]; items: HandRecord['log'] }[] = []
  for (const x of log) {
    if (x.board || !out.length) out.push({ name: STREET[x.street], board: x.board ? x.label : '', cards: x.cards, items: [] })
    if (!x.board) out[out.length - 1].items.push(x)
  }
  return out
}

function Review({ d, loading, failed, onReview }: { d: Detail; loading: boolean; failed: boolean; onReview: () => void }) {
  const ready = useRiver((s) => configured(s, 'coach'))
  return (
    <div className={cn(card, 'flex flex-col gap-2.5 px-[18px] py-4')}>
      <div className="flex items-center gap-2.5">
        <Avatar ini="师" hue={155} />
        <span className="flex-1 text-[15px] font-semibold">教练复盘</span>
        {!d.review && !loading && (
          <button
            disabled={!ready}
            onClick={onReview}
            className="rounded-full bg-primary px-3.5 py-1.5 text-[13px] text-primary-foreground disabled:opacity-40"
          >
            让教练复盘这一手
          </button>
        )}
      </div>
      {!d.review && !loading && !ready && (
        <span className="text-[13px] text-muted-foreground">
          配置教练模型后可用 ·{' '}
          <button className="text-blue" onClick={() => go('settings')}>
            去设置
          </button>
        </span>
      )}
      {loading && <span className="text-[13px] text-muted-foreground">教练正在回看这一手…</span>}
      {failed && !loading && !d.review && <span className="text-[13px] text-lose">复盘失败，稍后再试</span>}
      {typeof d.review === 'string' && <div className="text-sm leading-[1.7] text-pretty whitespace-pre-wrap">{d.review}</div>}
      {d.review && typeof d.review === 'object' && <RecapRows r={d.review} big />}
    </div>
  )
}

function HandDetail({ d, ...review }: { d: Detail } & Omit<Parameters<typeof Review>[0], 'd'>) {
  const personas = useRiver((s) => s.personas)
  const m = useMoney()
  const r = d.record
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5 p-8">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold">第 {r.hand} 手</span>
        <span className={cn('text-[15px] font-semibold', netColor(r.net))}>{signed(r.net)}</span>
        <div className="flex-1" />
        <span className="text-[13px] text-muted-foreground">
          盲注 {r.sb}/{r.bb} · 底池 {fmt(r.pot)}
          {r.showdown && ' · 摊牌'}
          {r.mode === 'coach' && ' · 教练局'}
          {d.cost && ` · ${costText(d.cost, m)}`}
        </span>
      </div>
      {r.board.length > 0 && (
        <div className="flex gap-1.5">
          {r.board.map((c) => (
            <PlayingCard key={c} card={c} w={50} h={70} className="border border-input shadow-[0_2px_6px_rgba(0,0,0,0.06)]" />
          ))}
        </div>
      )}
      <div className={cn(card, 'px-4 py-1.5')}>
        {r.players.map((p) => {
          const persona = personas.find((x) => x.id === p.personaId)
          return (
            <div key={p.id} className="flex items-center gap-3 border-b border-divider py-2.5 text-sm last:border-b-0">
              <Avatar ini={p.id === 'hero' ? '你' : (persona?.ini ?? p.name.slice(0, 1))} hue={persona?.hue} />
              <span className="w-[70px] font-semibold">{p.name}</span>
              <span className="flex flex-1 items-center gap-2">
                {p.hole || p.holeAfter ? <MiniCards cards={(p.hole ?? p.holeAfter)!} w={20} h={28} /> : null}
                {(p.folded || !(p.hole || p.holeAfter)) && <span className="text-[13px] text-[#a1a1a6]">{p.folded ? '已弃牌' : '未亮牌'}</span>}
              </span>
              <span className={cn('text-[13px]', p.won ? 'text-win' : 'text-muted-foreground')}>
                {p.won ? `赢得 ${fmt(p.won)}${p.handName ? ' · ' + p.handName : ''}` : p.hole && p.handName ? p.handName : ''}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-3.5">
        {streetsOf(r.log).map((st, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex w-[110px] shrink-0 flex-col gap-[5px]">
              <span className="text-[13px] font-semibold">{st.name}</span>
              {st.cards ? <MiniCards cards={st.cards} /> : <span className="text-xs text-muted-foreground">{st.board}</span>}
            </div>
            <div className="flex flex-1 flex-wrap content-start items-start gap-1.5">
              {st.items.map((it, j) => (
                <span key={j} className="rounded-full border bg-white px-2.5 py-1 text-[13px] whitespace-nowrap">
                  <b className="font-semibold">{it.name}</b> {it.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Review d={d} {...review} />
    </div>
  )
}

export function Replays() {
  const [hands, setHands] = useState<HandSummary[]>([])
  // null 表示跟随最新一手，新手牌落库后自动切过去
  const [picked, setPicked] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [reviews, setReviews] = useState<Record<number, 'loading' | 'failed'>>({})

  const [listFailed, setListFailed] = useState(false)
  const seq = useRef(0)
  const loadList = () => {
    const n = ++seq.current
    invoke('hands.list').then(
      (h) => n === seq.current && (setHands(h), setListFailed(false)),
      (e) => n === seq.current && (setListFailed(true), toastError(e))
    )
  }
  useEffect(loadList, [])
  useEvent('hands:changed', loadList)

  const selId = hands.some((h) => h.id === picked) ? picked : (hands[0]?.id ?? null)

  useEffect(() => {
    if (selId === null) return setDetail(null)
    let live = true
    invoke('hands.get', selId).then((r) => live && setDetail(r && { id: selId, ...r }), toastError)
    return () => void (live = false)
  }, [selId])

  const mark = (id: number, st?: 'loading' | 'failed') =>
    setReviews(({ [id]: _, ...rest }) => (st ? { ...rest, [id]: st } : rest))

  useEvent('review:done', ({ handId, review, error }) => {
    mark(handId, error ? 'failed' : undefined)
    if (review) setDetail((d) => (d?.id === handId ? { ...d, review } : d))
  })

  const review = (id: number) => {
    if (reviews[id] === 'loading') return
    mark(id, 'loading')
    invoke('hands.review', id).catch((e) => {
      mark(id, 'failed')
      toastError(e)
    })
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[300px] shrink-0 flex-col border-r bg-white">
        <div className="px-[18px] pt-4 pb-2.5 text-[15px] font-semibold">手牌回放</div>
        {listFailed ? (
          <button className="px-[18px] text-left text-[13px] text-blue" onClick={loadList}>
            加载失败，重试
          </button>
        ) : (
          !hands.length && <div className="px-[18px] text-[13px] text-muted-foreground">打完第一手后，这里会出现记录。</div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 pb-3">
          {hands.map((h) => (
            <button
              key={h.id}
              onClick={() => setPicked(h.id)}
              className={cn('flex items-center gap-2.5 rounded-[10px] p-2.5 text-left text-sm', h.id === selId && 'bg-secondary')}
            >
              <span className="flex w-[64px] flex-col leading-tight text-muted-foreground">
                <span className="text-[13px]">#{h.handNo}</span>
                <span className="text-[11px]">{new Date(h.playedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </span>
              <span className="flex-1"><MiniCards cards={h.hero} w={20} h={28} /></span>
              <span className={cn('font-semibold', netColor(h.net))}>{signed(h.net)}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto">
        {detail && detail.id === selId && (
          <HandDetail
            d={detail}
            loading={reviews[detail.id] === 'loading'}
            failed={reviews[detail.id] === 'failed'}
            onReview={() => review(detail.id)}
          />
        )}
      </div>
    </div>
  )
}
