import type { Locale } from '@river/i18n'
import { useState } from 'react'
import { site } from '../i18n/site'

export default function Faq({ lang }: { lang: Locale }) {
  const [open, setOpen] = useState(0)
  return (
    <div className="flex flex-col border-t border-input">
      {site[lang].faq.items.map(([q, a], i) => (
        <div key={q} className="border-b border-input">
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent py-5 text-left">
            <span className="flex-1 text-[18px] font-semibold">{q}</span>
            <span className="text-[22px] leading-none text-muted-foreground transition-transform duration-200" style={{ transform: open === i ? 'rotate(45deg)' : 'none' }}>+</span>
          </button>
          {open === i && <div className="pr-10 pb-[22px] text-[16px] leading-[1.65] text-pretty text-label">{a}</div>}
        </div>
      ))}
    </div>
  )
}
