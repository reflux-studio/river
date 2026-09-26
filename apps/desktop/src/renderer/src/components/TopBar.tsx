import { costText, fmt, useMoney } from '@/lib/format'
import { go, invoke, toastError, useRiver, useT, type Page } from '@/lib/river'
import { cn } from '@/lib/utils'

const mac = navigator.userAgent.includes('Mac')

const NAV: Page[] = ['lobby', 'table', 'opponents', 'replays', 'stats', 'settings']

export function TopBar({ page }: { page: Page }) {
  const view = useRiver((s) => s.view)
  const bankroll = useRiver((s) => s.bankroll)
  const update = useRiver((s) => s.update)
  const m = useMoney()
  const t = useT()
  const T = t.desktop.top
  const onTable = page === 'table'

  return (
    // mac 左侧留出系统红绿灯，其他平台右侧留出 titleBarOverlay 的窗口按钮；整条可拖动窗口，交互元素单独取消
    <header
      className={cn(
        'flex h-[52px] shrink-0 items-center gap-3 border-b bg-topbar [-webkit-app-region:drag]',
        mac ? 'pr-4 pl-[88px]' : 'pl-4'
      )}
      style={
        mac
          ? undefined
          : { paddingRight: 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 16px)' }
      }
    >
      <div className="flex shrink-0 items-center gap-1.5 text-base font-semibold">
        <img src="./river-icon.png" alt="" width={28} height={28} />
        River
      </div>
      <nav className="ml-1.5 flex min-w-0 gap-0.5 overflow-hidden [-webkit-app-region:no-drag]">
        {NAV.filter((k) => k !== 'table' || view).map((k) => (
          <button
            key={k}
            onClick={() => go(k)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm whitespace-nowrap',
              page === k ? 'bg-[#e9e9e6] font-semibold text-foreground' : 'text-label hover:bg-[#efefec]'
            )}
          >
            {t.desktop.nav[k]}
          </button>
        ))}
      </nav>
      <div className="flex-1" />
      {onTable ? (
        <div className="flex items-center gap-3.5 [-webkit-app-region:no-drag]">
          <div className="hidden text-sm font-medium whitespace-nowrap min-[1200px]:block">{view?.title}</div>
          <div className="text-sm whitespace-nowrap text-muted-foreground">{t.desktop.handNo(view?.handNo ?? 0)}</div>
          {view && (
            <button
              onClick={() => go('stats')}
              title={T.costTitle}
              className="flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-[5px] text-[13px] whitespace-nowrap"
            >
              <span className="size-1.5 rounded-full bg-[oklch(0.7_0.14_70)]" />
              <span className="text-muted-foreground">{T.thisTable}</span>
              <span className="font-semibold">{costText(view.cost, m, t)}</span>
            </button>
          )}
          <button
            onClick={() => invoke('table.leave').catch(toastError)}
            className="rounded-[9px] border border-input bg-white px-[13px] py-1.5 text-sm whitespace-nowrap hover:bg-accent"
          >
            {T.leave}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3.5 [-webkit-app-region:no-drag]">
          {update && !view && (
            <button
              onClick={() => invoke('update.install').catch(toastError)}
              className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-[5px] text-[13px] whitespace-nowrap text-white"
            >
              <span className="size-1.5 rounded-full bg-[oklch(0.75_0.15_150)]" />
              {T.update(update)}
            </button>
          )}
          <div className="flex items-baseline gap-1.5 text-sm whitespace-nowrap">
            <span className="text-muted-foreground">{T.bankroll}</span>
            <span className="font-semibold">{fmt(bankroll)}</span>
          </div>
        </div>
      )}
    </header>
  )
}
