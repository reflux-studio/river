import type { Locale } from '@river/i18n'
import { useState } from 'react'
import { site } from '../i18n/site'
import { Seg } from './Seg'

// 教练面板示意：点标题换人设，切讲解深度，硬核模式隐藏概率
export default function CoachDemo({ lang }: { lang: Locale }) {
  const C = site[lang].coach
  const [coach, setCoach] = useState(1)
  const [level, setLevel] = useState('novice')
  const [hard, setHard] = useState(false)
  return (
    <div className="flex w-full max-w-[380px] flex-col justify-self-center overflow-hidden rounded-2xl border bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.16)]">
      <button type="button" onClick={() => setCoach((coach + 1) % 3)} className="flex cursor-pointer items-center gap-2.5 border-0 border-b border-[#f0f0ee] bg-transparent px-4 py-2.5 text-left">
        <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[oklch(0.92_0.045_155)] text-[12px] font-semibold">{C.ini}</div>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold whitespace-nowrap">{C.head(C.coaches[coach])}</span>
          <span className="text-[12px] whitespace-nowrap text-muted-foreground">{C.sub}</span>
        </div>
      </button>
      <div className="px-4 pt-2.5">
        <Seg opts={C.levels} value={level} onChange={setLevel} item="flex-1 py-[5px] text-[13px]" />
      </div>
      <div className="px-4 pt-3">
        {hard ? (
          <div className="rounded-[10px] border border-dashed border-input px-3 py-2.5 text-[13px] text-muted-foreground">{C.hardOn}</div>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-xl bg-topbar p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-label">{C.equity}</span>
              <span className="text-[13px] font-semibold text-win">{C.plusEv}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[30px] font-semibold tracking-[-0.02em]">38%</span>
              <span className="text-[14px] text-muted-foreground">/ 25.0%</span>
            </div>
            <div className="relative h-2 rounded-full bg-[#e8e8e5]">
              <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-blue" />
              <div className="absolute -top-1 left-1/4 h-4 w-0.5 bg-foreground" />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[12px] text-muted-foreground">
              {C.prob.map(([l, v]) => (
                <div key={l} className="flex flex-col">
                  <span>{l}</span>
                  <span className="text-[15px] font-semibold text-foreground">{v}</span>
                </div>
              ))}
            </div>
            <div className="text-[12px] text-muted-foreground">{C.local}</div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex flex-col gap-1.5 rounded-xl bg-[oklch(0.97_0.015_255)] px-3.5 py-3">
          <span className="text-[12px] font-semibold text-[oklch(0.5_0.15_255)]">{C.handTag}</span>
          <span className="text-[14px] leading-[1.7] text-pretty">{C.says[coach]}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 border-t px-4 pt-3 pb-4">
        <div className="flex flex-wrap gap-1.5">
          {C.quick[level].map((q) => (
            <span key={q} className="rounded-full border px-2.5 py-1 text-[12px] text-label">{q}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-[10px] border border-input px-3 py-[9px] text-[14px] text-[#a1a1a6]">{C.ask}</div>
          <div className="rounded-[10px] bg-foreground px-3 py-[9px] text-[14px] whitespace-nowrap text-white">{C.pauseAsk}</div>
        </div>
        <button type="button" onClick={() => setHard(!hard)} className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[13px] text-label">
          <span className="flex-1">{C.hard}</span>
          <span className="relative h-[18px] w-8 rounded-full transition-[background] duration-200" style={{ background: hard ? '#1d1d1f' : '#e3e3e0' }}>
            <span className="absolute top-0.5 size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] duration-200" style={{ left: hard ? 16 : 2 }} />
          </span>
        </button>
      </div>
    </div>
  )
}
