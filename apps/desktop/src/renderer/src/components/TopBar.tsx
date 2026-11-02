import { go, invoke, toastError, useRiver, useT, type Page } from '@/lib/river'
import { cn } from '@/lib/utils'

const mac = navigator.userAgent.includes('Mac')

const NAV: Page[] = ['opponents', 'replays', 'stats', 'settings']

export function TopBar({ page }: { page: Page }) {
  const view = useRiver((s) => s.view)
  const update = useRiver((s) => s.update)
  const t = useT()
  const T = t.desktop.top

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
      {update && !view && (
        <button
          onClick={() => invoke('update.install').catch(toastError)}
          className="rounded-full bg-foreground px-3 py-1.5 text-sm text-white [-webkit-app-region:no-drag]"
        >
          {T.update(update)}
        </button>
      )}
    </header>
  )
}
