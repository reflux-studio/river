import { costText, fmt } from '@/lib/format'
import { go, invoke, toastError, useRiver, type Page } from '@/lib/river'
import { cn } from '@/lib/utils'

const NAV: [Page, string][] = [
  ['lobby', '大厅'],
  ['table', '牌桌'],
  ['opponents', 'AI 对手'],
  ['replays', '手牌回放'],
  ['stats', '数据统计'],
  ['settings', '设置']
]

export function TopBar({ page }: { page: Page }) {
  const view = useRiver((s) => s.view)
  const bankroll = useRiver((s) => s.bankroll)
  const update = useRiver((s) => s.update)
  const onTable = page === 'table'

  return (
    // 左侧留出 hiddenInset 的系统红绿灯；整条可拖动窗口，交互元素单独取消
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b bg-topbar pr-4 pl-[88px] [-webkit-app-region:drag]">
      <div className="flex shrink-0 items-center gap-1.5 text-base font-semibold">
        <img src="./river-icon.png" alt="" width={28} height={28} />
        River
      </div>
      <nav className="ml-1.5 flex min-w-0 gap-0.5 overflow-hidden [-webkit-app-region:no-drag]">
        {NAV.filter(([k]) => k !== 'table' || view).map(([k, l]) => (
          <button
            key={k}
            onClick={() => go(k)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm whitespace-nowrap',
              page === k ? 'bg-[#e9e9e6] font-semibold text-foreground' : 'text-label hover:bg-[#efefec]'
            )}
          >
            {l}
          </button>
        ))}
      </nav>
      <div className="flex-1" />
      {onTable ? (
        <div className="flex items-center gap-3.5 [-webkit-app-region:no-drag]">
          <div className="hidden text-sm font-medium whitespace-nowrap min-[1200px]:block">{view?.title}</div>
          <div className="text-sm whitespace-nowrap text-muted-foreground">第 {view?.handNo ?? 0} 手</div>
          {view && (
            <button
              onClick={() => go('stats')}
              title="本桌 LLM 用量，点击查看明细"
              className="flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-[5px] text-[13px] whitespace-nowrap"
            >
              <span className="size-1.5 rounded-full bg-[oklch(0.7_0.14_70)]" />
              <span className="text-muted-foreground">本桌</span>
              <span className="font-semibold">{costText(view.cost)}</span>
            </button>
          )}
          <button
            onClick={() => invoke('table.leave').catch(toastError)}
            className="rounded-[9px] border border-input bg-white px-[13px] py-1.5 text-sm whitespace-nowrap hover:bg-accent"
          >
            离桌
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
              新版本 {update} 已就绪 · 重启更新
            </button>
          )}
          <div className="flex items-baseline gap-1.5 text-sm whitespace-nowrap">
            <span className="text-muted-foreground">筹码</span>
            <span className="font-semibold">{fmt(bankroll)}</span>
          </div>
        </div>
      )}
    </header>
  )
}
