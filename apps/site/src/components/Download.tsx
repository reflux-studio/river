import type { Locale } from '@river/i18n'
import { useState } from 'react'
import { site } from '../i18n/site'
import { useRelease, type Os } from '../lib/store'
import { Seg } from './Seg'

// 平台切换默认选中访客的系统；安装包链接来自 GitHub API，失败时指向 releases/latest
export default function Download({ lang }: { lang: Locale }) {
  const D = site[lang].download
  const { os, url } = useRelease()
  const [pick, setPick] = useState<Os | null>(null)
  const cur = pick ?? os
  const [, name, arch, cta, note] = D.platforms.find((p) => p[0] === cur)!
  return (
    <>
      <Seg
        opts={D.platforms.map(([k, n]) => [k as Os, n])}
        value={cur}
        onChange={setPick}
        className="rounded-xl bg-muted p-1"
        item="rounded-[9px] px-[22px] py-2 text-[14px]"
        on="bg-white font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
        off="bg-transparent text-label"
      />
      <div className="box-border w-full overflow-hidden rounded-[20px] border bg-background text-left">
        <div className="flex flex-wrap items-center gap-4 px-6 py-[22px]">
          <div className="flex min-w-[180px] flex-1 flex-col gap-[3px]">
            <span className="text-[19px] font-semibold tracking-[-0.01em]">{name}</span>
            <span className="text-[13px] text-muted-foreground">{arch}</span>
          </div>
          <a href={url(cur)} className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-[15px] font-semibold whitespace-nowrap text-white hover:bg-[#3a3a3c] hover:text-white">
            <svg viewBox="0 0 16 16" width="14" height="14" className="block">
              <path d="M8 2v8.5M4.5 7.5 8 11l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {cta}
          </a>
        </div>
        <div className="flex gap-3 border-t bg-white px-6 pt-4 pb-5">
          <span className="pt-px text-[13px] font-semibold whitespace-nowrap">{D.first}</span>
          <span className="text-[13px] leading-[1.6] text-pretty text-label">{note}</span>
        </div>
      </div>
    </>
  )
}
