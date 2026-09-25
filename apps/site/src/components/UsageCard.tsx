import type { Locale } from '@river/i18n'
import { site } from '../i18n/site'
import { CUR, curOf, money, setSite, useSite } from '../lib/store'
import { Seg } from './Seg'

// 示例数据（设计稿 USAGE、BARS）：用途、美元花费、调用次数、颜色
const USAGE: [string, number, number, string][] = [['decide', 0.061, 212, 'oklch(0.6 0.17 255)'], ['speak', 0.034, 48, 'oklch(0.62 0.13 155)'], ['ask', 0.012, 9, 'oklch(0.72 0.14 80)'], ['recap', 0.019, 38, 'oklch(0.58 0.16 300)']]
const BARS = [2.1, 3.4, 2.8, 5.2, 3.1, 2.4, 4.6, 3.3, 2.2, 6.1, 3.8, 2.9, 3.5, 2.6, 4.1, 3.0, 2.5, 5.6, 3.2, 2.7, 3.9, 4.4, 2.3, 3.6]
const TOTAL = USAGE.reduce((a, u) => a + u[1], 0)
const CALLS = USAGE.reduce((a, u) => a + u[2], 0)

export default function UsageCard({ lang }: { lang: Locale }) {
  const M = site[lang].models
  const c = curOf(useSite().cur, lang)
  const kpis = [money(TOTAL, c), String(CALLS), money(TOTAL / 38, c)]
  return (
    <div className="flex flex-col gap-[18px] rounded-[14px] border bg-white p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[15px] font-semibold">{M.usage}</span>
        <div className="flex-1" />
        <Seg opts={CUR.map(([k, sym]) => [k, sym] as [string, string])} value={c[0]} onChange={(cur) => setSite({ cur })} item="px-[9px] py-[3px] text-[12px]" />
      </div>
      <div className="grid grid-cols-3 gap-3.5">
        {kpis.map((v, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-[3px]">
            <span className="text-[12px] text-muted-foreground">{M.kpis[i]}</span>
            <span className="text-[22px] font-semibold tracking-[-0.01em] whitespace-nowrap">{v}</span>
            <span className="text-[12px] text-[#a1a1a6]">{M.kpiH[i]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col">
        {USAGE.map(([k, usd, n, color]) => (
          <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)_44px_72px] items-center gap-3 border-t border-divider py-2 text-[13px]">
            <span className="flex items-center gap-[7px] whitespace-nowrap">
              <span className="size-2 rounded-[2px]" style={{ background: color }} />
              {M.purposes[k]}
            </span>
            <div className="relative h-1.5 rounded-full bg-[#f0f0ee]">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((usd / TOTAL) * 100).toFixed(1)}%`, background: color }} />
            </div>
            <span className="text-right text-label">{n}</span>
            <span className="text-right font-semibold whitespace-nowrap">{money(usd, c)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-label">{M.perHand}</span>
        <div className="flex h-14 items-end gap-[3px] border-b">
          {BARS.map((b, i) => (
            <div key={i} className="max-w-[22px] flex-1 rounded-t-[3px] bg-[oklch(0.75_0.13_70)]" style={{ height: Math.round((b / 6.1) * 52) }} />
          ))}
        </div>
      </div>
      <div className="text-[12px] leading-[1.6] text-pretty text-muted-foreground">{M.foot}</div>
    </div>
  )
}
