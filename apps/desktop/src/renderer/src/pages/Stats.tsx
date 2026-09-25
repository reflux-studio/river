import { useEffect, useRef, useState } from 'react'
import { Confirm } from '@/components/Confirm'
import { costText, money, rateText, signed, tokens, useLangTag, useMoney } from '@/lib/format'
import { invoke, toastError, useEvent, useT } from '@/lib/river'
import { cn } from '@/lib/utils'
import type { HandSummary, Purpose, UsageSummary } from '../../../shared/types'

const PURPOSE_COLOR: Record<Purpose, string> = {
  decide: 'oklch(0.6 0.17 255)',
  talk: 'oklch(0.65 0.12 20)',
  speak: 'oklch(0.62 0.13 155)',
  ask: 'oklch(0.72 0.14 80)',
  recap: 'oklch(0.58 0.16 300)'
}

function Usage() {
  const m = useMoney()
  const t = useT()
  const s = t.desktop.stats
  const lang = useLangTag()
  const usd = (x: number) => money(x, m)
  const [u, setU] = useState<UsageSummary | null>(null)
  const seq = useRef(0)
  // 牌局在后台进行时 usage:changed 很密：只采用最新一次请求的结果
  const load = () => {
    const n = ++seq.current
    void invoke('usage.summary').then((x) => n === seq.current && setU(x), toastError)
  }
  useEffect(load, [])
  useEvent('usage:changed', load)
  if (!u) return null
  const T = u.total
  const priced = T.tokens > T.unpriced
  // 有价格时按花费分占比，全无价格时按 token
  const share = (x: { usd: number; tokens: number }) => (priced ? (T.usd ? x.usd / T.usd : 0) : T.tokens ? x.tokens / T.tokens : 0)
  const kpis = [
    { l: s.cost, v: priced ? usd(T.usd) : '—', h: T.unpriced ? s.unpricedExtra(tokens(T.unpriced)) : m.currency === 'usd' ? s.byPrice : s.byPriceFx(rateText(m.rate), t.common.currencyUnit[m.currency]) },
    { l: s.calls, v: String(T.calls), h: T.unknown ? s.unknownCalls(T.unknown) : s.allCalls },
    { l: s.io, v: `${tokens(T.input)} / ${tokens(T.output)}`, h: s.ioHint },
    {
      l: s.avg,
      v: !u.hands.length ? '—' : priced ? usd(u.avgPerHand ?? 0) : tokens(u.hands.reduce((a, h) => a + h.tokens, 0) / u.hands.length) + ' token',
      h: u.hands.length ? s.basedOn(u.hands.length) : s.afterFirst
    }
  ]
  const mc = Math.max(1e-9, ...u.hands.map((h) => (priced ? h.usd : h.tokens)))
  return (
    <div className="flex flex-col gap-[18px] rounded-[14px] border bg-white p-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[15px] font-semibold">{s.usage}</span>
        <span className="text-xs text-muted-foreground">{u.since ? s.since(new Date(u.since).toLocaleDateString(lang)) : s.allRecords}</span>
        <div className="flex-1" />
        <Confirm title={s.resetTitle} description={s.resetDesc} action={s.reset} onConfirm={() => void invoke('usage.reset').catch(toastError)}>
          <button className="text-xs text-muted-foreground">{s.reset}</button>
        </Confirm>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.l} className="flex flex-col gap-[3px]">
            <span className="text-xs text-muted-foreground">{k.l}</span>
            <span className="text-2xl font-semibold tracking-[-0.01em]">{k.v}</span>
            <span className="text-xs text-[#a1a1a6]">{k.h}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="grid grid-cols-[110px_minmax(0,1fr)_60px_90px_110px] gap-3 pb-1.5 text-xs text-[#a1a1a6]">
          <span>{s.cols.purpose}</span><span>{priced ? s.cols.costShare : s.cols.tokenShare}</span><span className="text-right">{s.cols.calls}</span><span className="text-right">{s.cols.tokens}</span><span className="text-right">{s.cols.cost}</span>
        </div>
        {u.purposes.map((c) => (
          <div key={c.purpose} className="grid grid-cols-[110px_minmax(0,1fr)_60px_90px_110px] items-center gap-3 border-t border-divider py-2 text-[13px]">
            <span className="flex items-center gap-[7px]"><span className="size-2 rounded-[2px]" style={{ background: PURPOSE_COLOR[c.purpose] }} />{s.purposes[c.purpose]}</span>
            <div className="relative h-1.5 rounded-full bg-[#f0f0ee]"><div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${share(c) * 100}%`, background: PURPOSE_COLOR[c.purpose] }} /></div>
            <span className="text-right text-label">{c.calls}</span>
            <span className="text-right text-label">{tokens(c.tokens)}</span>
            <span className="text-right font-semibold">{c.tokens > c.unpriced ? costText(c, m, t) : '—'}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-label">{s.perHand(priced)}</span>
        <div className="flex h-[70px] items-end gap-[3px] border-b">
          {u.hands.map((h, i) => (
            <div key={i} title={`${t.desktop.handNo(h.handNo)} · ${priced ? usd(h.usd) : tokens(h.tokens) + ' token'}`} className="max-w-[22px] flex-1 rounded-t-[3px] bg-[oklch(0.75_0.13_70)]" style={{ height: Math.max(1, ((priced ? h.usd : h.tokens) / mc) * 66) }} />
          ))}
        </div>
      </div>
      <div className="text-xs leading-[1.6] text-pretty text-muted-foreground">
        {s.note}
      </div>
    </div>
  )
}

const loadAll = async () => (await invoke('hands.list')).reverse()

export function Stats() {
  const [H, setH] = useState<HandSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const t = useT()
  const s = t.desktop.stats
  // 连续 hands:changed 的早一次可能晚返回，只认最后一次
  const seq = useRef(0)
  const load = () => {
    const n = ++seq.current
    loadAll().then(
      (h) => n === seq.current && (setH(h), setFailed(false)),
      (e) => n === seq.current && (setFailed(true), toastError(e))
    )
  }
  useEffect(load, [])
  useEvent('hands:changed', load)
  if (!H)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {failed && (
          <button className="text-blue" onClick={load}>
            {t.desktop.btn.loadFailed}
          </button>
        )}
      </div>
    )

  const n = H.length
  const pct = (x: number) => (n ? Math.round((x / n) * 100) + '%' : '—')
  const net = H.reduce((a, r) => a + r.net, 0)
  const sd = H.filter((r) => r.showdown)
  const kpis = [
    { l: s.hands, v: String(n), h: s.allHands },
    { l: s.net, v: n ? signed(net) : '—', h: s.chips, tone: net > 0 ? 'text-win' : net < 0 ? 'text-lose' : '' },
    { l: s.won, v: pct(H.filter((r) => r.net > 0).length), h: s.wonHint },
    { l: s.vpip, v: pct(H.filter((r) => r.vpip).length), h: s.vpipHint },
    { l: s.pfr, v: pct(H.filter((r) => r.pfr).length), h: s.pfrHint },
    {
      l: s.sdWin,
      v: sd.length ? Math.round((sd.filter((r) => r.net > 0).length / sd.length) * 100) + '%' : '—',
      h: s.sdCount(sd.length)
    }
  ]
  const last = H.slice(-40)
  const mx = Math.max(1, ...last.map((r) => Math.abs(r.net)))

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-8 pt-10 pb-16">
        <div className="flex flex-col gap-1.5">
          <div className="text-[28px] font-semibold">{t.desktop.nav.stats}</div>
          <div className="text-[15px] text-subtle">{s.intro(n)}</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {kpis.map((k) => (
            <div key={k.l} className="flex flex-col gap-1 rounded-[14px] border bg-white px-[18px] py-4">
              <span className="text-[13px] text-muted-foreground">{k.l}</span>
              <span className={cn('text-[28px] font-semibold tracking-[-0.01em]', k.tone)}>{k.v}</span>
              <span className="text-xs text-[#a1a1a6]">{k.h}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] border bg-white p-[18px]">
          <span className="text-[15px] font-semibold">{s.perHandNet}</span>
          <div className="relative flex h-40 items-stretch gap-[3px]">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
            {last.map((r, i) => {
              const h = Math.max(2, (Math.abs(r.net) / mx) * 76)
              return (
                <div key={i} className="relative max-w-[22px] flex-1">
                  <div
                    className={cn('absolute inset-x-0 rounded-[3px]', r.net >= 0 ? 'bg-win' : 'bg-lose')}
                    style={{ height: h, top: r.net >= 0 ? `calc(50% - ${h}px)` : '50%' }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <Usage />
      </div>
    </div>
  )
}
