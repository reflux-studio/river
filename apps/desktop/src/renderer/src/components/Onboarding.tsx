import { useState } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { dict, type Locale } from '@river/i18n'
import { finishOnboarding, go, modelOf, setState, startGuided, useRiver, useT, type RiverState } from '@/lib/river'
import { cn } from '@/lib/utils'

const RANKS = [
  ['royalFlush', 'A♠ K♠ Q♠ J♠ 10♠'], ['straightFlush', '9♥ 8♥ 7♥ 6♥ 5♥'], ['quads', 'Q Q Q Q 3'], ['fullHouse', 'K K K 7 7'],
  ['flush', 'A♦ J♦ 8♦ 4♦ 2♦'], ['straight', '10 9 8 7 6'], ['trips', '8 8 8 K 2'], ['twoPair', 'J J 4 4 A'], ['pair', '10 10 K 6 3'], ['highCard', 'A J 8 5 2']
] as const
const LOCALES: Locale[] = ['zh', 'en']

const pill = 'h-auto rounded-full px-4 py-[9px] text-sm font-normal'

function modelLabel(s: RiverState, role: 'opponent' | 'coach') {
  const m = modelOf(s, role)
  return m ? `${m.provider.name} · ${m.modelId}` : null
}

function Pages({ locale, onLocale, onFinish }: { locale: Locale; onLocale: (l: Locale) => void; onFinish: () => Promise<void> }) {
  // 挂载时定下是否有语言页：结束引导时 onboarded 先变 true，关闭动画期间页码不能跟着错位
  const onboarded = useRiver((s) => s.onboarded)
  const [withLang] = useState(!onboarded)
  const [i, setI] = useState(0)
  const opp = useRiver((s) => modelLabel(s, 'opponent'))
  const coach = useRiver((s) => modelLabel(s, 'coach'))
  const t = dict(locale)
  const o = t.desktop.onboarding
  const steps = o.pages.length + (withLang ? 1 : 0)
  const page = withLang ? i - 1 : i
  const pg = o.pages[page]
  const last = i === steps - 1

  return (
    <>
      <div className="flex items-center">
        <span className="text-[13px] whitespace-nowrap text-muted-foreground">{o.progress(i + 1, steps)}</span>
        <div className="flex-1" />
        <button onClick={onFinish} className="text-[13px] text-muted-foreground">{o.skip}</button>
      </div>
      <DialogTitle className="text-2xl font-semibold tracking-[-0.01em]">{pg ? pg.t : o.lang.t}</DialogTitle>
      <DialogDescription className="text-[15px] leading-[1.7] text-pretty text-[#3a3a3c]">{pg ? pg.b : o.lang.b}</DialogDescription>

      {!pg && (
        <div className="grid grid-cols-2 gap-3">
          {LOCALES.map((l) => (
            <button
              key={l}
              aria-pressed={l === locale}
              onClick={() => onLocale(l)}
              className={cn('rounded-xl border px-4 py-3.5 text-left text-[15px]', l === locale ? 'border-foreground font-semibold ring-1 ring-foreground' : 'text-label')}
            >
              {t.common.localeNames[l]}
            </button>
          ))}
        </div>
      )}
      {page === 2 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-1">
          {RANKS.map(([k, ex], n) => (
            <div key={k} className="flex items-center gap-2.5 border-b border-divider py-[5px] text-[13px]">
              <span className="w-4 shrink-0 text-[#a1a1a6]">{n + 1}</span>
              <span className={cn('shrink-0 font-semibold whitespace-nowrap', locale === 'en' ? 'min-w-[104px]' : 'min-w-[74px]')}>{t.poker.hand[k]}</span>
              <span className="whitespace-nowrap text-label">{ex}</span>
            </div>
          ))}
        </div>
      )}
      {page === 3 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {o.flow.map((f) => (
              <span key={f} className="rounded-full bg-divider px-[11px] py-[5px] text-[13px] whitespace-nowrap">{f}</span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(o.acts) as (keyof typeof o.acts)[]).map((k) => (
              <div key={k} className="text-[13px] leading-normal">
                <b className="font-semibold">{t.poker.act[k]}</b> <span className="text-label">{o.acts[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {last && (
        <div className="flex flex-col rounded-xl border px-4 py-1 text-[13px]">
          {([[o.model.opponent, opp], [o.model.coach, coach]] as const).map(([l, v]) => (
            <div key={l} className="flex items-center gap-3 border-b border-divider py-2 last:border-0">
              <span className={cn('shrink-0 font-semibold', locale === 'en' ? 'w-28' : 'w-16')}>{l}</span>
              <span className={cn('min-w-0 flex-1 truncate', v ? 'text-win' : 'text-muted-foreground')}>{v ?? o.model.none}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2.5 pt-1.5">
        <div className="flex gap-1.5">
          {Array.from({ length: steps }, (_, k) => (
            <span key={k} className={cn('size-[7px] rounded-full', k === i ? 'bg-foreground' : 'bg-[#dcdcd8]')} />
          ))}
        </div>
        <div className="flex-1" />
        {i > 0 && (
          <Button variant="outline" className={pill} onClick={() => setI(i - 1)}>{o.prev}</Button>
        )}
        {!last && (
          <Button className={cn(pill, 'px-[18px]')} onClick={() => setI(i + 1)}>{o.next}</Button>
        )}
        {last && (
          <>
            <Button variant="outline" className={pill} onClick={onFinish}>{o.later}</Button>
            <Button variant="outline" className={pill} onClick={async () => { await onFinish(); go('settings') }}>{o.configure}</Button>
            <Button className={cn(pill, 'px-[18px]')} onClick={async () => { await onFinish(); await startGuided() }}>{o.guided}</Button>
          </>
        )}
      </div>
    </>
  )
}

export function Onboarding() {
  const open = useRiver((s) => s.rulesOpen)
  const current = useRiver((s) => s.settings.locale)
  // 语言页的选择只在本地，结束引导时才写入；没选过就是预选值（bootstrap 之后才拿到）
  const [picked, setPicked] = useState<Locale | null>(null)
  const locale = picked ?? current
  const finish = () => finishOnboarding(locale)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish()}>
      <DialogContent
        showCloseButton={false}
        // 英文牌型名和例子更长，放不进 580 宽的两栏
        className={cn(
          'flex max-h-[calc(100%-40px)] max-w-[calc(100%-40px)] flex-col gap-[18px] overflow-auto rounded-[20px] px-8 pt-[30px] pb-6 shadow-[0_30px_80px_rgba(0,0,0,0.18)] ring-0',
          locale === 'en' ? 'w-[620px] sm:max-w-[620px]' : 'w-[580px] sm:max-w-[580px]'
        )}
      >
        <Pages locale={locale} onLocale={setPicked} onFinish={finish} />
      </DialogContent>
    </Dialog>
  )
}

// 入座被拦下：缺对手模型或教练模型时引导去设置（discussion §9）
export function NeedModelDialog() {
  const need = useRiver((s) => s.needModel)
  const close = () => setState({ needModel: null })
  const t = useT()
  const n = t.desktop.needModel
  return (
    <AlertDialog open={need !== null} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-semibold">{need === 'coach' ? n.coachTitle : n.opponentTitle}</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            {need === 'coach' ? n.coachDesc : n.opponentDesc}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">{t.desktop.btn.cancel}</AlertDialogCancel>
          <AlertDialogAction className="rounded-full" onClick={() => go('settings')}>{t.desktop.btn.goSettings}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
